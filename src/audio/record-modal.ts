import { App, ButtonComponent, Modal, Notice, setIcon } from 'obsidian';
import { Recording, VoiceRecorder, formatElapsed } from './recorder';

/**
 * Records as soon as it opens - the point of the command is speed - then
 * offers the take back for review before it is written to the vault.
 */
export class RecordModal extends Modal {
	private readonly recorder = new VoiceRecorder();
	private readonly onSave: (recording: Recording) => void | Promise<void>;

	private timerEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private ticker = 0;
	private previewUrl: string | null = null;
	private take: Recording | null = null;
	private saved = false;

	constructor(app: App, onSave: (recording: Recording) => void | Promise<void>) {
		super(app);
		this.onSave = onSave;
	}

	override onOpen(): void {
		this.setTitle('Record voice');
		this.modalEl.addClass('ll-record-modal');
		this.bodyEl = this.contentEl.createDiv({ cls: 'll-record' });
		void this.beginRecording();
	}

	override onClose(): void {
		this.stopTicker();
		this.recorder.cancel();
		this.releasePreview();
		this.contentEl.empty();
	}

	private async beginRecording(): Promise<void> {
		try {
			await this.recorder.start();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Could not record.');
			this.close();
			return;
		}
		this.renderRecording();
	}

	private renderRecording(): void {
		this.bodyEl.empty();
		this.releasePreview();

		const status = this.bodyEl.createDiv({ cls: 'll-record__status' });
		status.createDiv({ cls: 'll-record__dot' });
		this.timerEl = status.createSpan({ cls: 'll-record__timer', text: '0:00' });
		status.createSpan({ cls: 'll-record__hint', text: 'Recording' });

		this.startTicker();

		const actions = this.bodyEl.createDiv({ cls: 'll-record__actions' });
		const stop = new ButtonComponent(actions)
			.setCta()
			.setButtonText('Stop')
			.onClick(() => void this.finishRecording());
		setIcon(stop.buttonEl.createSpan({ cls: 'll-record__icon' }), 'square');
		stop.buttonEl.focus();

		new ButtonComponent(actions)
			.setButtonText('Discard')
			.onClick(() => this.close());
	}

	private async finishRecording(): Promise<void> {
		this.stopTicker();
		try {
			this.take = await this.recorder.stop();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Nothing recorded.');
			this.close();
			return;
		}
		this.renderReview();
	}

	private renderReview(): void {
		const take = this.take;
		if (!take) return;
		this.bodyEl.empty();

		this.releasePreview();
		this.previewUrl = URL.createObjectURL(take.blob);
		const audio = this.bodyEl.createEl('audio', { cls: 'll-record__preview' });
		audio.controls = true;
		audio.src = this.previewUrl;

		const actions = this.bodyEl.createDiv({ cls: 'll-record__actions' });
		const save = new ButtonComponent(actions)
			.setCta()
			.setButtonText('Save')
			.onClick(() => void this.commit());
		save.buttonEl.focus();

		new ButtonComponent(actions)
			.setButtonText('Record again')
			.onClick(() => void this.beginRecording());

		new ButtonComponent(actions)
			.setButtonText('Discard')
			.onClick(() => this.close());

		// Enter saves, so a quick take is two keys: Stop, Enter.
		this.scope.register([], 'Enter', (evt) => {
			evt.preventDefault();
			void this.commit();
			return false;
		});
	}

	private async commit(): Promise<void> {
		if (!this.take || this.saved) return;
		this.saved = true;
		const take = this.take;
		this.close();
		await this.onSave(take);
	}

	private startTicker(): void {
		this.stopTicker();
		this.ticker = window.setInterval(() => {
			this.timerEl.setText(formatElapsed(this.recorder.elapsed));
		}, 200);
	}

	private stopTicker(): void {
		if (this.ticker !== 0) window.clearInterval(this.ticker);
		this.ticker = 0;
	}

	private releasePreview(): void {
		if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
		this.previewUrl = null;
	}
}
