import { Keymap, parseLinktext } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { isChapterFile } from './file';
import { showAsChapter } from './toggle';

/**
 * Open `[[Lesson 1.chapter#^k3f9x2ab]]` in the reader, on that page.
 *
 * A chapter opens in the editor first and the reader is swapped in, and the
 * swap cannot see where the link was pointing. So a rendered link to a page
 * id is caught on its way in and opened in the reader directly. Any other
 * link is left to Obsidian.
 */
export function registerChapterLinks(plugin: LanguageLearningPlugin): void {
	plugin.registerDomEvent(
		activeDocument,
		'click',
		(evt) => {
			if (evt.button !== 0 || evt.defaultPrevented) return;
			const target = evt.target;
			if (!(target instanceof HTMLElement)) return;
			const link = target.closest<HTMLElement>('a.internal-link');
			const href = link?.getAttr('data-href') ?? link?.getAttr('href');
			if (!href) return;

			const { path, subpath } = parseLinktext(href);
			if (!subpath.startsWith('#^')) return;
			const source = plugin.app.workspace.getActiveFile()?.path ?? '';
			const file = plugin.app.metadataCache.getFirstLinkpathDest(path, source);
			if (!isChapterFile(file)) return;

			evt.preventDefault();
			evt.stopPropagation();
			const leaf = plugin.app.workspace.getLeaf(Keymap.isModEvent(evt));
			void showAsChapter(leaf, file, { subpath });
		},
		{ capture: true },
	);
}
