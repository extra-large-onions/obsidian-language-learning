import {
	Debouncer,
	TAbstractFile,
	TFile,
	debounce,
	normalizePath,
} from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { chapterName, isChapterFile } from '../chapter/file';
import { splitPages, stripFrontmatter } from '../chapter/parser';
import { parseSentenceBlock } from '../sentence/parse';
import { SENTENCE_BLOCK_LANG } from '../utils/constants';
import { findFences } from '../utils/fences';
import { pageCardId, pageTitle, readPageId } from './page-card';

/**
 * Every card in the vault, and every word in those cards.
 *
 * A card is one page of a `.chapter.md` note. Its words are the dictionary
 * forms in the `korean` blocks on that page.
 *
 * This is derived from the notes and is never written down. It is built once
 * when the vault is ready and then kept up file by file, which is cheap
 * enough that there is nothing to invalidate, migrate, or repair.
 */

/** The index on disk. It is a cache: delete it and it is built again. */
const CACHE_FILE = '.cache/index.json';
const VERSION = 2;
const SAVE_DELAY = 2000;

/**
 * How often the queue of changed files is looked at. The setting decides
 * whether it is old enough to take, so changing it needs no rewiring.
 */
const TICK = 30000;

/** Where a card is written. */
export interface Place {
	path: string;
	/** Line the page starts on. */
	line: number;
	/** Which page of the chapter it is, from zero. */
	page: number;
}

export interface IndexedCard {
	id: string;
	/** The page's heading, first sentence, or first line. */
	title: string;
	/** True when the id is written on the page, not the hash of its text. */
	named: boolean;
	/** Dictionary forms on the page, as keys into the word index. */
	words: string[];
	/** Everywhere it is written. One page copied into two notes is one card. */
	places: Place[];
}

export interface IndexedWord {
	key: string;
	/** The form as it is written, for showing. */
	display: string;
	/** Word classes seen for it, in the order they were met. */
	pos: string[];
	cards: Set<string>;
}

interface Word {
	key: string;
	display: string;
	pos: string | null;
}

export class CardIndex {
	private readonly plugin: LanguageLearningPlugin;
	private cards = new Map<string, IndexedCard>();
	private words = new Map<string, IndexedWord>();
	/** Cards found in each file, so one file can be re-read on its own. */
	private byFile = new Map<string, string[]>();
	private listeners = new Set<() => void>();
	private built = false;
	/** Files that have changed and not yet been read. Null means it is gone. */
	private pending = new Map<string, TFile | null>();
	private swept = Date.now();
	private sweeping = false;
	/** What is on disk, so an unchanged index is not written again. */
	private saved = '';
	private readonly flush: Debouncer<[], void>;

	constructor(plugin: LanguageLearningPlugin) {
		this.plugin = plugin;
		this.flush = debounce(() => void this.save(), SAVE_DELAY, true);
	}

	/**
	 * Show the index from disk at once, then read the vault to be sure it is
	 * true. Edits made while Obsidian was closed are caught only by that
	 * second pass, so the file on disk is never trusted on its own.
	 */
	async start(): Promise<void> {
		await this.load();
		if (this.cards.size > 0) this.changed();
		await this.build();
	}

	/* --------------------------------------------------------- building --- */

	/** Read the vault once. Call it after layout, not during load. */
	async build(): Promise<void> {
		this.cards.clear();
		this.words.clear();
		this.byFile.clear();

		for (const file of this.plugin.app.vault.getMarkdownFiles()) {
			if (isChapterFile(file)) await this.read(file);
		}
		this.built = true;
		this.changed();
		this.flush();
	}

	/**
	 * Follow the vault, but at arm's length. Every save would otherwise be a
	 * read and a redraw, so a changed file is only noted here and read later,
	 * on the sweep - or at once when the cards are laid out, or you ask.
	 */
	watch(): void {
		const { vault } = this.plugin.app;
		this.plugin.registerEvent(vault.on('modify', (file) => this.queue(file)));
		this.plugin.registerEvent(vault.on('create', (file) => this.queue(file)));
		this.plugin.registerEvent(
			vault.on('delete', (file) => this.queueGone(file.path)),
		);
		this.plugin.registerEvent(
			vault.on('rename', (file, oldPath) => {
				this.queueGone(oldPath);
				this.queue(file);
			}),
		);
		this.plugin.registerInterval(
			window.setInterval(() => void this.sweep(), TICK),
		);
	}

	private queue(file: TAbstractFile): void {
		if (!(file instanceof TFile) || !isChapterFile(file)) return;
		this.pending.set(file.path, file);
	}

	/** A folder goes with everything under it. */
	private queueGone(path: string): void {
		this.pending.set(path, null);
		for (const known of this.byFile.keys()) {
			if (known.startsWith(`${path}/`)) this.pending.set(known, null);
		}
	}

	/** How many files are waiting to be read. */
	get waiting(): number {
		return this.pending.size;
	}

	/** Read the files that have changed. Called on the sweep, and on demand. */
	async refresh(force = false): Promise<void> {
		await this.sweep(force);
	}

	/** Read the whole vault again, for when the index looks wrong. */
	async rebuild(): Promise<void> {
		this.pending.clear();
		this.swept = Date.now();
		await this.build();
	}

	private async sweep(force = false): Promise<void> {
		if (this.sweeping || this.pending.size === 0) return;
		if (!force) {
			const minutes = this.plugin.settings.indexSweepMinutes;
			if (minutes <= 0) return;
			if (Date.now() - this.swept < minutes * 60000) return;
		}

		this.sweeping = true;
		this.swept = Date.now();
		const batch = [...this.pending];
		this.pending.clear();
		try {
			for (const [path, file] of batch) {
				if (file) await this.read(file);
				else this.forget(path);
			}
		} finally {
			this.sweeping = false;
		}
		this.changed();
		this.flush();
	}

	/** Re-read one file. What it held before is dropped first, so reading a
	 * file twice counts it once. */
	private async read(file: TFile): Promise<void> {
		this.forget(file.path);
		const text = await this.plugin.app.vault.cachedRead(file);
		const ids = splitPages(text, stripFrontmatter(text).offset).map(
			(page, index) =>
				this.add(page.text, {
					path: file.path,
					line: page.startLine,
					page: index,
				}),
		);
		if (ids.length > 0) this.byFile.set(file.path, ids);
	}

	/* ----------------------------------------------------------- tables --- */

	private add(text: string, place: Place): string {
		const id = pageCardId(text);
		const existing = this.cards.get(id);
		if (existing) {
			existing.places.push(place);
			return id;
		}

		const words = wordsOf(text);
		this.cards.set(id, {
			id,
			title: pageTitle(text) ?? `Page ${place.page + 1}`,
			named: readPageId(text) !== null,
			words: words.map((word) => word.key),
			places: [place],
		});

		for (const word of words) {
			const entry = this.words.get(word.key) ?? {
				key: word.key,
				display: word.display,
				pos: [],
				cards: new Set<string>(),
			};
			if (word.pos && !entry.pos.includes(word.pos)) entry.pos.push(word.pos);
			entry.cards.add(id);
			this.words.set(word.key, entry);
		}
		return id;
	}

	/** Drop what one file contributed, leaving the copies in other files. */
	private forget(path: string): void {
		const ids = this.byFile.get(path);
		if (!ids) return;
		this.byFile.delete(path);

		for (const id of ids) {
			const card = this.cards.get(id);
			if (!card) continue;
			card.places = card.places.filter((place) => place.path !== path);
			if (card.places.length > 0) continue;

			this.cards.delete(id);
			for (const key of card.words) {
				const word = this.words.get(key);
				if (!word) continue;
				word.cards.delete(id);
				if (word.cards.size === 0) this.words.delete(key);
			}
		}
	}

	/* ------------------------------------------------------------ reads --- */

	get ready(): boolean {
		return this.built;
	}

	allCards(): IndexedCard[] {
		return [...this.cards.values()];
	}

	card(id: string): IndexedCard | null {
		return this.cards.get(id) ?? null;
	}

	word(key: string): IndexedWord | null {
		return this.words.get(key) ?? null;
	}

	/** Words, most used first, then alphabetically. */
	allWords(): IndexedWord[] {
		return [...this.words.values()].sort(
			(a, b) => b.cards.size - a.cards.size || a.key.localeCompare(b.key),
		);
	}

	cardsFor(key: string): IndexedCard[] {
		const word = this.words.get(key);
		if (!word) return [];
		return [...word.cards]
			.map((id) => this.cards.get(id))
			.filter((card): card is IndexedCard => card !== undefined);
	}

	/* ------------------------------------------------------------- disk --- */

	private path(): string | null {
		const dir = this.plugin.manifest.dir;
		return dir ? normalizePath(`${dir}/${CACHE_FILE}`) : null;
	}

	/** Read the index back. Anything malformed is dropped, not repaired. */
	private async load(): Promise<void> {
		const path = this.path();
		if (!path) return;

		const { adapter } = this.plugin.app.vault;
		if (!(await adapter.exists(path))) return;

		const raw = await adapter.read(path);
		let data: unknown;
		try {
			data = JSON.parse(raw);
		} catch {
			return;
		}
		const file = data as Partial<CacheFile> | null;
		if (!file || file.version !== VERSION) return;

		for (const [id, value] of Object.entries(file.cards ?? {})) {
			const card = readCard(id, value);
			if (card) this.cards.set(id, card);
		}
		for (const [key, value] of Object.entries(file.tokens ?? {})) {
			const word = readWord(key, value, this.cards);
			if (word) this.words.set(key, word);
		}

		// The two tables above carry everything. The other two lookups exist
		// only for editing, and are turned back out of them here.
		for (const word of this.words.values()) {
			for (const id of word.cards) this.cards.get(id)?.words.push(word.key);
		}
		for (const card of this.cards.values()) {
			for (const place of card.places) {
				const ids = this.byFile.get(place.path) ?? [];
				ids.push(card.id);
				this.byFile.set(place.path, ids);
			}
		}
		this.saved = raw;
	}

	/** Write now, for plugin unload. */
	async saveNow(): Promise<void> {
		this.flush.cancel();
		await this.save();
	}

	private async save(): Promise<void> {
		const path = this.path();
		if (!path) return;

		const text = this.serialise();
		if (text === this.saved) return;

		const { adapter } = this.plugin.app.vault;
		const dir = path.slice(0, path.lastIndexOf('/'));
		if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
		await adapter.write(path, text);
		this.saved = text;
	}

	/**
	 * Two tables: the cards, and the words that point at them. One entry per
	 * line and in key order, so a vault synced by line can merge two of these
	 * and a diff shows what actually changed.
	 */
	private serialise(): string {
		const cards = [...this.cards.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(
				([id, card]) =>
					`\t\t${JSON.stringify(id)}: ${JSON.stringify({
						title: card.title,
						named: card.named || undefined,
						places: card.places,
					})}`,
			);
		const tokens = [...this.words.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(
				([key, word]) =>
					`\t\t${JSON.stringify(key)}: ${JSON.stringify({
						display: word.display === key ? undefined : word.display,
						pos: word.pos.length > 0 ? word.pos : undefined,
						cards: [...word.cards].sort(),
					})}`,
			);
		return (
			`{\n\t"version": ${VERSION},\n` +
			`\t"cards": {\n${cards.join(',\n')}\n\t},\n` +
			`\t"tokens": {\n${tokens.join(',\n')}\n\t}\n}\n`
		);
	}

	/* ---------------------------------------------------------- changes --- */

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private changed(): void {
		for (const listener of this.listeners) listener();
	}
}

/** Reads as `Lesson 3 p.2`. */
export function describePlace(place: Place): string {
	const name = place.path.split('/').pop() ?? place.path;
	return `${chapterName(name.replace(/\.md$/, ''))} p.${place.page + 1}`;
}

/** Reading order: by chapter, then by page. */
export function byPlace(a: IndexedCard, b: IndexedCard): number {
	const pa = a.places[0];
	const pb = b.places[0];
	if (!pa || !pb) return 0;
	return pa.path.localeCompare(pb.path) || pa.page - pb.page;
}

/* ------------------------------------------------------------- reading --- */

interface CacheFile {
	version: number;
	cards: Record<string, unknown>;
	tokens: Record<string, unknown>;
}

function readCard(id: string, value: unknown): IndexedCard | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	if (typeof record['title'] !== 'string') return null;

	const places = Array.isArray(record['places'])
		? record['places'].filter(isPlace)
		: [];
	if (places.length === 0) return null;

	return {
		id,
		title: record['title'],
		named: record['named'] === true,
		words: [],
		places,
	};
}

function isPlace(value: unknown): value is Place {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record['path'] === 'string' &&
		typeof record['line'] === 'number' &&
		typeof record['page'] === 'number'
	);
}

/** A word keeps only the cards that were read back; the rest are dropped. */
function readWord(
	key: string,
	value: unknown,
	cards: Map<string, IndexedCard>,
): IndexedWord | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;

	const ids = Array.isArray(record['cards'])
		? record['cards'].filter(
				(id): id is string => typeof id === 'string' && cards.has(id),
			)
		: [];
	if (ids.length === 0) return null;

	const pos = Array.isArray(record['pos'])
		? record['pos'].filter((one): one is string => typeof one === 'string')
		: [];
	return {
		key,
		display: typeof record['display'] === 'string' ? record['display'] : key,
		pos,
		cards: new Set(ids),
	};
}

/**
 * The dictionary forms in a page's annotated sentences, once each, marks
 * left out.
 */
function wordsOf(text: string): Word[] {
	const seen = new Map<string, Word>();
	for (const fence of findFences(text)) {
		if (fence.lang !== SENTENCE_BLOCK_LANG) continue;
		const body = text.slice(fence.bodyStart, fence.bodyEnd);
		for (const sentence of parseSentenceBlock(body)) {
			if (!sentence.annotated) continue;
			for (const { token } of sentence.placed) {
				if (token.pos === 'punct' || token.role === 'punct') continue;
				const display = token.lemma ?? token.t;
				const key = display.toLowerCase();
				if (key === '' || seen.has(key)) continue;
				seen.set(key, { key, display, pos: token.pos ?? null });
			}
		}
	}
	return [...seen.values()];
}
