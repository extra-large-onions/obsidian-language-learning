/**
 * Block ids, written as a plain line on top of a block:
 *
 *     ```korean
 *     id: k3f9x2ab
 *     {"text": ...}
 *     ```
 *
 * The id is metadata, not content: it sits above the model's JSON rather than
 * inside it, so nothing the model wrote is ever edited.
 */

/** `id: k3f9x2ab`, at the top of a block, before anything else. */
const ID_LINE = /^[ \t]*id[ \t]*:[ \t]*(\S+)[ \t]*$/;
/** Any other `key: value` line, which may sit above the id. */
const CONFIG_LINE = /^[ \t]*[A-Za-z][\w-]*[ \t]*:[ \t]*.*$/;

const ID_LENGTH = 8;

/** A short, stable name. Random rather than derived, so editing keeps it. */
export function newBlockId(): string {
	let id = '';
	while (id.length < ID_LENGTH) {
		id += Math.random().toString(36).slice(2);
	}
	return id.slice(0, ID_LENGTH);
}

/** The id written on a block, if it has one. */
export function readBlockId(body: string): string | null {
	for (const line of body.split('\n')) {
		if (line.trim() === '') continue;
		const match = ID_LINE.exec(line);
		if (match) return match[1] ?? null;
		// Config may come in any order, but the block's content ends the search.
		if (!CONFIG_LINE.test(line)) return null;
	}
	return null;
}

/**
 * Put an id on a block. Returns null when it already has one, so a block is
 * only ever named once.
 */
export function withBlockId(body: string, id: string): string | null {
	if (readBlockId(body) !== null) return null;
	return `id: ${id}\n${body.replace(/^\n+/, '')}`;
}
