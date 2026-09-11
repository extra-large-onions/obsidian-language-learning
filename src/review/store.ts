import { Debouncer, Notice, debounce, normalizePath } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { ReviewState, cleanState } from './schedule';

/**
 * Review history, kept beside the plugin rather than in the notes.
 *
 * Checking a card would otherwise rewrite the note it sits in, which is the
 * same reason reading positions live outside the file. It has its own file
 * rather than sharing `data.json`, so a sync conflict over a review can never
 * take the settings with it.
 */

const FILE = 'reviews.json';
/** Where an unreadable file is put, so a bad parse never loses history. */
const BACKUP = 'reviews.broken.json';
const VERSION = 1;
const SAVE_DELAY = 800;

export class ReviewStore {
	private readonly plugin: LanguageLearningPlugin;
	private cards: Record<string, ReviewState> = {};
	private dirty = false;
	private readonly flush: Debouncer<[], void>;

	constructor(plugin: LanguageLearningPlugin) {
		this.plugin = plugin;
		this.flush = debounce(() => void this.save(), SAVE_DELAY, true);
	}

	/** Null when the plugin has no folder, which keeps the session in memory. */
	private path(name = FILE): string | null {
		const dir = this.plugin.manifest.dir;
		return dir ? normalizePath(`${dir}/${name}`) : null;
	}

	async load(): Promise<void> {
		const path = this.path();
		if (!path) return;

		const { adapter } = this.plugin.app.vault;
		if (!(await adapter.exists(path))) return;

		const raw = await adapter.read(path);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			await this.setAside(raw);
			return;
		}

		const cards = (parsed as { cards?: unknown } | null)?.cards;
		if (!cards || typeof cards !== 'object') return;
		for (const [id, value] of Object.entries(cards)) {
			const state = cleanState(value);
			if (state) this.cards[id] = state;
		}
	}

	/** Keep the bytes we could not read, and carry on with an empty history. */
	private async setAside(raw: string): Promise<void> {
		const backup = this.path(BACKUP);
		if (backup) await this.plugin.app.vault.adapter.write(backup, raw);
		new Notice(
			`Could not read your review history. It was kept as ${BACKUP}, and ` +
				'a new one was started.',
		);
	}

	get(id: string): ReviewState | null {
		return this.cards[id] ?? null;
	}

	set(id: string, state: ReviewState): void {
		this.cards[id] = state;
		this.dirty = true;
		this.flush();
	}

	/**
	 * Move a card's history to a new name, for when a block is given an id
	 * and its cards stop being known by their text. Never overwrites.
	 */
	rename(from: string, to: string): void {
		const state = this.cards[from];
		if (!state || from === to || this.cards[to]) return;
		this.cards[to] = state;
		delete this.cards[from];
		this.dirty = true;
		this.flush();
	}

	remove(id: string): void {
		if (!(id in this.cards)) return;
		delete this.cards[id];
		this.dirty = true;
		this.flush();
	}

	/** Every card with a history, for the review view and for pruning. */
	all(): Readonly<Record<string, ReviewState>> {
		return this.cards;
	}

	/** Write now, for plugin unload. */
	async saveNow(): Promise<void> {
		this.flush.cancel();
		await this.save();
	}

	private async save(): Promise<void> {
		const path = this.path();
		if (!path || !this.dirty) return;
		this.dirty = false;
		await this.plugin.app.vault.adapter.write(path, this.serialise());
	}

	/**
	 * One card per line, in id order. It is ordinary JSON, but a sync that
	 * merges by line can then merge two days of reviews instead of picking one.
	 */
	private serialise(): string {
		const lines = Object.keys(this.cards)
			.sort()
			.map((id) => `\t\t${JSON.stringify(id)}: ${JSON.stringify(this.cards[id])}`);
		return `{\n\t"version": ${VERSION},\n\t"cards": {\n${lines.join(',\n')}\n\t}\n}\n`;
	}
}
