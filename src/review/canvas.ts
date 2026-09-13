import { TFile } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { chapterName } from '../chapter/file';
import { splitPages, stripFrontmatter } from '../chapter/parser';
import { IndexedCard, Place, byPlace, describePlace } from './card-index';
import { pageCardId, stripPageId } from './page-card';
import {
	ReviewState,
	describeDue,
	describeLast,
	dueDay,
	dueIn,
	interval,
	lastDay,
	reps,
} from './schedule';

/**
 * Every card laid out on a canvas, the most overdue one first.
 *
 * It is the card list, built the way the index note is built: out of what the
 * index already knows, written as a file the rest of Obsidian understands.
 * Nothing here is a view of its own, so there is nothing to leave blank.
 *
 * Each card is a text node holding the page as it is written, under its
 * record: where it is, when it was last read, when it comes back, and the
 * words on it. The text is a copy, so the canvas is a picture of the
 * vault as it was when you asked for it - which is why the file is thrown
 * away when you close it rather than kept and mended.
 */

/** Where the canvas is written. It is overwritten and then deleted. */
export const CANVAS_PATH = 'Card review.canvas';

/** Cards on the canvas. Past a few hundred nodes it stops being readable. */
const MAX_CARDS = 200;

/** The grid. Rows are as tall as their tallest card, so the order is exact. */
const COLUMNS = 4;
const WIDTH = 420;
const GAP = 40;

/** Guessed from the text, since the real height is only known once drawn. */
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 720;
const LINE_HEIGHT = 26;
const CHARS_PER_LINE = 42;
const CHROME = 72;

interface CanvasNode {
	id: string;
	type: 'text';
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
}

export interface BuiltCanvas {
	json: string;
	count: number;
}

/** The canvas file, as text. Reads every chapter that holds a card once. */
export async function buildCardCanvas(
	plugin: LanguageLearningPlugin,
): Promise<BuiltCanvas> {
	const cards = order(plugin);
	const pages = await readPages(plugin, cards);
	const nodes: CanvasNode[] = [];

	let top = 0;
	for (let i = 0; i < cards.length; i += COLUMNS) {
		const row = cards.slice(i, i + COLUMNS);
		const texts = row.map((card, column) =>
			body(plugin, card, pages.get(card.id) ?? null, i + column),
		);
		const height = Math.max(...texts.map((text) => heightOf(text)));

		texts.forEach((text, column) => {
			const card = row[column];
			if (!card) return;
			nodes.push({
				id: nodeId(i + column),
				type: 'text',
				text,
				x: column * (WIDTH + GAP),
				y: top,
				width: WIDTH,
				height,
				color: colourFor(plugin, card),
			});
		});
		top += height + GAP;
	}

	return { json: serialise(nodes), count: nodes.length };
}

/* ------------------------------------------------------------- ordering --- */

/**
 * Most overdue first, then the pages not due yet, then the ones never read -
 * a page with no history has no date to be behind on, so it sits at the end
 * rather than pretending to be the most urgent thing in the vault.
 */
function order(plugin: LanguageLearningPlugin): IndexedCard[] {
	const read: { card: IndexedCard; days: number }[] = [];
	const fresh: IndexedCard[] = [];

	for (const card of plugin.index.allCards()) {
		const state = plugin.reviews.get(card.id);
		if (state) read.push({ card, days: dueIn(state) });
		else fresh.push(card);
	}
	read.sort((a, b) => a.days - b.days || byPlace(a.card, b.card));
	fresh.sort(byPlace);

	return [...read.map((entry) => entry.card), ...fresh].slice(0, MAX_CARDS);
}

/* ---------------------------------------------------------------- pages --- */

/** A page as it was read, and how many pages its chapter holds. */
interface PageRead {
	text: string;
	pages: number;
}

/**
 * The text of each card's page, keyed by card. A chapter is read once however
 * many of its pages are on the canvas.
 */
async function readPages(
	plugin: LanguageLearningPlugin,
	cards: IndexedCard[],
): Promise<Map<string, PageRead>> {
	const byPath = new Map<string, IndexedCard[]>();
	for (const card of cards) {
		const place = card.places[0];
		if (!place) continue;
		const group = byPath.get(place.path) ?? [];
		group.push(card);
		byPath.set(place.path, group);
	}

	const out = new Map<string, PageRead>();
	for (const [path, group] of byPath) {
		const file = plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) continue;

		const text = await plugin.app.vault.cachedRead(file);
		const pages = splitPages(text, stripFrontmatter(text).offset);
		const byId = new Map(pages.map((page) => [pageCardId(page.text), page.text]));

		for (const card of group) {
			// By id, and by where the index last saw it when the file has moved
			// on since - a stale page is better than a blank card.
			const hit = byId.get(card.id) ?? pages[card.places[0]?.page ?? 0]?.text;
			if (hit !== undefined) {
				out.set(card.id, { text: stripPageId(hit), pages: pages.length });
			}
		}
	}
	return out;
}

/* ----------------------------------------------------------------- node --- */

/** Words named on a card before the rest are counted instead. */
const WORDS_SHOWN = 8;

/**
 * The page's record, then the page itself.
 *
 * The record is a callout, so it reads as a label on the page rather than as
 * more of the page: Obsidian draws it boxed and tinted by how far behind the
 * card is, which the page's own text can never look like by accident.
 */
function body(
	plugin: LanguageLearningPlugin,
	card: IndexedCard,
	page: PageRead | null,
	index: number,
): string {
	const place = card.places[0];
	const label = card.title || (place ? describePlace(place) : card.id);
	const lines = [
		`**${index + 1}.** ${place ? link(plugin, card, place, label) : label}`,
		'',
		...record(plugin, card, place, page),
		'',
		'---',
		'',
		page && page.text !== '' ? page.text : '*The page could not be read.*',
	];
	return lines.join('\n');
}

/**
 * The callout: how the card stands as its title, and everything else known
 * about it under that, a fact to a line.
 *
 * Each line is its own paragraph within the callout, since a line break inside
 * a paragraph is not one everywhere markdown is read.
 */
function record(
	plugin: LanguageLearningPlugin,
	card: IndexedCard,
	place: Place | undefined,
	page: PageRead | null,
): string[] {
	const state = plugin.reviews.get(card.id);
	const rows: string[] = [];

	if (state) rows.push(dates(state));
	if (place) rows.push(whereLine(plugin, card, place, page));
	const words = wordLine(plugin, card);
	if (words) rows.push(words);
	const copies = copyLine(plugin, card);
	if (copies) rows.push(copies);

	const out = [`> [!${kind(state)}] ${standing(state)}`];
	for (const [at, row] of rows.entries()) {
		if (at > 0) out.push('>');
		out.push(`> ${row}`);
	}
	return out;
}

/** Reads as `Lesson 1 - p.2 of 12 - k3f9x2ab`. */
function whereLine(
	plugin: LanguageLearningPlugin,
	card: IndexedCard,
	place: Place,
	page: PageRead | null,
): string {
	const where = page
		? `p.${place.page + 1} of ${page.pages}`
		: `p.${place.page + 1}`;
	return [chapterLink(plugin, place), where, `\`${card.id}\``].join(' · ');
}

/**
 * The callout's title, which is the thing worth knowing first: `9 days late ·
 * 4x`, or `Never read` for a page with no history to describe.
 */
function standing(state: ReviewState | null): string {
	if (!state) return 'Never read';
	return `${describeDue(state)} · ${reps(state)}x`;
}

/**
 * The callout type, which is how Obsidian colours it: late is red, due today
 * is blue, waiting is grey-blue, and never read is plain.
 */
function kind(state: ReviewState | null): string {
	if (!state) return 'abstract';
	const days = dueIn(state);
	if (days < 0) return 'danger';
	if (days === 0) return 'todo';
	return 'note';
}

/** Reads as `read 3 days ago (2026-09-09) · due 2026-09-03 · every 6 days`. */
function dates(state: ReviewState): string {
	const day = lastDay(state);
	const last = describeLast(state).toLowerCase();
	return [
		// Far enough back and the description is the date already.
		last.includes(day) ? last : `${last} (${day})`,
		`due ${dueDay(state)}`,
		`every ${plural(interval(state), 'day')}`,
	].join(' · ');
}

/** The dictionary forms on the page, as the word index has them. */
function wordLine(
	plugin: LanguageLearningPlugin,
	card: IndexedCard,
): string | null {
	if (card.words.length === 0) return null;
	const shown = card.words
		.slice(0, WORDS_SHOWN)
		.map((key) => plugin.index.word(key)?.display ?? key);
	const rest = card.words.length - shown.length;
	return (
		`${plural(card.words.length, 'word')}: ${shown.join(', ')}` +
		(rest > 0 ? `, +${rest} more` : '')
	);
}

/** One page copied into two chapters is one card, so name the other places. */
function copyLine(
	plugin: LanguageLearningPlugin,
	card: IndexedCard,
): string | null {
	const copies = card.places.slice(1);
	if (copies.length === 0) return null;
	const where = copies.map((place) =>
		link(plugin, card, place, describePlace(place)),
	);
	return `Also on ${where.join(', ')}`;
}

/** The chapter the page is in, whole, rather than the page within it. */
function chapterLink(plugin: LanguageLearningPlugin, place: Place): string {
	const file = plugin.app.vault.getAbstractFileByPath(place.path);
	const target =
		file instanceof TFile
			? plugin.app.metadataCache.fileToLinktext(file, CANVAS_PATH, true)
			: place.path.replace(/\.md$/, '');
	const name = (place.path.split('/').pop() ?? place.path).replace(/\.md$/, '');
	return `[[${target}|${chapterName(name).replace(/[[\]|]/g, '')}]]`;
}

function plural(value: number, noun: string): string {
	return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/** Late is red, due today orange, waiting green, never read left plain. */
function colourFor(
	plugin: LanguageLearningPlugin,
	card: IndexedCard,
): string | undefined {
	const state = plugin.reviews.get(card.id);
	if (!state) return undefined;
	const days = dueIn(state);
	if (days < 0) return '1';
	if (days === 0) return '2';
	return '4';
}

/** A named page is linked by its id, so the link lands on the page itself. */
function link(
	plugin: LanguageLearningPlugin,
	card: IndexedCard,
	place: Place,
	label: string,
): string {
	const file = plugin.app.vault.getAbstractFileByPath(place.path);
	const target =
		file instanceof TFile
			? plugin.app.metadataCache.fileToLinktext(file, CANVAS_PATH, true)
			: place.path.replace(/\.md$/, '');
	const subpath = card.named ? `#^${card.id}` : '';
	return `[[${target}${subpath}|${label.replace(/[[\]|]/g, '')}]]`;
}

/** Long enough for the page, within reason. Canvas clips what does not fit. */
function heightOf(text: string): number {
	let lines = 0;
	for (const line of text.split('\n')) {
		lines += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));
	}
	const wanted = lines * LINE_HEIGHT + CHROME;
	return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, wanted));
}

/**
 * The file, written the way Obsidian writes a canvas: one node to a line,
 * tab indented. It is ordinary canvas JSON and nothing reads it but Obsidian.
 */
function serialise(nodes: CanvasNode[]): string {
	const lines = nodes.map((node) => `\t\t${JSON.stringify(node)}`);
	return `{\n\t"nodes":[\n${lines.join(',\n')}\n\t],\n\t"edges":[]\n}\n`;
}

/** Canvas ids are sixteen hex characters. Ours only have to be unique here. */
function nodeId(index: number): string {
	return index.toString(16).padStart(16, '0');
}
