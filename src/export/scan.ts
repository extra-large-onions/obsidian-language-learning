import { findFences } from '../utils/fences';

export type RefKind = 'wiki' | 'markdown';

/** One embed found in markdown, with the exact span it occupies. */
export interface EmbedRef {
	kind: RefKind;
	/** Link target, with any alias, heading or block id stripped. */
	target: string;
	/** Alt text or alias, empty when there is none. */
	alias: string;
	start: number;
	end: number;
}

const WIKI_EMBED = /!\[\[([^\]\n]+)\]\]/g;
const MD_EMBED = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

interface Region {
	start: number;
	end: number;
}

/**
 * Every embed in `text` that points at something in the vault.
 *
 * Fenced code is skipped, because an embed inside a code sample is
 * documentation rather than content.
 */
export function findRefs(text: string): EmbedRef[] {
	const refs: EmbedRef[] = [];
	for (const region of scannableRegions(text)) {
		const slice = text.slice(region.start, region.end);
		collectWiki(slice, region.start, refs);
		collectMarkdown(slice, region.start, refs);
	}
	return refs.sort((a, b) => a.start - b.start);
}

function collectWiki(slice: string, base: number, out: EmbedRef[]): void {
	for (const match of slice.matchAll(WIKI_EMBED)) {
		const raw = match[1] ?? '';
		const [link = '', alias = ''] = splitAlias(raw);
		const target = stripSubpath(link);
		if (target === '') continue;
		out.push({
			kind: 'wiki',
			target,
			alias,
			start: base + (match.index ?? 0),
			end: base + (match.index ?? 0) + match[0].length,
		});
	}
}

function collectMarkdown(slice: string, base: number, out: EmbedRef[]): void {
	for (const match of slice.matchAll(MD_EMBED)) {
		const rawPath = (match[2] ?? '').trim().replace(/^<|>$/g, '');
		// Drop a trailing "title" and any #heading, then skip URLs and data URIs.
		const path = stripSubpath(rawPath.replace(/\s+"[^"]*"$/, ''));
		if (path === '' || EXTERNAL.test(path)) continue;
		out.push({
			kind: 'markdown',
			target: decodePath(path),
			alias: match[1] ?? '',
			start: base + (match.index ?? 0),
			end: base + (match.index ?? 0) + match[0].length,
		});
	}
}

/** Text spans worth scanning: everything outside fenced code. */
function scannableRegions(text: string): Region[] {
	const regions: Region[] = [];
	let cursor = 0;

	for (const fence of findFences(text)) {
		if (fence.blockStart > cursor) {
			regions.push({ start: cursor, end: fence.blockStart });
		}
		cursor = fence.blockEnd;
	}
	if (cursor < text.length) {
		regions.push({ start: cursor, end: text.length });
	}
	return regions;
}

function splitAlias(raw: string): [string, string] {
	const bar = raw.indexOf('|');
	if (bar === -1) return [raw.trim(), ''];
	return [raw.slice(0, bar).trim(), raw.slice(bar + 1).trim()];
}

/** Remove a `#heading` or `^block` suffix, keeping the file part. */
function stripSubpath(link: string): string {
	const hash = link.indexOf('#');
	return (hash === -1 ? link : link.slice(0, hash)).trim();
}

function decodePath(path: string): string {
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

/** Apply replacements right-to-left so earlier offsets stay valid. */
export function rewriteRefs(
	text: string,
	refs: EmbedRef[],
	replace: (ref: EmbedRef) => string | null,
): string {
	let out = text;
	for (const ref of [...refs].sort((a, b) => b.start - a.start)) {
		const replacement = replace(ref);
		if (replacement === null) continue;
		out = out.slice(0, ref.start) + replacement + out.slice(ref.end);
	}
	return out;
}
