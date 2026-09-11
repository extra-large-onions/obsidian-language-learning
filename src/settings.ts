import { App, PluginSettingTab, Setting } from 'obsidian';
import type { ImageFormat } from './images/compress';
import {
	COLOURABLE_ROLES,
	DEFAULT_ROLE_COLOURS,
	roleLabel,
} from './sentence/palette';
import type LanguageLearningPlugin from './main';

export interface LanguageLearningSettings {
	/** Keep each chapter on the page the reader left off on. */
	rememberPosition: boolean;
	/** Render the page on a paper-like surface. */
	paperLook: boolean;
	/** Offer the `/` menu while typing in an editor. */
	enableSlashCommands: boolean;
	/** Filename prefix for saved recordings. */
	recordingPrefix: string;
	/** Vault folder that exports are written into. */
	exportFolder: string;
	/** Scale pasted and dropped images down before they are saved. */
	compressPastedImages: boolean;
	/** Longest edge a saved image may have, in pixels. */
	imageMaxEdge: number;
	/** Encoder quality, from 40 to 100. */
	imageQuality: number;
	/** Container the scaled image is written in. */
	imageFormat: ImageFormat;
	/** Language of the sentences you study. */
	sentenceLanguage: string;
	/** Language the notes are written in. */
	learnerLanguage: string;
	/** Show the review line under each sentence. */
	showReviewControls: boolean;
	/** Minutes between sweeps of the changed files. Zero waits to be asked. */
	indexSweepMinutes: number;
	/** Role colours the user changed. Untouched roles are not listed. */
	roleColours: Record<string, string>;
}

export const DEFAULT_SETTINGS: LanguageLearningSettings = {
	rememberPosition: true,
	paperLook: true,
	enableSlashCommands: true,
	recordingPrefix: 'Recording',
	exportFolder: 'Exports',
	compressPastedImages: true,
	imageMaxEdge: 1280,
	imageQuality: 80,
	imageFormat: 'webp',
	sentenceLanguage: 'Korean',
	learnerLanguage: 'English',
	showReviewControls: true,
	indexSweepMinutes: 2,
	roleColours: {},
};

export class LanguageLearningSettingTab extends PluginSettingTab {
	plugin: LanguageLearningPlugin;

	constructor(app: App, plugin: LanguageLearningPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Remember reading position')
			.setDesc(
				'Reopen each .chapter.md note on the page you left off on. The ' +
					'position follows the file when you rename it.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.rememberPosition)
					.onChange(async (value) => {
						this.plugin.settings.rememberPosition = value;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Paper look')
			.setDesc('Render pages on a paper-like surface with a soft shadow.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.paperLook)
					.onChange(async (value) => {
						this.plugin.settings.paperLook = value;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl).setName('Voice').setHeading();

		new Setting(containerEl)
			.setName('Slash commands')
			.setDesc(
				'Type / in an editor for quick access to the recorder and the ' +
					'other actions.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSlashCommands)
					.onChange(async (value) => {
						this.plugin.settings.enableSlashCommands = value;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Recording filename prefix')
			.setDesc(
				'Recordings are saved to your attachment folder as ' +
					'"<prefix> 2026-08-29 14.32.05".',
			)
			.addText((text) =>
				text
					.setPlaceholder('Recording')
					.setValue(this.plugin.settings.recordingPrefix)
					.onChange(async (value) => {
						this.plugin.settings.recordingPrefix =
							value.trim() || 'Recording';
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl).setName('Export').setHeading();

		new Setting(containerEl)
			.setName('Export folder')
			.setDesc('Vault folder that exported bundles are written into.')
			.addText((text) =>
				text
					.setPlaceholder('Exports')
					.setValue(this.plugin.settings.exportFolder)
					.onChange(async (value) => {
						this.plugin.settings.exportFolder =
							value.trim().replace(/^\/+|\/+$/g, '') || 'Exports';
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl).setName('Images').setHeading();

		new Setting(containerEl)
			.setName('Compress pasted images')
			.setDesc(
				'Scale images down as you paste or drop them into a note. GIF and ' +
					'SVG files stay as they are.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.compressPastedImages)
					.onChange(async (value) => {
						this.plugin.settings.compressPastedImages = value;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Maximum image size')
			.setDesc(
				'Longest edge in pixels. At 1280, a 1080p screenshot becomes 720p. ' +
					'A smaller image is never scaled up.',
			)
			.addSlider((slider) =>
				slider
					.setLimits(480, 3840, 160)
					.setValue(this.plugin.settings.imageMaxEdge)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.imageMaxEdge = value;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Image quality')
			.setDesc('Lower values give smaller files. Subtitles stay sharp at 80.')
			.addSlider((slider) =>
				slider
					.setLimits(40, 100, 5)
					.setValue(this.plugin.settings.imageQuality)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.imageQuality = value;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Image format')
			.setDesc('Use JPEG only if other software cannot read the smaller format.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('webp', 'WEBP')
					.addOption('jpeg', 'JPEG')
					.setValue(this.plugin.settings.imageFormat)
					.onChange(async (value) => {
						this.plugin.settings.imageFormat = value as ImageFormat;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl).setName('Sentence').setHeading();

		new Setting(containerEl)
			.setName('Sentence language')
			.setDesc('The language you study. It goes into the prompt.')
			.addText((text) =>
				text
					.setPlaceholder('Korean')
					.setValue(this.plugin.settings.sentenceLanguage)
					.onChange(async (value) => {
						this.plugin.settings.sentenceLanguage =
							value.trim() || 'Korean';
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Note language')
			.setDesc('The language the model writes the notes in.')
			.addText((text) =>
				text
					.setPlaceholder('English')
					.setValue(this.plugin.settings.learnerLanguage)
					.onChange(async (value) => {
						this.plugin.settings.learnerLanguage =
							value.trim() || 'English';
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Review')
			.setDesc(
				'In a .chapter.md note, show how much of each sentence is likely ' +
					'to be left today and the buttons that check it. Elsewhere a ' +
					'korean block is just read. Your history is kept in ' +
					'reviews.json beside this plugin, so checking a card never ' +
					'rewrites your note.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showReviewControls)
					.onChange(async (value) => {
						this.plugin.settings.showReviewControls = value;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Reindex every')
			.setDesc(
				'How long a changed note waits before the index reads it again. ' +
					'The card list also catches up the moment you open it, and ' +
					'"Rebuild the card index" reads the whole vault. At 0 minutes ' +
					'the index only updates when you ask.',
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 30, 1)
					.setValue(this.plugin.settings.indexSweepMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.indexSweepMinutes = value;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Role colours')
			.setDesc(
				'A colour set here is used in both light and dark mode. The ' +
					'defaults change with the theme.',
			)
			.setHeading()
			.addExtraButton((button) =>
				button
					.setIcon('rotate-ccw')
					.setTooltip('Restore the defaults')
					.onClick(async () => {
						this.plugin.settings.roleColours = {};
						this.plugin.applyRoleColours();
						await this.plugin.savePluginData();
						this.display();
					}),
			);

		for (const role of COLOURABLE_ROLES) {
			const fallback = DEFAULT_ROLE_COLOURS[role] ?? '#888888';
			new Setting(containerEl)
				.setName(roleLabel(role))
				.addColorPicker((picker) =>
					picker
						.setValue(this.plugin.settings.roleColours[role] ?? fallback)
						.onChange(async (value) => {
							this.plugin.settings.roleColours[role] = value;
							this.plugin.applyRoleColours();
							await this.plugin.savePluginData();
						}),
				)
				.addExtraButton((button) =>
					button
						.setIcon('rotate-ccw')
						.setTooltip('Restore the default')
						.onClick(async () => {
							delete this.plugin.settings.roleColours[role];
							this.plugin.applyRoleColours();
							await this.plugin.savePluginData();
							this.display();
						}),
				);
		}
	}
}
