import { Notice, TFile, setIcon } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { diskPath, probe } from './ffmpeg';
import { MEDIA_ERRORS, fixCommand, streamProblems } from './diagnose';
import { Cue, cueAt, cuePosition, nextCue, previousCue } from './subtitles';
import { SubtitleTrack } from './tracks';
import { insertMoment } from './moments';
import { ListHost, SubtitleList } from './subtitle-list';
import type { MoviePlayerTab } from './player-tab';
import { MOVIE_PLAYER_VIEW_TYPE } from '../utils/constants';

/** Room kept between the player and the window's edge, in pixels. */
const MARGIN = 8;

/** Height the line list adds under the video, in pixels. */
const LIST_HEIGHT = 240;

interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * A movie in a small window that floats over the workspace. It stays in
 * Obsidian's main window: drag it by its title, size it from the corner.
 * It can also move into a tab and back. There is one at a time, floating or
 * in a tab; opening another movie reuses it. Under the video is the list of
 * every subtitle line, which can be folded away.
 */
export class MoviePlayer implements ListHost {
	private readonly plugin: LanguageLearningPlugin;
	private rootEl: HTMLElement | null = null;
	private videoEl: HTMLVideoElement | null = null;
	private subtitleEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private positionEl: HTMLElement | null = null;
	private titleEl: HTMLElement | null = null;
	private trackSelect: HTMLSelectElement | null = null;
	private list: SubtitleList | null = null;
	/** Whether the line list is showing, kept across reopening. */
	private listOpen = true;
	/** The tab the player sits in, or null while it floats. */
	private host: MoviePlayerTab | null = null;
	/** Open the next movie in a tab, as the last one was. */
	private preferTab = false;
	private modeButton: HTMLElement | null = null;
	private cleanups: (() => void)[] = [];

	private movie: TFile | null = null;
	private cues: Cue[] = [];
	private shownCue: Cue | null = null;
	/** Where the window was, so a reopened player comes back to it. */
	private rect: Rect | null = null;

	constructor(plugin: LanguageLearningPlugin) {
		this.plugin = plugin;
	}

	get isOpen(): boolean {
		return this.rootEl !== null;
	}

	get currentMovie(): TFile | null {
		return this.movie;
	}

	get cueList(): Cue[] {
		return this.cues;
	}

	get currentTime(): number {
		return this.videoEl?.currentTime ?? 0;
	}

	isHostedBy(tab: MoviePlayerTab): boolean {
		return this.host === tab;
	}

	/**
	 * Open `movie`, or seek the one already open, and play from `time`. A new
	 * player floats, or goes into a tab if that is where the last one was.
	 */
	open(movie: TFile, time?: number): void {
		if (!this.rootEl) {
			this.build();
			if (this.preferTab) void this.moveToTab();
			else this.float();
		}
		this.load(movie);
		if (time !== undefined) this.seek(time, true);
	}

	/** Open `movie` in this tab, paused at `time`. Used by a restored tab. */
	openIn(tab: MoviePlayerTab, movie: TFile, time: number): void {
		if (!this.rootEl) this.build();
		this.dock(tab);
		this.load(movie);
		this.seek(time);
	}

	/** From floating into a tab, or back. */
	toggleTab(): void {
		if (this.host) this.moveToFloat();
		else void this.moveToTab();
	}

	private load(movie: TFile): void {
		const video = this.videoEl;
		if (!video) return;
		if (this.movie?.path !== movie.path) {
			this.movie = movie;
			this.cues = [];
			this.shownCue = null;
			this.list?.render();
			this.plugin.subtitles.forget(movie);
			this.setStatus('');
			if (this.titleEl) this.titleEl.setText(movie.basename);
			video.src = this.plugin.app.vault.getResourcePath(movie);
			void this.loadTracks(movie);
			void this.checkStreams(movie);
			this.host?.refreshTitle();
		}
	}

	/**
	 * Close the movie. In a tab, the tab goes too - unless the tab is what is
	 * closing, which passes `closeTab` false.
	 */
	close(closeTab = true): void {
		const host = this.host;
		this.host = null;
		if (this.rootEl && !host) this.rect = this.readRect(this.rootEl);
		for (const cleanup of this.cleanups) cleanup();
		this.cleanups = [];
		this.list?.destroy();
		this.list = null;
		if (this.videoEl) {
			this.videoEl.pause();
			this.videoEl.removeAttribute('src');
			this.videoEl.load();
		}
		this.rootEl?.remove();
		this.rootEl = null;
		this.videoEl = null;
		this.movie = null;
		this.cues = [];
		this.shownCue = null;
		this.modeButton = null;
		if (host && closeTab) host.leaf.detach();
	}

	/* ------------------------------------------------ tab or floating --- */

	private async moveToTab(): Promise<void> {
		const { workspace } = this.plugin.app;
		// An empty player tab left from before is reused, not doubled.
		const leaf =
			workspace.getLeavesOfType(MOVIE_PLAYER_VIEW_TYPE)[0] ?? workspace.getLeaf('tab');
		if (leaf.view.getViewType() !== MOVIE_PLAYER_VIEW_TYPE) {
			await leaf.setViewState({ type: MOVIE_PLAYER_VIEW_TYPE, active: true });
		}
		if (!this.rootEl || leaf.view.getViewType() !== MOVIE_PLAYER_VIEW_TYPE) return;
		this.dock(leaf.view as MoviePlayerTab);
		await workspace.revealLeaf(leaf);
	}

	private moveToFloat(): void {
		const host = this.host;
		this.host = null;
		this.float();
		// The player has left, so the tab's closing does not close it.
		host?.leaf.detach();
	}

	private dock(tab: MoviePlayerTab): void {
		const root = this.rootEl;
		if (!root) return;
		const previous = this.host;
		this.host = tab;
		this.preferTab = true;
		tab.contentEl.empty();
		this.moveRoot(root, tab.contentEl);
		root.addClass('is-docked');
		root.removeAttribute('style');
		this.showMode();
		tab.refreshTitle();
		if (previous && previous !== tab) previous.showEmpty();
	}

	private float(): void {
		const root = this.rootEl;
		if (!root) return;
		this.preferTab = false;
		this.moveRoot(root, document.body);
		root.removeClass('is-docked');
		this.showMode();
	}

	/**
	 * Move the window without reloading the video. Taking a playing video out
	 * of the page pauses it, so it is started again; the position is kept.
	 */
	private moveRoot(root: HTMLElement, parent: HTMLElement): void {
		if (root.parentElement === parent) return;
		const video = this.videoEl;
		const playing = video !== null && !video.paused;
		const target = parent as HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };
		if (target.moveBefore && root.isConnected) target.moveBefore(root, null);
		else parent.appendChild(root);
		if (playing && video.paused) void video.play().catch(() => undefined);
	}

	private showMode(): void {
		const button = this.modeButton;
		if (!button) return;
		setIcon(button, this.host ? 'picture-in-picture-2' : 'app-window');
		button.setAttr('aria-label', this.host ? 'Float the player' : 'Move the player into a tab');
	}

	/* ------------------------------------------------------- controls --- */

	togglePlay(): void {
		const video = this.videoEl;
		if (!video) return;
		if (video.paused) void video.play();
		else video.pause();
	}

	nextLine(): void {
		const video = this.videoEl;
		if (!video) return;
		const cue = nextCue(this.cues, video.currentTime);
		if (cue) this.seek(cue.start);
		else this.flash('No later subtitle.');
	}

	previousLine(): void {
		const video = this.videoEl;
		if (!video) return;
		const cue = previousCue(this.cues, video.currentTime);
		if (cue) this.seek(cue.start);
		else this.flash('No earlier subtitle.');
	}

	replayLine(): void {
		const video = this.videoEl;
		if (!video) return;
		const cue = cueAt(this.cues, video.currentTime) ?? previousCue(this.cues, video.currentTime + 1);
		if (cue) this.seek(cue.start);
	}

	/**
	 * A movie block for this moment, with the subtitle on screen, at the
	 * cursor of the last note written in.
	 */
	async insertReference(thumbnail = false): Promise<void> {
		const video = this.videoEl;
		const movie = this.movie;
		if (!video || !movie) {
			new Notice('Open a movie first.');
			return;
		}
		const time = video.currentTime;
		await insertMoment(this.plugin, movie, time, cueAt(this.cues, time), { thumbnail, study: false });
	}

	/** Go to `time` in the open movie, keeping it playing or paused. */
	seekTo(time: number): void {
		this.seek(time);
	}

	private seek(time: number, play = false): void {
		const video = this.videoEl;
		if (!video) return;
		video.currentTime = Math.max(0, time);
		this.renderCue();
		if (play) void video.play().catch(() => undefined);
	}

	/* ---------------------------------------------------------- build --- */

	private build(): void {
		const doc = document;
		const root = doc.createElement('div');
		root.addClass('ll-movie');
		root.tabIndex = -1;
		this.rootEl = root;
		this.applyRect(root, this.rect ?? this.defaultRect());

		const head = root.createDiv({ cls: 'll-movie__head' });
		this.titleEl = head.createDiv({ cls: 'll-movie__title' });
		this.iconButton(head, 'bookmark-plus', 'Insert this moment into the note', () => void this.insertReference());
		this.iconButton(head, 'image-plus', 'Insert this moment with a thumbnail', () => void this.insertReference(true));
		this.iconButton(head, 'list', 'Show or hide the subtitle lines', () => this.toggleList());
		this.modeButton = this.iconButton(head, 'app-window', 'Move the player into a tab', () => this.toggleTab());
		this.iconButton(head, 'maximize', 'Full screen', () => void this.fullscreen());
		this.iconButton(head, 'x', 'Close', () => this.close());

		const stage = root.createDiv({ cls: 'll-movie__stage' });
		const video = stage.createEl('video', { cls: 'll-movie__video' });
		video.controls = true;
		video.setAttr('controlsList', 'nofullscreen');
		video.preload = 'auto';
		this.videoEl = video;
		this.subtitleEl = stage.createDiv({ cls: 'll-movie__subtitle' });
		this.statusEl = stage.createDiv({ cls: 'll-movie__status' });

		const bar = root.createDiv({ cls: 'll-movie__bar' });
		this.iconButton(bar, 'skip-back', 'Previous subtitle (←)', () => this.previousLine());
		this.iconButton(bar, 'rotate-ccw', 'Replay this subtitle (R)', () => this.replayLine());
		this.iconButton(bar, 'skip-forward', 'Next subtitle (→)', () => this.nextLine());
		this.positionEl = bar.createDiv({ cls: 'll-movie__position' });
		this.trackSelect = bar.createEl('select', { cls: 'dropdown ll-movie__tracks' });
		this.trackSelect.hide();

		const listPanel = root.createDiv({ cls: 'll-movie__lines ll-subs' });
		this.list = new SubtitleList(this.plugin, this, listPanel);
		root.toggleClass('has-lines', this.listOpen);

		this.listen(video, 'timeupdate', () => {
			this.renderCue();
			this.list?.markPlaying(video.currentTime);
		});
		this.listen(video, 'seeked', () => {
			this.renderCue();
			this.list?.markPlaying(video.currentTime);
		});
		this.listen(video, 'error', () => void this.explainError());
		// A tab keeps the time in the layout; pausing is a good moment to save.
		this.listen(video, 'pause', () => {
			if (this.host) void this.plugin.app.workspace.requestSaveLayout();
		});
		this.listen(this.trackSelect, 'change', () => {
			const movie = this.movie;
			const id = this.trackSelect?.value;
			if (!movie || !id) return;
			this.plugin.subtitles.choose(movie, id);
			void this.loadTracks(movie);
		});
		this.listen(root, 'keydown', (evt) => this.onKey(evt), true);
		this.dragBy(head, root);
		this.keepInView(root);
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, run: () => void): HTMLElement {
		const button = parent.createEl('button', {
			cls: 'clickable-icon ll-movie__button',
			attr: { 'aria-label': label },
		});
		setIcon(button, icon);
		this.listen(button, 'click', (evt) => {
			evt.stopPropagation();
			run();
		});
		return button;
	}

	/** Fold the line list away, or bring it back. The video keeps its size. */
	private toggleList(): void {
		const root = this.rootEl;
		if (!root) return;
		this.listOpen = !this.listOpen;
		root.toggleClass('has-lines', this.listOpen);
		if (this.listOpen) this.list?.render();
		// In a tab the window is the tab's size; only a floating one grows.
		if (this.host) return;
		const rect = this.readRect(root);
		const change = this.listOpen ? LIST_HEIGHT : -LIST_HEIGHT;
		this.applyRect(root, { ...rect, height: rect.height + change, top: rect.top - change });
	}

	private onKey(evt: KeyboardEvent): void {
		// Typing in the filter box is typing, not driving the player.
		if (evt.target instanceof HTMLSelectElement || evt.target instanceof HTMLInputElement) return;
		const actions: Record<string, () => void> = {
			ArrowLeft: () => this.previousLine(),
			ArrowRight: () => this.nextLine(),
			' ': () => this.togglePlay(),
			r: () => this.replayLine(),
			Escape: () => this.close(),
		};
		const action = actions[evt.key];
		if (!action || evt.ctrlKey || evt.metaKey || evt.altKey) return;
		evt.preventDefault();
		evt.stopPropagation();
		action();
	}

	private async fullscreen(): Promise<void> {
		const root = this.rootEl;
		if (!root) return;
		if (document.fullscreenElement) await document.exitFullscreen();
		else await root.requestFullscreen();
	}

	/* ------------------------------------------------------ subtitles --- */

	private async loadTracks(movie: TFile): Promise<void> {
		this.setStatus('Looking for subtitles…');
		let tracks: SubtitleTrack[];
		try {
			tracks = await this.plugin.subtitles.tracksFor(movie);
		} catch (error) {
			this.setStatus(`No subtitles: ${message(error)}`, true);
			return;
		}
		if (this.movie !== movie) return;
		this.fillTrackSelect(tracks);
		if (!tracks.some((track) => track.usable)) {
			this.setStatus(
				tracks.length === 0
					? `No subtitles. Put "${movie.basename}.srt" beside the movie, or use a file with them inside.`
					: 'The subtitles in this file are pictures, which cannot be read as text.',
				true,
			);
			return;
		}

		this.setStatus('Reading subtitles…');
		try {
			const loaded = await this.plugin.subtitles.current(movie);
			if (this.movie !== movie) return;
			this.cues = loaded?.cues ?? [];
			this.list?.render();
			if (this.trackSelect && loaded) this.trackSelect.value = loaded.track.id;
			this.setStatus(this.cues.length === 0 ? 'That subtitle track is empty.' : '', this.cues.length === 0);
		} catch (error) {
			this.setStatus(`Could not read the subtitles: ${message(error)}`, true);
		}
		this.renderCue();
	}

	private fillTrackSelect(tracks: SubtitleTrack[]): void {
		const select = this.trackSelect;
		if (!select) return;
		select.empty();
		for (const track of tracks) {
			const option = select.createEl('option', { text: track.label, value: track.id });
			option.disabled = !track.usable;
		}
		select.toggle(tracks.length > 1);
	}

	private renderCue(): void {
		const video = this.videoEl;
		const el = this.subtitleEl;
		if (!video || !el) return;
		const cue = cueAt(this.cues, video.currentTime);
		if (cue !== this.shownCue) {
			this.shownCue = cue;
			el.setText(cue?.text ?? '');
			el.toggle(cue !== null);
		}
		if (this.positionEl) {
			this.positionEl.setText(
				this.cues.length > 0
					? `${cuePosition(this.cues, video.currentTime)} / ${this.cues.length}`
					: '',
			);
		}
	}

	/* ----------------------------------------------------- diagnosing --- */

	/** Warn early about streams that will not play, before anything fails. */
	private async checkStreams(movie: TFile): Promise<void> {
		const path = diskPath(this.plugin.app, movie);
		if (!path) return;
		try {
			const streams = await probe(this.plugin.settings.ffmpegPath, path);
			const problems = streamProblems(streams);
			if (this.movie !== movie || problems.length === 0) return;
			this.setStatus(problems.join('\n'), true);
		} catch {
			// No ffmpeg: the player still plays, it just cannot say much.
		}
	}

	private async explainError(): Promise<void> {
		const video = this.videoEl;
		const movie = this.movie;
		if (!video?.error || !movie) return;
		const lines = [
			`Could not play ${movie.name}.`,
			MEDIA_ERRORS[video.error.code] ?? `Media error ${video.error.code}.`,
		];
		if (video.error.message) lines.push(`Detail: ${video.error.message}`);

		const path = diskPath(this.plugin.app, movie);
		if (path) {
			try {
				const streams = await probe(this.plugin.settings.ffmpegPath, path);
				const found = streams
					.filter((stream) => stream.type === 'video' || stream.type === 'audio')
					.map((stream) => `${stream.type} #${stream.index}: ${stream.codec}`);
				lines.push(`Streams - ${found.join(', ') || 'none'}.`, ...streamProblems(streams));
				lines.push('To convert it into something Obsidian plays:', fixCommand(streams, movie.name));
			} catch (error) {
				lines.push(`ffprobe could not look inside: ${message(error)}`);
			}
		}
		if (this.movie !== movie) return;
		this.setStatus(lines.join('\n'), true);
		console.error('Language learning: movie error', video.error);
	}

	private setStatus(text: string, isProblem = false): void {
		const el = this.statusEl;
		if (!el) return;
		el.setText(text);
		el.toggle(text !== '');
		el.toggleClass('is-problem', isProblem);
	}

	private flash(text: string): void {
		new Notice(text, 1500);
	}

	/* ------------------------------------------------------ placement --- */

	private defaultRect(): Rect {
		const width = Math.min(560, window.innerWidth - 2 * MARGIN);
		const height = Math.round(width * 0.62) + (this.listOpen ? LIST_HEIGHT : 0);
		return {
			width,
			height,
			left: window.innerWidth - width - 24,
			top: window.innerHeight - height - 48,
		};
	}

	private applyRect(el: HTMLElement, rect: Rect): void {
		const width = Math.min(rect.width, window.innerWidth - 2 * MARGIN);
		const height = Math.min(rect.height, window.innerHeight - 2 * MARGIN);
		el.setCssStyles({
			width: `${width}px`,
			height: `${height}px`,
			left: `${clampTo(rect.left, MARGIN, window.innerWidth - width - MARGIN)}px`,
			top: `${clampTo(rect.top, MARGIN, window.innerHeight - height - MARGIN)}px`,
		});
	}

	private readRect(el: HTMLElement): Rect {
		const box = el.getBoundingClientRect();
		return { left: box.left, top: box.top, width: box.width, height: box.height };
	}

	private dragBy(handle: HTMLElement, root: HTMLElement): void {
		this.listen(handle, 'pointerdown', (evt) => {
			if (this.host || evt.button !== 0 || (evt.target as HTMLElement).closest('button')) return;
			evt.preventDefault();
			const start = this.readRect(root);
			const fromX = evt.clientX;
			const fromY = evt.clientY;
			handle.setPointerCapture(evt.pointerId);
			root.addClass('is-dragging');
			const move = (e: PointerEvent) => {
				this.applyRect(root, {
					...start,
					left: start.left + e.clientX - fromX,
					top: start.top + e.clientY - fromY,
				});
			};
			const up = () => {
				root.removeClass('is-dragging');
				handle.removeEventListener('pointermove', move);
				handle.removeEventListener('pointerup', up);
				this.rect = this.readRect(root);
			};
			handle.addEventListener('pointermove', move);
			handle.addEventListener('pointerup', up);
		});
	}

	/** Pull the window back in when Obsidian's window shrinks under it. */
	private keepInView(root: HTMLElement): void {
		this.listen(window, 'resize', () => {
			if (!this.host) this.applyRect(root, this.readRect(root));
		});
	}

	private listen<K extends keyof HTMLElementEventMap>(
		target: HTMLElement | Window,
		type: K,
		handler: (evt: HTMLElementEventMap[K]) => void,
		capture = false,
	): void {
		const fn = handler as EventListener;
		target.addEventListener(type, fn, capture);
		this.cleanups.push(() => target.removeEventListener(type, fn, capture));
	}
}

function clampTo(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, Math.max(min, max)));
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
