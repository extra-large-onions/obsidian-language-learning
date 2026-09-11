import { Notice, TFile, normalizePath } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { IndexedCard, Place } from '../review/card-index';
import { SENTENCE_BLOCK_LANG } from '../utils/constants';
import { findFences, lineAt } from '../utils/fences';

/**
 * Write the index out as a note.
 *
 * The card list is a view, which means it is only there while the plugin is.
 * This is the same two tables as plain markdown: it survives sync, opens on a
 * phone, and can be linked to like anything else in the vault.
 */

/** Where the note goes. It is rewritten whole, so nothing else may live in it. */
const NOTE_PATH = 'Card index.md';

/** What Obsidian accepts after a `^`. Anything else cannot be linked to. */
const ANCHOR = /^[A-Za-z0-9-]+$/;

export async function writeIndexNote(
	plugin: LanguageLearningPlugin,
): Promise<void> {
	if (!plugin.index.ready) {
		new Notice('Still reading your vault. Try again in a moment.');
		return;
	}
	// Take anything edited since the last sweep, so the note is not a step behind.
	await plugin.index.refresh(true);

	const cards = plugin.index.allCards();
	if (cards.length === 0) {
		new Notice('No cards to write. Annotate a sentence first.');
		return;
	}

	const anchored = await stampAnchors(plugin, cards);
	const text = buildNote(plugin, cards, anchored);

	const { vault } = plugin.app;
	const path = normalizePath(NOTE_PATH);
	const existing = vault.getAbstractFileByPath(path);
	const file =
		existing instanceof TFile
			? (await vault.modify(existing, text), existing)
			: await vault.create(path, text);

	new Notice(`Wrote ${cards.length} cards to ${path}.`);
	await plugin.app.workspace.getLeaf(false).openFile(file);
}

/* ---------------------------------------------------------------- links --- */

/**
 * The name a card's block can be linked to. Sentences after the first in a
 * block are filed as `block#2`, and share the block's anchor: there is one
 * block to jump to either way.
 */
function anchorOf(card: IndexedCard): string | null {
	const base = card.id.split('#')[0] ?? '';
	return ANCHOR.test(base) ? base : null;
}

/**
 * Obsidian jumps to `#^name` only where the note carries that marker, so put
 * one under each block. Returns the places that now have one.
 *
 * Blocks are matched by the line the index found them on. One that has moved
 * since is left alone rather than guessed at - the link falls back to the
 * note, and the next rebuild picks it up.
 */
async function stampAnchors(
	plugin: LanguageLearningPlugin,
	cards: IndexedCard[],
): Promise<Set<string>> {
	const wanted = new Map<string, Map<number, string>>();
	for (const card of cards) {
		const anchor = anchorOf(card);
		if (!anchor) continue;
		for (const place of card.places) {
			if (!place.path.endsWith('.md')) continue;
			const lines = wanted.get(place.path) ?? new Map<number, string>();
			lines.set(place.line, anchor);
			wanted.set(place.path, lines);
		}
	}

	const done = new Set<string>();
	const { vault } = plugin.app;
	for (const [path, lines] of wanted) {
		const file = vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) continue;

		let placed: string[] = [];
		await vault.process(file, (data) => {
			const result = addAnchors(data, lines);
			placed = result.placed;
			return result.text;
		});
		for (const anchor of placed) done.add(`${path}#${anchor}`);
	}
	return done;
}

/** Put `^name` under each named block, and say which blocks now have one. */
export function addAnchors(
	text: string,
	wanted: Map<number, string>,
): { text: string; placed: string[] } {
	let out = text;
	const placed: string[] = [];

	// Last block first, so the offsets of the ones before it stay true.
	const fences = findFences(text)
		.filter((fence) => fence.lang === SENTENCE_BLOCK_LANG)
		.sort((a, b) => b.blockStart - a.blockStart);

	for (const fence of fences) {
		const anchor = wanted.get(lineAt(text, fence.blockStart));
		if (anchor === undefined) continue;
		placed.push(anchor);

		const marker = `\n^${anchor}`;
		if (out.startsWith(marker, fence.blockEnd)) continue;
		out = out.slice(0, fence.blockEnd) + marker + out.slice(fence.blockEnd);
	}
	return { text: out, placed };
}

/* ----------------------------------------------------------------- note --- */

function buildNote(
	plugin: LanguageLearningPlugin,
	cards: IndexedCard[],
	anchored: Set<string>,
): string {
	const words = plugin.index.allWords();
	const out: string[] = [];

	out.push('> [!note] Generated');
	out.push(
		`> Written by "Write the card index to a note" - ${cards.length} card${plural(cards.length)}, ${words.length} word${plural(words.length)}.`,
	);
	out.push('> Run it again after you add sentences; edits made here are lost.');
	out.push('');
	out.push('## Cards');
	out.push('');
	out.push('| Sentence | Meaning | Words | Where | ID |');
	out.push('| --- | --- | --- | --- | --- |');

	for (const card of [...cards].sort((a, b) => a.text.localeCompare(b.text))) {
		const where = card.places
			.map((place) => link(place, anchored, anchorOf(card)))
			.join('<br>');
		out.push(
			`| ${cell(card.text)} | ${cell(card.gloss)} | ${cell(card.words.join(', '))} | ${where} | \`${card.id}\` |`,
		);
	}

	out.push('');
	out.push('## Words');
	out.push('');
	out.push('| Word | Class | Cards | Sentences |');
	out.push('| --- | --- | --- | ---: |');
	for (const word of words) {
		const sentences = [...word.cards]
			.map((id) => cell(plugin.index.card(id)?.text ?? id))
			.join('<br>');
		out.push(
			`| ${cell(word.display)} | ${cell(word.pos.join(', '))} | ${word.cards.size} | ${sentences} |`,
		);
	}
	out.push('');
	return out.join('\n');
}

/** A link to the block when it could be marked, and to the note when not. */
function link(
	place: Place,
	anchored: Set<string>,
	anchor: string | null,
): string {
	const note = stemOf(place.path);
	return anchor !== null && anchored.has(`${place.path}#${anchor}`)
		? `[[${note}#^${anchor}\\|${note}]]`
		: `[[${note}\\|${note}]]`;
}

function stemOf(path: string): string {
	const name = path.split('/').pop() ?? path;
	return name.replace(/\.(md|canvas)$/, '');
}

/** A cell that cannot break the table it sits in. */
function cell(value: string | null): string {
	return (value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function plural(value: number): string {
	return value === 1 ? '' : 's';
}
