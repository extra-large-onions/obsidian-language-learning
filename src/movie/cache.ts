import { normalizePath } from 'obsidian';
import type LanguageLearningPlugin from '../main';

/**
 * A folder under the cache folder set in the settings - `_cache/language-
 * learning` unless changed - made on first use. Thumbnails and extracted
 * subtitles live here: they can always be made again.
 */
export async function cacheFolder(
	plugin: LanguageLearningPlugin,
	name: string,
): Promise<string> {
	const dir = normalizePath(`${plugin.settings.cacheFolder}/${name}`);
	const adapter = plugin.app.vault.adapter;
	if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
	return dir;
}
