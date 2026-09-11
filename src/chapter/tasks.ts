/** Checkbox list item, e.g. `- [ ] repeat aloud` or `2. [x] done`. */
const TASK_LINE = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)([^\]])(\].*)$/;

/** Line offsets of every checkbox on a page, in the order they render. */
export function findTaskLines(pageText: string): number[] {
	const offsets: number[] = [];
	pageText.split('\n').forEach((line, index) => {
		if (TASK_LINE.test(line)) offsets.push(index);
	});
	return offsets;
}

/**
 * Rewrite a task line's marker. Returns null when the line is not a task,
 * which guards against writing to a line that has shifted underneath us.
 */
export function setTaskMark(line: string, checked: boolean): string | null {
	const match = TASK_LINE.exec(line);
	if (!match) return null;
	return `${match[1]}${checked ? 'x' : ' '}${match[3]}`;
}

/** A line in a file that a checkbox on the current page maps to. */
export interface WriteTarget {
	file: import('obsidian').TFile;
	line: number;
}

/**
 * Flip one checkbox in its file. Returns false when the target line is no
 * longer a task, which means the file moved underneath us and the click
 * should be reverted rather than written somewhere wrong.
 */
export async function writeTaskMark(
	vault: import('obsidian').Vault,
	target: WriteTarget,
	checked: boolean,
): Promise<boolean> {
	let written = false;
	await vault.process(target.file, (data) => {
		const lines = data.split('\n');
		const line = lines[target.line];
		if (line === undefined) return data;
		const updated = setTaskMark(line, checked);
		if (updated === null) return data;
		lines[target.line] = updated;
		written = true;
		return lines.join('\n');
	});
	return written;
}
