import { ItemView, TFile, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { MOVIE_PLAYER_VIEW_TYPE } from '../utils/constants';

interface TabState {
	file?: string;
	time?: number;
}

/**
 * A tab that holds the movie player instead of letting it float. The player
 * is the same one either way - it moves in and out of here, video and all -
 * so there is never more than one. The tab keeps the movie and the time in
 * the workspace layout, so it comes back after a restart, paused.
 */
export class MoviePlayerTab extends ItemView {
	private readonly plugin: LanguageLearningPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: LanguageLearningPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return MOVIE_PLAYER_VIEW_TYPE;
	}

	getDisplayText(): string {
		const { player } = this.plugin;
		return player.isHostedBy(this) ? player.currentMovie?.basename ?? 'Movie' : 'Movie';
	}

	getIcon(): string {
		return 'film';
	}

	override async onOpen(): Promise<void> {
		this.contentEl.addClass('ll-movie-tab');
		this.showEmpty();
	}

	override async onClose(): Promise<void> {
		// Closing the tab closes the movie. A move back to floating has
		// already taken the player out, so this does nothing then.
		const { player } = this.plugin;
		if (player.isHostedBy(this)) player.close(false);
	}

	/** Shown while the player is somewhere else. */
	showEmpty(): void {
		this.contentEl.empty();
		this.contentEl.createDiv({
			cls: 'll-movie-tab__empty',
			text: 'No movie here. Run "Open a movie in the floating player", then switch it into a tab.',
		});
	}

	/** Tell the tab header that the movie changed. */
	refreshTitle(): void {
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
	}

	override getState(): Record<string, unknown> {
		const { player } = this.plugin;
		const state: TabState = {};
		if (player.isHostedBy(this) && player.currentMovie) {
			state.file = player.currentMovie.path;
			state.time = player.currentTime;
		}
		return { ...super.getState(), ...state };
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		const { file, time } = (state ?? {}) as TabState;
		if (!file) return;
		const movie = this.app.vault.getAbstractFileByPath(file);
		// Only claim the player when it is free: a restored layout must not
		// pull a movie out of the floating window.
		if (movie instanceof TFile && !this.plugin.player.isOpen) {
			this.plugin.player.openIn(this, movie, time ?? 0);
		}
	}
}
