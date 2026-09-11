import { Page } from '../types';
import { PAGE_BREAK } from '../utils/constants';

/**
 * Split a chapter file into pages.
 *
 * A page ends where two or more dash lines sit one under the other:
 *
 * ```
 * ---
 * ---
 * ```
 *
 * A single dash line stays what it is everywhere else in markdown, a
 * horizontal rule, so a page may rule off a section without ending.
 *
 * Each page keeps the line number its first line had in `text`, offset by
 * `baseLine`, so a checkbox on a page can be written back to the right line.
 */
export function splitPages(text: string, baseLine = 0): Page[] {
	const lines = text.split('\n');
	const pages: Page[] = [];

	let start = baseLine;
	let current: string[] = [];

	for (let i = baseLine; i < lines.length; i++) {
		const run = breakRun(lines, i);
		if (run === 0) {
			current.push(lines[i] ?? '');
			continue;
		}
		pages.push(trimPage(current, start));
		current = [];
		// The whole run is one break, however many dash lines it is.
		i += run - 1;
		start = i + 1;
	}
	pages.push(trimPage(current, start));

	return pages.filter((page) => page.text !== '');
}

/** Length of the run of dash lines at `index`, or 0 when it is not a break. */
function breakRun(lines: string[], index: number): number {
	let end = index;
	while (PAGE_BREAK.test(lines[end] ?? '')) end++;
	const length = end - index;
	return length >= 2 ? length : 0;
}

/** Drop blank lines around a page, keeping `startLine` pointing at line one. */
function trimPage(lines: string[], startLine: number): Page {
	let first = 0;
	let last = lines.length;
	while (first < last && (lines[first] ?? '').trim() === '') first++;
	while (last > first && (lines[last - 1] ?? '').trim() === '') last--;
	return {
		text: lines.slice(first, last).join('\n'),
		startLine: startLine + first,
	};
}

/**
 * Remove a leading YAML frontmatter block so its closing `---` is not
 * mistaken for a page break. Returns the line the body starts on.
 */
export function stripFrontmatter(text: string): { text: string; offset: number } {
	const lines = text.split('\n');
	if ((lines[0] ?? '').trim() !== '---') return { text, offset: 0 };

	for (let i = 1; i < lines.length; i++) {
		if ((lines[i] ?? '').trim() === '---') {
			return { text: lines.slice(i + 1).join('\n'), offset: i + 1 };
		}
	}
	return { text, offset: 0 };
}
