import { debounce, Debouncer } from 'obsidian';
import type LanguageLearningPlugin from '../main';

/**
 * Reading positions, kept in plugin data rather than in the file so that
 * turning a page never rewrites the chapter.
 */
export class ChapterStateStore {
	private readonly plugin: LanguageLearningPlugin;
	private positions: Record<string, number>;
	private readonly flush: Debouncer<[], void>;

	constructor(
		plugin: LanguageLearningPlugin,
		positions: Record<string, number> = {},
	) {
		this.plugin = plugin;
		this.positions = positions;
		this.flush = debounce(() => void this.plugin.savePluginData(), 600, true);
	}

	getPositions(): Record<string, number> {
		return this.positions;
	}

	get(key: string): number {
		return this.positions[key] ?? 0;
	}

	/** Carry a chapter's position over when the file is renamed. */
	rename(from: string, to: string): void {
		const page = this.positions[from];
		if (page === undefined || from === to || this.positions[to] !== undefined) {
			return;
		}
		this.positions[to] = page;
		delete this.positions[from];
		this.flush();
	}

	set(key: string, page: number): void {
		if (!this.plugin.settings.rememberPosition) return;
		if (this.positions[key] === page) return;
		this.positions[key] = page;
		this.flush();
	}
}
