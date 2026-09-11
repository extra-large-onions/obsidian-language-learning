/** One fenced code block, in character offsets. */
export interface Fence {
	/** Language written after the opening fence, lowercased. */
	lang: string;
	/** First character of the body, just after the opening fence's newline. */
	bodyStart: number;
	/** One past the last character of the body. */
	bodyEnd: number;
	/** First character of the opening fence line. */
	blockStart: number;
	/** One past the last character of the closing fence line. */
	blockEnd: number;
}

/** Locate fenced code blocks, tolerating an unterminated final fence. */
export function findFences(text: string): Fence[] {
	const fences: Fence[] = [];
	const opener = /^[ \t]*(`{3,}|~{3,})[ \t]*([A-Za-z0-9_+-]*)/;
	let offset = 0;
	let open: {
		lang: string;
		marker: string;
		len: number;
		body: number;
		block: number;
	} | null = null;

	for (const line of text.split('\n')) {
		const lineEnd = offset + line.length;
		const match = opener.exec(line);
		if (match) {
			const marker = (match[1] ?? '').charAt(0);
			const len = (match[1] ?? '').length;
			const lang = (match[2] ?? '').toLowerCase();
			if (!open) {
				open = { lang, marker, len, body: lineEnd + 1, block: offset };
			} else if (marker === open.marker && len >= open.len && lang === '') {
				fences.push({
					lang: open.lang,
					bodyStart: open.body,
					bodyEnd: offset,
					blockStart: open.block,
					blockEnd: lineEnd,
				});
				open = null;
			}
		}
		offset = lineEnd + 1;
	}

	if (open) {
		fences.push({
			lang: open.lang,
			bodyStart: open.body,
			bodyEnd: text.length,
			blockStart: open.block,
			blockEnd: text.length,
		});
	}
	return fences;
}

/** The zero-based line an offset falls on. */
export function lineAt(text: string, offset: number): number {
	let line = 0;
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text.charAt(i) === '\n') line++;
	}
	return line;
}
