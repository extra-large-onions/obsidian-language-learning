import { AnnotatedSentence, AnnotatedToken } from './types';

/** A token, and where it sits in the sentence. */
export interface PlacedToken {
	token: AnnotatedToken;
	start: number;
	end: number;
}

/** Words of the gloss, and the tokens they translate. */
export interface GlossLink {
	start: number;
	end: number;
	/** Indexes into `placed`. More than one when tokens share the words. */
	tokens: number[];
}

export interface ParsedSentence {
	/** An id inside the JSON. Older blocks carry one; new ones do not. */
	id: string | null;
	/** False when the block was not JSON, and this is the plain text of it. */
	annotated: boolean;
	/** The sentence to draw. Always a string, even after a bad reply. */
	text: string;
	/** Tokens that were found in the sentence, in order. */
	placed: PlacedToken[];
	gloss: string | null;
	/** Spans of the gloss that belong to a token, in gloss order. */
	links: GlossLink[];
	alt: string | null;
	/** Markdown about the whole sentence. */
	note: string | null;
	/** What the parser ignored. Shown quietly under the sentence. */
	warnings: string[];
}

/**
 * How far the parser looks ahead for a token that does not sit where the
 * model said it does. A model sometimes drops a mark or splits a word.
 */
const MAX_SKIP = 24;

/**
 * Read a block, and ignore anything that is wrong.
 *
 * A block holds one sentence or a list of them, and always renders. Broken
 * JSON gives the plain text. A token that is not in its sentence is dropped,
 * and the rest still work. Nothing here throws, because a study note must not
 * turn into an error message.
 */
export function parseSentenceBlock(source: string): ParsedSentence[] {
	const raw = parseSentences(source);
	if (!raw) {
		const text = stripFence(source).trim();
		if (text === '') return [];
		return [
			{
				id: null,
				annotated: false,
				text,
				placed: [],
				gloss: null,
				links: [],
				alt: null,
				note: null,
				warnings: ['This block is not JSON.'],
			},
		];
	}
	return raw.map(readSentence);
}

/** Turn one model object into something the view can draw. */
function readSentence(raw: Partial<AnnotatedSentence>): ParsedSentence {
	const tokens = cleanTokens(raw.tokens);
	const text =
		typeof raw.text === 'string' && raw.text.trim() !== ''
			? raw.text
			: tokens.map((token) => token.t).join(' ');

	const aligned = align(text, tokens);
	const gloss = nonEmpty(raw.gloss);
	const linked = gloss ? link(gloss, aligned.placed) : { links: [], warnings: [] };
	return {
		id: typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id.trim() : null,
		annotated: true,
		text,
		placed: aligned.placed,
		gloss,
		links: linked.links,
		alt: nonEmpty(raw.alt),
		note: nonEmpty(raw.note),
		warnings: [...aligned.warnings, ...linked.warnings],
	};
}

/** A string worth showing, or null. */
function nonEmpty(value: unknown): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/* ---------------------------------------------------------------- json --- */

/**
 * Read the block as one sentence or as a list of them.
 *
 * The whole bracketed span is tried first, so a fence or a stray sentence
 * does no harm. When that fails, each `{...}` is read on its own: a model
 * sometimes forgets the brackets around a list, or breaks one object of it.
 */
function parseSentences(source: string): Partial<AnnotatedSentence>[] | null {
	const text = stripFence(source);
	const whole = readValue(widestSpan(text));
	if (whole) return whole;

	const parts: Partial<AnnotatedSentence>[] = [];
	for (const span of objectSpans(text)) {
		parts.push(...(readValue(text.slice(span.start, span.end)) ?? []));
	}
	return parts.length > 0 ? parts : null;
}

/** The text from the first bracket to the last one that closes its kind. */
function widestSpan(text: string): string {
	const start = text.search(/[[{]/);
	if (start === -1) return '';
	const end = text.lastIndexOf(text.charAt(start) === '[' ? ']' : '}');
	return end > start ? text.slice(start, end + 1) : '';
}

/**
 * Parse one span, and keep the objects in it. A list and a lone object are
 * one case. A span that parses to no sentence at all gives an empty list, so
 * an empty block stays empty instead of showing its own JSON back.
 */
function readValue(span: string): Partial<AnnotatedSentence>[] | null {
	if (span === '') return null;

	const value =
		tryParse(span) ??
		tryParse(dropTrailingCommas(span)) ??
		tryParse(dropTrailingCommas(escapeLineBreaks(span)));
	if (!value || typeof value !== 'object') return null;

	const entries = Array.isArray(value) ? value : [value];
	return entries.filter(
		(entry): entry is Partial<AnnotatedSentence> =>
			Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
	);
}

/** Where one object sits, as a slice of the source. */
interface ObjectSpan {
	start: number;
	/** One past the closing brace. */
	end: number;
}

/** Every balanced `{...}`, so one broken object does not lose the others. */
function objectSpans(text: string): ObjectSpan[] {
	const spans: ObjectSpan[] = [];
	let start = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = 0; i < text.length; i++) {
		const char = text.charAt(i);
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '{') {
			if (depth === 0) start = i;
			depth++;
		} else if (char === '}' && depth > 0) {
			depth--;
			if (depth === 0) spans.push({ start, end: i + 1 });
		}
	}
	return spans;
}

function tryParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** A model often wraps its reply in a fence. Take the inside. */
function stripFence(source: string): string {
	const fenced = /^\s*(?:`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?(?:`{3,}|~{3,})\s*$/.exec(
		source,
	);
	return fenced?.[1] ?? source;
}

/**
 * A line break inside a string is not JSON either, and a model writes one
 * in a long note. Escape the breaks that sit inside a string.
 */
function escapeLineBreaks(text: string): string {
	let out = '';
	let inString = false;
	let escaped = false;
	for (const char of text) {
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			else if (char === '\n') {
				out += '\\n';
				continue;
			} else if (char === '\r') continue;
		} else if (char === '"') {
			inString = true;
		}
		out += char;
	}
	return out;
}

/** `[1, 2,]` is not JSON, but it is what a model writes often enough. */
function dropTrailingCommas(text: string): string {
	return text.replace(/,(\s*[}\]])/g, '$1');
}

/* -------------------------------------------------------------- tokens --- */

/** Keep the tokens that carry a word. Drop every field that is the wrong type. */
function cleanTokens(value: unknown): AnnotatedToken[] {
	if (!Array.isArray(value)) return [];

	const tokens: AnnotatedToken[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const t = typeof record['t'] === 'string' ? record['t'].trim() : '';
		if (t === '') continue;

		const token: AnnotatedToken = { t };
		for (const key of ['pos', 'role', 'lemma', 'note', 'pron'] as const) {
			const field = record[key];
			if (typeof field === 'string' && field.trim() !== '') {
				token[key] = field.trim();
			}
		}
		if (token.role) token.role = token.role.toLowerCase();
		if (token.pos) token.pos = token.pos.toLowerCase();

		const tr = cleanTranslation(record['tr'] ?? record['translation']);
		if (tr.length === 1) token.tr = tr[0];
		else if (tr.length > 1) token.tr = tr;

		const group = record['group'];
		if (typeof group === 'number' && Number.isFinite(group)) {
			token.group = group;
		}
		tokens.push(token);
	}
	return tokens;
}

/** `tr` as a list of non-empty pieces. A string or a list of strings is fine. */
function cleanTranslation(value: unknown): string[] {
	const pieces = Array.isArray(value) ? value : [value];
	return pieces
		.filter((piece): piece is string => typeof piece === 'string')
		.map((piece) => piece.trim())
		.filter((piece) => piece !== '');
}

/* ------------------------------------------------------------- aligning --- */

/**
 * Find each token in the sentence, in order. This also gives the spacing for
 * free, so the sentence is drawn from its own characters and never rebuilt.
 */
function align(
	text: string,
	tokens: AnnotatedToken[],
): { placed: PlacedToken[]; warnings: string[] } {
	const placed: PlacedToken[] = [];
	const warnings: string[] = [];
	let cursor = 0;

	for (const token of tokens) {
		while (cursor < text.length && /\s/.test(text.charAt(cursor))) cursor++;

		let start = -1;
		if (text.startsWith(token.t, cursor)) {
			start = cursor;
		} else {
			const found = text.indexOf(token.t, cursor);
			if (found !== -1 && found - cursor <= MAX_SKIP) start = found;
		}

		if (start === -1) {
			warnings.push(`"${token.t}" is not in the sentence here.`);
			continue;
		}
		placed.push({ token, start, end: start + token.t.length });
		cursor = start + token.t.length;
	}
	return { placed, warnings };
}

/* -------------------------------------------------------------- linking --- */

/**
 * Find each token's `tr` in the gloss. The gloss has its own word order, so
 * there is no cursor: each piece takes the first free place where it stands as
 * whole words. Two tokens that name the same words, like the two halves of a
 * split verb, share one place instead of failing.
 */
function link(
	gloss: string,
	placed: PlacedToken[],
): { links: GlossLink[]; warnings: string[] } {
	const links: GlossLink[] = [];
	const warnings: string[] = [];

	placed.forEach(({ token }, index) => {
		if (token.tr === undefined) return;
		const pieces = typeof token.tr === 'string' ? [token.tr] : token.tr;
		for (const piece of pieces) {
			const spot = findSpot(gloss, piece, links);
			if (!spot) {
				warnings.push(`"${piece}" is not in the translation.`);
				continue;
			}
			const shared = links.find(
				(other) => other.start === spot.start && other.end === spot.end,
			);
			if (shared) {
				if (!shared.tokens.includes(index)) shared.tokens.push(index);
			} else {
				links.push({ ...spot, tokens: [index] });
			}
		}
	});
	links.sort((a, b) => a.start - b.start);
	return { links, warnings };
}

/**
 * Where a piece goes: a free place first, then a place another token already
 * holds with the same words. Whole words beat a match inside a word, and the
 * exact case beats any case.
 */
function findSpot(
	gloss: string,
	piece: string,
	taken: GlossLink[],
): { start: number; end: number } | null {
	const lower = gloss.toLowerCase();
	const needle = piece.toLowerCase();
	const found: { start: number; end: number; rank: number }[] = [];

	for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + 1)) {
		const end = at + piece.length;
		let rank = 0;
		if (!isWholeWord(gloss, at, end)) rank += 2;
		if (gloss.slice(at, end) !== piece) rank += 1;
		found.push({ start: at, end, rank });
	}
	found.sort((a, b) => a.rank - b.rank || a.start - b.start);

	const free = found.find((spot) =>
		taken.every((link) => spot.end <= link.start || spot.start >= link.end),
	);
	if (free) return free;
	return (
		found.find((spot) =>
			taken.some((link) => link.start === spot.start && link.end === spot.end),
		) ?? null
	);
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWholeWord(text: string, start: number, end: number): boolean {
	return !WORD_CHAR.test(text.charAt(start - 1)) && !WORD_CHAR.test(text.charAt(end));
}
