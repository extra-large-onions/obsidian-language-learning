import { TFile } from 'obsidian';
import { CHAPTER_SUFFIX } from '../utils/constants';

/**
 * True for the notes this plugin reads a page at a time: `Lesson 1.chapter.md`.
 *
 * The mark is in the name rather than the extension, so a chapter is still a
 * markdown note - searchable, linkable, and readable in any Obsidian, with or
 * without this plugin.
 */
export function isChapterFile(file: TFile | null): file is TFile {
	return (
		file !== null &&
		file.extension === 'md' &&
		file.basename.endsWith(CHAPTER_SUFFIX)
	);
}

/** A chapter's name without the `.chapter` that marks it. */
export function chapterName(basename: string): string {
	return basename.endsWith(CHAPTER_SUFFIX)
		? basename.slice(0, -CHAPTER_SUFFIX.length)
		: basename;
}
