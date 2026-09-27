import { FuzzySuggestModal, Notice, TFile } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { MOVIE_EXTENSIONS } from '../utils/constants';

/** Pick a video in the vault and open it in the floating player. */
class MoviePickModal extends FuzzySuggestModal<TFile> {
	private readonly plugin: LanguageLearningPlugin;

	constructor(plugin: LanguageLearningPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.setPlaceholder('Pick a movie');
	}

	getItems(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((file) => MOVIE_EXTENSIONS.includes(file.extension.toLowerCase()))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.plugin.player.open(file);
	}
}

export function registerMovieCommands(plugin: LanguageLearningPlugin): void {
	const { player } = plugin;

	plugin.addCommand({
		id: 'movie-open',
		name: 'Open a movie in the floating player',
		callback: () => new MoviePickModal(plugin).open(),
	});

	plugin.addCommand({
		id: 'movie-open-current',
		name: 'Open this video in the floating player',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !MOVIE_EXTENSIONS.includes(file.extension.toLowerCase())) return false;
			if (!checking) player.open(file);
			return true;
		},
	});

	// These only mean something while a movie is open. Give them hotkeys to
	// drive the player without leaving the note.
	const whilePlaying = (id: string, name: string, run: () => void) =>
		plugin.addCommand({
			id,
			name,
			checkCallback: (checking) => {
				if (!player.isOpen) return false;
				if (!checking) run();
				return true;
			},
		});

	whilePlaying('movie-toggle-play', 'Movie: play or pause', () => player.togglePlay());
	whilePlaying('movie-previous-line', 'Movie: previous subtitle', () => player.previousLine());
	whilePlaying('movie-next-line', 'Movie: next subtitle', () => player.nextLine());
	whilePlaying('movie-replay-line', 'Movie: replay this subtitle', () => player.replayLine());
	whilePlaying('movie-insert-moment', 'Movie: insert this moment into the note', () => {
		void player.insertReference().catch((error: unknown) => {
			console.error('Language learning: could not insert the moment', error);
			new Notice('Could not insert the moment.');
		});
	});
	whilePlaying('movie-insert-moment-thumbnail', 'Movie: insert this moment with a thumbnail', () => {
		void player.insertReference(true);
	});
	whilePlaying('movie-toggle-tab', 'Movie: switch between a tab and floating', () => player.toggleTab());
	whilePlaying('movie-close', 'Movie: close the player', () => player.close());
}
