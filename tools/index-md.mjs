/**
 * Turn the card index into a note you can read in Obsidian.
 *
 *   node tools/index-md.mjs              write "Card index.md" at the vault root
 *   node tools/index-md.mjs --anchors    also stamp ^ids in the notes, so the
 *                                        links jump to the block, not the file
 *
 * The index is a cache the plugin writes; this only reads it, so the note is
 * as fresh as the last time the plugin swept the vault.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, '..');
const vault = resolve(pluginDir, '../../..');
const indexPath = join(pluginDir, '.cache', 'index.json');
const outPath = join(vault, 'Card index.md');
const anchors = process.argv.includes('--anchors');

if (!existsSync(indexPath)) {
	console.error(`No index at ${indexPath}. Open the plugin once so it builds.`);
	process.exit(1);
}
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const cards = Object.entries(index.cards ?? {});
const tokens = Object.entries(index.tokens ?? {});

/** A cell that cannot break the table it sits in. */
const cell = (value) =>
	String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

/** The note name Obsidian links by: no folders, no extension. */
const noteOf = (path) =>
	(path.split('/').pop() ?? path).replace(/\.(md|canvas)$/, '');

/** Which words each card holds, turned back out of the token table. */
const wordsOfCard = new Map();
for (const [key, token] of tokens) {
	for (const id of token.cards ?? []) {
		const list = wordsOfCard.get(id) ?? [];
		list.push(token.display ?? key);
		wordsOfCard.set(id, list);
	}
}

/* ------------------------------------------------------- block anchors --- */

/**
 * Obsidian jumps to `#^id` only when the note carries that marker, so put one
 * under each korean block. The plugin's own id is reused, which keeps the two
 * naming schemes in step and makes running this twice a no-op.
 */
function stamp() {
	const byFile = new Map();
	for (const [id, card] of cards) {
		for (const place of card.places ?? []) {
			if (!place.path.endsWith('.md')) continue;
			const list = byFile.get(place.path) ?? [];
			list.push({ id, line: place.line });
			byFile.set(place.path, list);
		}
	}

	let added = 0;
	for (const [path, places] of byFile) {
		const full = join(vault, path);
		if (!existsSync(full)) continue;
		const lines = readFileSync(full, 'utf8').split('\n');

		// Latest first, so inserting a line never moves the ones still to do.
		for (const { id, line } of places.sort((a, b) => b.line - a.line)) {
			const open = lines[line] ?? '';
			const fence = /^[ \t]*(`{3,}|~{3,})/.exec(open);
			if (!fence) continue;

			// Walk to the line that closes the block.
			let end = line + 1;
			for (; end < lines.length; end++) {
				const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(lines[end] ?? '');
				if (close && close[1][0] === fence[1][0] && close[1].length >= fence[1].length) break;
			}
			if (end >= lines.length) continue;
			if ((lines[end + 1] ?? '').trim() === `^${id}`) continue;

			lines.splice(end + 1, 0, `^${id}`);
			added++;
		}
		writeFileSync(full, lines.join('\n'), 'utf8');
	}
	return added;
}

const added = anchors ? stamp() : 0;

/**
 * Where a card is, as a link. With anchors it lands on the block itself, so
 * the line is left off: stamping moves it, and the anchor does not care.
 */
function where(place, id) {
	const note = noteOf(place.path);
	const label = place.line > 0 ? `${note}:${place.line + 1}` : note;
	return anchors && place.path.endsWith('.md')
		? `[[${note}#^${id}\\|${note}]]`
		: `[[${note}\\|${label}]]`;
}

/* ---------------------------------------------------------------- note --- */

const out = [];
out.push('> [!note] Generated');
out.push(
	`> \`node tools/index-md.mjs\` from \`.cache/index.json\` — ${cards.length} cards, ${tokens.length} words.`,
);
out.push('> Re-run it after you add sentences; editing this note by hand is lost.');
out.push('');
out.push('## Cards');
out.push('');
out.push('| Sentence | Meaning | Words | Where | ID |');
out.push('| --- | --- | --- | --- | --- |');
for (const [id, card] of cards.sort(([, a], [, b]) =>
	a.text.localeCompare(b.text),
)) {
	const words = (wordsOfCard.get(id) ?? []).join(', ');
	const places = (card.places ?? []).map((p) => where(p, id)).join('<br>');
	out.push(
		`| ${cell(card.text)} | ${cell(card.gloss)} | ${cell(words)} | ${places} | \`${id}\` |`,
	);
}

out.push('');
out.push('## Words');
out.push('');
out.push('| Word | Class | Cards | Sentences |');
out.push('| --- | --- | --- | ---: |');
const byUse = tokens.sort(
	([ka, a], [kb, b]) => (b.cards?.length ?? 0) - (a.cards?.length ?? 0) || ka.localeCompare(kb),
);
for (const [key, token] of byUse) {
	const ids = token.cards ?? [];
	const sentences = ids
		.map((id) => cell(index.cards?.[id]?.text ?? id))
		.join('<br>');
	out.push(
		`| ${cell(token.display ?? key)} | ${cell((token.pos ?? []).join(', '))} | ${ids.length} | ${sentences} |`,
	);
}
out.push('');

writeFileSync(outPath, out.join('\n'), 'utf8');
console.log(`Wrote ${outPath}`);
console.log(`${cards.length} cards, ${tokens.length} words`);
if (anchors) console.log(`${added} block anchors stamped`);
