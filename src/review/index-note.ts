import { TFile, debounce, normalizePath } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { IndexedCard, Place, describePlace } from './card-index';

/**
 * The index, written out as a note.
 *
 * It is where the whole index can be read at once: every card with its page,
 * its words and the days it was read, then every word with the pages it is
 * on. As plain markdown it survives sync, opens on a phone, and can be linked
 * to like anything else in the vault.
 */

/** Where the note goes. It is rewritten whole, so nothing else may live in it. */
export const INDEX_NOTE_PATH = 'Card index.md';

/** How long the note waits after the index settles, so a burst is one write. */
const WRITE_DELAY = 2000;

/** Writes one at a time, so two callers never both try to create the note. */
let writing: Promise<unknown> = Promise.resolve();

/**
 * Keep the note in step with the index. Each change the index reports is a
 * rewrite, and a rewrite that would change nothing is skipped, so a sweep
 * that found nothing new never touches the file.
 */
export function watchIndexNote(plugin: LanguageLearningPlugin): void {
	const write = debounce(() => void syncIndexNote(plugin), WRITE_DELAY, true);
	plugin.register(
		plugin.index.subscribe(() => {
			if (plugin.settings.keepIndexNote && plugin.index.ready) write();
		}),
	);
	plugin.register(() => write.cancel());
}

/**
 * Write the note if its text has changed. It is only created once there is a
 * card to put in it. Returns the note, or null when there is none.
 */
export function syncIndexNote(
	plugin: LanguageLearningPlugin,
): Promise<TFile | null> {
	const run = writing.then(() => write(plugin));
	writing = run.catch(() => undefined);
	return run;
}

async function write(plugin: LanguageLearningPlugin): Promise<TFile | null> {
	const { vault } = plugin.app;
	const path = normalizePath(INDEX_NOTE_PATH);
	const text = buildIndexNote(plugin);

	const existing = vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		if ((await vault.read(existing)) !== text) await vault.modify(existing, text);
		return existing;
	}
	// Something else by that name, like a folder, is left alone.
	if (existing || plugin.index.allCards().length === 0) return null;
	return vault.create(path, text);
}

/* ----------------------------------------------------------------- note --- */

export function buildIndexNote(plugin: LanguageLearningPlugin): string {
	const { index } = plugin;
	const cards = index.allCards().sort(byPlace);
	const words = index.allWords();
	const out: string[] = [];

	out.push('> [!note] Generated');
	out.push(
		`> Kept up to date by the Language learning plugin - ${count(cards.length, 'card')}, ${count(words.length, 'word')}.`,
	);
	out.push('> Edits made here are lost the next time it is written.');
	out.push('');
	out.push('## Cards');
	out.push('');
	out.push('| Card | Where | Words | Read | ID |');
	out.push('| --- | --- | --- | --- | --- |');

	for (const card of cards) {
		const where = card.places
			.map((place) => link(plugin, card, place, describePlace(place)))
			.join('<br>');
		const forms = card.words.map((key) => index.word(key)?.display ?? key);
		out.push(
			`| ${cell(card.title)} | ${where} | ${cell(forms.join(', '))} | ` +
				`${reviews(plugin, card)} | \`${card.id}\` |`,
		);
	}

	out.push('');
	out.push('## Words');
	out.push('');
	out.push('| Word | Class | Cards | Pages |');
	out.push('| --- | --- | ---: | --- |');
	for (const word of words) {
		const pages = index
			.cardsFor(word.key)
			.sort(byPlace)
			.map((card) => {
				const first = card.places[0];
				return first ? link(plugin, card, first, card.title) : cell(card.title);
			})
			.join('<br>');
		out.push(
			`| ${cell(word.display)} | ${cell(word.pos.join(', '))} | ${word.cards.size} | ${pages} |`,
		);
	}
	out.push('');
	return out.join('\n');
}

/**
 * A link to the page. A named page is linked by its id, which lands on the
 * page itself; one still known by its hash can only link to the chapter.
 */
function link(
	plugin: LanguageLearningPlugin,
	card: IndexedCard,
	place: Place,
	label: string,
): string {
	const file = plugin.app.vault.getAbstractFileByPath(place.path);
	const target =
		file instanceof TFile
			? plugin.app.metadataCache.fileToLinktext(file, INDEX_NOTE_PATH, true)
			: place.path.replace(/\.md$/, '');
	const subpath = card.named ? `#^${card.id}` : '';
	return `[[${target}${subpath}\\|${label.replace(/[[\]|]/g, '')}]]`;
}

/** Every day the page was read, so the note carries the record too. */
function reviews(
	plugin: LanguageLearningPlugin,
	card: IndexedCard,
): string {
	const state = plugin.reviews.get(card.id);
	if (!state) return '';
	return `${state.days.length}x ${state.days.join(', ')}`;
}

/** Reading order: by chapter, then by page. */
function byPlace(a: IndexedCard, b: IndexedCard): number {
	const pa = a.places[0];
	const pb = b.places[0];
	if (!pa || !pb) return 0;
	return pa.path.localeCompare(pb.path) || pa.page - pb.page;
}

/** A cell that cannot break the table it sits in. */
function cell(value: string | null): string {
	return (value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function count(value: number, noun: string): string {
	return `${value} ${noun}${value === 1 ? '' : 's'}`;
}
