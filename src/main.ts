import { Plugin, TFile } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	LanguageLearningSettings,
	LanguageLearningSettingTab,
} from './settings';
import { ChapterStateStore } from './chapter/state';
import { ChapterFileView, positionKey } from './chapter/view';
import { registerChapterToggle } from './chapter/toggle';
import { isChapterFile } from './chapter/file';
import { registerCommands } from './commands';
import { SlashSuggest } from './ui/slash-suggest';
import { registerImagePaste } from './images/paste';
import { registerChapterLinks } from './chapter/links';
import { CardIndex } from './review/card-index';
import { watchIndexNote } from './review/index-note';
import { ReviewStore } from './review/store';
import { registerCardCanvas } from './commands/open-canvas';
import {
	COLOURABLE_ROLES,
	roleVar,
	validColour,
} from './sentence/palette';
import { SentenceView } from './sentence/view';
import {
	CHAPTER_VIEW_TYPE,
	HOVER_SOURCE,
	MOVIE_BLOCK_LANG,
	MOVIE_PLAYER_VIEW_TYPE,
	SENTENCE_BLOCK_LANG,
} from './utils/constants';
import { PluginData } from './types';
import { MoviePlayer } from './movie/player';
import { SubtitleStore } from './movie/tracks';
import { MovieBlockView } from './movie/block';
import { MoviePlayerTab } from './movie/player-tab';

export default class LanguageLearningPlugin extends Plugin {
	settings!: LanguageLearningSettings;
	state!: ChapterStateStore;
	reviews!: ReviewStore;
	index!: CardIndex;
	subtitles!: SubtitleStore;
	player!: MoviePlayer;

	async onload() {
		await this.loadPluginData();

		this.reviews = new ReviewStore(this);
		await this.reviews.load();
		this.register(() => void this.reviews.saveNow());

		this.index = new CardIndex(this);
		watchIndexNote(this);
		// Reading every note is for after the vault is up, never during load.
		this.app.workspace.onLayoutReady(() => {
			this.index.watch();
			void this.index.start();
		});
		this.register(() => void this.index.saveNow());
		registerCardCanvas(this);

		// A .chapter.md note is read a page at a time; the header button opens
		// the same file in the normal editor, and back again.
		this.registerView(
			CHAPTER_VIEW_TYPE,
			(leaf) => new ChapterFileView(leaf, this),
		);
		registerChapterToggle(this);
		registerChapterLinks(this);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && isChapterFile(file)) {
					this.state.rename(positionKey(oldPath), positionKey(file.path));
				}
			}),
		);

		this.registerMarkdownCodeBlockProcessor(
			SENTENCE_BLOCK_LANG,
			(source, el, ctx) => {
				ctx.addChild(new SentenceView(this, source, el, ctx.sourcePath));
			},
		);

		// A floating movie player, and blocks that point at moments in it.
		this.subtitles = new SubtitleStore(this);
		this.player = new MoviePlayer(this);
		this.register(() => this.player.close(false));
		this.registerView(
			MOVIE_PLAYER_VIEW_TYPE,
			(leaf) => new MoviePlayerTab(leaf, this),
		);
		this.registerMarkdownCodeBlockProcessor(
			MOVIE_BLOCK_LANG,
			(source, el, ctx) => {
				ctx.addChild(new MovieBlockView(this, source, el, ctx.sourcePath));
			},
		);

		// Lets the Page preview core plugin show previews for links on a page.
		this.registerHoverLinkSource(HOVER_SOURCE, {
			display: 'Language learning',
			defaultMod: false,
		});

		this.registerEditorSuggest(new SlashSuggest(this));
		registerImagePaste(this);

		this.applyRoleColours();
		this.register(() => this.clearRoleColours());
		registerCommands(this);
		this.addSettingTab(new LanguageLearningSettingTab(this.app, this));
	}

	private async loadPluginData() {
		const data = (await this.loadData()) as Partial<PluginData> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
		// Object.assign copies the reference, so give this map its own object.
		this.settings.roleColours = { ...this.settings.roleColours };
		this.state = new ChapterStateStore(this, data?.positions ?? {});
	}

	/**
	 * Write the user's role colours onto the document. A role left alone keeps
	 * the stylesheet default, which follows the theme.
	 */
	applyRoleColours() {
		const { style } = document.body;
		for (const role of COLOURABLE_ROLES) {
			const colour = validColour(this.settings.roleColours[role]);
			if (colour) style.setProperty(roleVar(role), colour);
			else style.removeProperty(roleVar(role));
		}
	}

	private clearRoleColours() {
		for (const role of COLOURABLE_ROLES) {
			document.body.style.removeProperty(roleVar(role));
		}
	}

	async savePluginData() {
		const data: PluginData = {
			settings: this.settings,
			positions: this.state.getPositions(),
		};
		await this.saveData(data);
	}
}
