import { TFile } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { splitPages, stripFrontmatter } from '../chapter/parser';
import { parseSentenceBlock } from '../sentence/parse';
import { Page } from '../types';
import { PAGE_BREAK, SENTENCE_BLOCK_LANG } from '../utils/constants';
import { findFences } from '../utils/fences';
import { hashString } from '../utils/helpers';

/**
 * A card is one page of a chapter.
 *
 * Its history is filed under the block id written as the page's last line:
 *
 *     # Page 2
 *
 *     Some text for this page.
 *
 *     ^k3f9x2ab
 *
 * Obsidian hides that line when reading, and a link to it lands on the page,
 * so the name costs nothing to look at and doubles as the page's address.
 *
 * Until a page has one it is known by the hash of its text, so it still
 * reviews - it just forgets its history when edited. The id is written the
 * first time the page is checked, and the history moves across with it.
 */

/** `^k3f9x2ab`, alone on a line. Obsidian links to nothing else after a `^`. */
const PAGE_ID_LINE = /^[ \t]*\^([A-Za-z0-9-]+)[ \t]*$/;

const ID_LENGTH = 8;

/** Longest title shown for a page, in characters. */
const MAX_TITLE = 80;

/** A short, stable name. Random rather than derived, so editing keeps it. */
export function newPageId(): string {
	let id = '';
	while (id.length < ID_LENGTH) {
		id += Math.random().toString(36).slice(2);
	}
	return id.slice(0, ID_LENGTH);
}

/** The id written at the end of a page, if it has one. */
export function readPageId(text: string): string | null {
	const lines = text.split('\n');
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i] ?? '';
		if (line.trim() === '') continue;
		return PAGE_ID_LINE.exec(line)?.[1] ?? null;
	}
	return null;
}

/** The page without its id line, for drawing. */
export function stripPageId(text: string): string {
	if (readPageId(text) === null) return text;
	const lines = text.split('\n');
	dropBlankTail(lines);
	lines.pop();
	dropBlankTail(lines);
	return lines.join('\n');
}

/** What a page's history is filed under: its id, or the hash of its text. */
export function pageCardId(text: string): string {
	return readPageId(text) ?? hashString(text);
}

/**
 * What a page is called in lists: its first heading, else its first
 * annotated sentence, else its first line of prose.
 */
export function pageTitle(text: string): string | null {
	const body = stripPageId(text);
	const lines = proseLines(body);

	for (const line of lines) {
		const heading = /^#{1,6}[ \t]+(.+?)[ \t#]*$/.exec(line);
		if (heading?.[1]) return clip(heading[1]);
	}
	for (const fence of findFences(body)) {
		if (fence.lang !== SENTENCE_BLOCK_LANG) continue;
		const first = parseSentenceBlock(
			body.slice(fence.bodyStart, fence.bodyEnd),
		).find((sentence) => sentence.annotated && sentence.text.trim() !== '');
		if (first) return clip(first.text);
	}
	for (const line of lines) {
		if (/^!\[\[[^\]]*\]\]$/.test(line) || PAGE_BREAK.test(line)) continue;
		const text = line.replace(/^(?:[>*+-]|\d+[.)])[ \t]+/, '').trim();
		if (text !== '') return clip(text);
	}
	return null;
}

/* ------------------------------------------------------------- naming --- */

/** A page that was given a name, and what it was known by before. */
export interface Named {
	from: string;
	to: string;
}

/**
 * Write an id under each unnamed page that `pick` gives one to.
 *
 * The id goes after the page's last line, with a blank line above it so it
 * names the page's last block, and one below it when the page break follows
 * at once - `^id` directly over `---` would read as a heading.
 */
export function namePages(
	text: string,
	pick: (page: Page) => string | null,
): { text: string; named: Named[] } {
	const lines = text.split('\n');
	const named: Named[] = [];

	// Last page first, so the lines of the pages before it stay where they are.
	const pages = splitPages(text, stripFrontmatter(text).offset).reverse();
	for (const page of pages) {
		if (readPageId(page.text) !== null) continue;
		const id = pick(page);
		if (id === null) continue;

		const last = page.startLine + page.text.split('\n').length - 1;
		const insert = ['', `^${id}`];
		const next = lines[last + 1];
		if (next !== undefined && next.trim() !== '') insert.push('');
		lines.splice(last + 1, 0, ...insert);
		named.push({ from: hashString(page.text), to: id });
	}
	return { text: lines.join('\n'), named: named.reverse() };
}

/**
 * Name the card known by `hash` in the chapters it is written in, and move
 * its history to the new name. Returns the name, or null when no page with
 * that text was found - the file has changed since it was read, and the card
 * goes on under its hash.
 */
export async function nameCard(
	plugin: LanguageLearningPlugin,
	hash: string,
	paths: Iterable<string>,
): Promise<string | null> {
	const { vault } = plugin.app;
	const id = newPageId();
	let written = false;

	for (const path of new Set(paths)) {
		const file = vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) continue;
		await vault.process(file, (data) => {
			const result = namePages(data, (page) =>
				hashString(page.text) === hash ? id : null,
			);
			if (result.named.length === 0) return data;
			written = true;
			return result.text;
		});
	}
	if (!written) return null;
	plugin.reviews.rename(hash, id);
	return id;
}

/**
 * A card's name as a review line sees it: the hash until the first answer,
 * and the written id from then on. Asking twice while the name is being
 * written waits for the one write.
 */
export class CardName {
	private id: string;
	private named: boolean;
	private pending: Promise<string> | null = null;
	private readonly write: () => Promise<string | null>;

	constructor(id: string, named: boolean, write: () => Promise<string | null>) {
		this.id = id;
		this.named = named;
		this.write = write;
	}

	get current(): string {
		return this.id;
	}

	/** The name to file an answer under, written first when it is not yet. */
	settle(): Promise<string> {
		if (this.named) return Promise.resolve(this.id);
		this.pending ??= this.write().then((written) => {
			this.pending = null;
			if (written !== null) {
				this.id = written;
				this.named = true;
			}
			return this.id;
		});
		return this.pending;
	}
}

/* -------------------------------------------------------------- utils --- */

/** The page's lines outside code blocks, trimmed, blanks dropped. */
function proseLines(text: string): string[] {
	let prose = '';
	let cursor = 0;
	for (const fence of findFences(text)) {
		prose += text.slice(cursor, fence.blockStart);
		cursor = fence.blockEnd;
	}
	prose += text.slice(cursor);
	return prose
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !PAGE_ID_LINE.test(line));
}

function clip(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > MAX_TITLE ? `${flat.slice(0, MAX_TITLE - 1)}…` : flat;
}

function dropBlankTail(lines: string[]): void {
	while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') {
		lines.pop();
	}
}
