import { AnnotatedSentence, AnnotatedToken } from './types';

/** A token, and where it sits in the sentence. */
export interface PlacedToken {
	token: AnnotatedToken;
	start: number;
	end: number;
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
	return {
		id: typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id.trim() : null,
		annotated: true,
		text,
		placed: aligned.placed,
		gloss: typeof raw.gloss === 'string' && raw.gloss.trim() !== '' ? raw.gloss : null,
		warnings: aligned.warnings,
	};
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

	const value = tryParse(span) ?? tryParse(dropTrailingCommas(span));
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
		for (const key of ['pos', 'role', 'lemma', 'note'] as const) {
			const field = record[key];
			if (typeof field === 'string' && field.trim() !== '') {
				token[key] = field.trim();
			}
		}
		if (token.role) token.role = token.role.toLowerCase();
		if (token.pos) token.pos = token.pos.toLowerCase();

		const group = record['group'];
		if (typeof group === 'number' && Number.isFinite(group)) {
			token.group = group;
		}
		tokens.push(token);
	}
	return tokens;
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
