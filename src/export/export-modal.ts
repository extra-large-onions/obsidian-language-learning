import { ButtonComponent, Modal, Notice, Setting, TFile } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { Collected } from './collect';
import { ExportOptions, ExportResult, runExport } from './exporter';
import { inlinedSize } from './inline';
import { formatBytes } from '../utils/helpers';

/** Roughly where a single base64 file stops being pleasant to open. */
const INLINE_WARN_BYTES = 20 * 1024 * 1024;

export class ExportModal extends Modal {
	private readonly plugin: LanguageLearningPlugin;
	private readonly file: TFile;
	private readonly collected: Collected;

	private wantFolder = true;
	private wantInline: boolean;
	private readonly canInline: boolean;

	constructor(
		plugin: LanguageLearningPlugin,
		file: TFile,
		collected: Collected,
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.file = file;
		this.collected = collected;
		// A canvas file node points at a path; it cannot hold a data URI.
		this.canInline = file.extension !== 'canvas';
		this.wantInline = false;
	}

	override onOpen(): void {
		this.setTitle('Export current file');
		const { contentEl } = this;

		contentEl.createEl('p', {
			cls: 'll-export__summary',
			text: this.summary(),
		});

		new Setting(contentEl)
			.setName('Folder with attachments')
			.setDesc('The document plus an attachments folder beside it.')
			.addToggle((toggle) =>
				toggle.setValue(this.wantFolder).onChange((value) => {
					this.wantFolder = value;
				}),
			);

		const inline = new Setting(contentEl)
			.setName('Single file, attachments as base64')
			.addToggle((toggle) =>
				toggle
					.setValue(this.wantInline)
					.setDisabled(!this.canInline)
					.onChange((value) => {
						this.wantInline = value;
					}),
			);
		inline.setDesc(
			this.canInline
				? `One self-contained .md, about ${formatBytes(
						inlinedSize(this.collected.bytes),
					)}.`
				: 'Not available for a canvas: its nodes reference files by path.',
		);

		if (this.collected.bytes > INLINE_WARN_BYTES && this.canInline) {
			contentEl.createEl('p', {
				cls: 'll-export__warning',
				text: 'That is a large single file and may be slow to open.',
			});
		}
		if (this.collected.missing.length > 0) {
			contentEl.createEl('p', {
				cls: 'll-export__warning',
				text: `${this.collected.missing.length} link(s) resolved to nothing and will stay broken: ${this.collected.missing
					.slice(0, 3)
					.join(', ')}${this.collected.missing.length > 3 ? '…' : ''}`,
			});
		}

		const actions = contentEl.createDiv({ cls: 'll-export__actions' });
		new ButtonComponent(actions)
			.setCta()
			.setButtonText('Export')
			.onClick(() => void this.run());
		new ButtonComponent(actions)
			.setButtonText('Cancel')
			.onClick(() => this.close());
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private summary(): string {
		const { notes, attachments, bytes } = this.collected;
		const parts = [`${notes.length} linked note(s)`];
		parts.push(`${attachments.length} attachment(s)`);
		return `${this.file.name} plus ${parts.join(' and ')} (${formatBytes(bytes)}).`;
	}

	private async run(): Promise<void> {
		if (!this.wantFolder && !this.wantInline) {
			new Notice('Pick at least one export format.');
			return;
		}
		const options: ExportOptions = {
			folder: this.wantFolder,
			inline: this.wantInline && this.canInline,
			destination: this.plugin.settings.exportFolder,
		};
		this.close();

		try {
			const result = await runExport(this.app, this.collected, options);
			new Notice(describe(result), 8000);
		} catch (error) {
			console.error('Language learning: export failed', error);
			new Notice('Export failed. See the developer console for details.');
		}
	}
}

function describe(result: ExportResult): string {
	const lines: string[] = [];
	if (result.folderPath) lines.push(`Exported to ${result.folderPath}`);
	if (result.inlinePath) lines.push(`Exported to ${result.inlinePath}`);
	for (const warning of result.warnings.slice(0, 3)) {
		lines.push(warning);
	}
	if (result.missing.length > 0) {
		lines.push(`${result.missing.length} link(s) could not be resolved.`);
	}
	return lines.join('\n');
}
