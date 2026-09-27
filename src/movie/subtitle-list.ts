import { TFile, setIcon } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { Cue, cueAt } from './subtitles';
import { MomentOptions, insertMoment } from './moments';
import { formatTime } from './time';

/** What the list needs from the player it sits in. */
export interface ListHost {
	readonly currentMovie: TFile | null;
	readonly cueList: Cue[];
	readonly currentTime: number;
	seekTo(time: number): void;
}

/**
 * Every subtitle line of the movie, under the video. The line playing now is
 * lit up and kept in view. Click a line to go there; its buttons put it into
 * the note, with or without a thumbnail.
 */
export class SubtitleList {
	private readonly plugin: LanguageLearningPlugin;
	private readonly host: ListHost;
	private readonly listEl: HTMLElement;
	private readonly searchEl: HTMLInputElement;
	private readonly countEl: HTMLElement;
	private readonly followButton: HTMLElement;
	private readonly cleanups: (() => void)[] = [];

	private rows: HTMLElement[] = [];
	private shown: Cue[] = [];
	private activeRow: HTMLElement | null = null;
	/** Scroll along with the movie. Off while the reader scrolls by hand. */
	private follow = true;

	constructor(plugin: LanguageLearningPlugin, host: ListHost, parent: HTMLElement) {
		this.plugin = plugin;
		this.host = host;

		const tools = parent.createDiv({ cls: 'll-subs__tools' });
		this.searchEl = tools.createEl('input', {
			cls: 'll-subs__search',
			attr: { type: 'search', placeholder: 'Filter lines' },
		});
		this.countEl = tools.createDiv({ cls: 'll-subs__count' });
		this.followButton = tools.createEl('button', {
			cls: 'clickable-icon ll-subs__follow',
			attr: { 'aria-label': 'Follow the movie' },
		});
		setIcon(this.followButton, 'locate-fixed');
		this.listEl = parent.createDiv({ cls: 'll-subs__list' });

		this.listen(this.searchEl, 'input', () => this.render());
		this.listen(this.followButton, 'click', () => this.setFollow(!this.follow));
		// A wheel on the list means the reader is looking elsewhere.
		this.listen(this.listEl, 'wheel', () => this.setFollow(false));
		this.setFollow(true);
	}

	destroy(): void {
		for (const cleanup of this.cleanups) cleanup();
	}

	render(): void {
		this.listEl.empty();
		this.rows = [];
		this.activeRow = null;

		const all = this.host.cueList;
		const query = this.searchEl.value.trim().toLowerCase();
		this.shown = query === '' ? all : all.filter((cue) => cue.text.toLowerCase().includes(query));
		this.countEl.setText(
			all.length === 0 ? '' : query ? `${this.shown.length} / ${all.length}` : `${all.length} lines`,
		);
		if (all.length === 0) {
			this.listEl.createDiv({ cls: 'll-subs__empty', text: 'No subtitles loaded.' });
			return;
		}
		for (const cue of this.shown) this.rows.push(this.row(cue));
		this.markPlaying(this.host.currentTime, true);
	}

	/** Light up the line on screen, and bring it into view when following. */
	markPlaying(time: number, force = false): void {
		const cue = cueAt(this.shown, time);
		const row = cue ? this.rows[this.shown.indexOf(cue)] ?? null : null;
		if (row === this.activeRow && !force) return;
		this.activeRow?.removeClass('is-playing');
		this.activeRow = row;
		if (!row) return;
		row.addClass('is-playing');
		if (this.follow) this.scrollTo(row, force);
	}

	private setFollow(on: boolean): void {
		this.follow = on;
		this.followButton.toggleClass('is-active', on);
		if (on) this.markPlaying(this.host.currentTime, true);
	}

	/** Centre the row in the list, without scrolling anything around it. */
	private scrollTo(row: HTMLElement, instant: boolean): void {
		const list = this.listEl;
		const top = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
		list.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
	}

	private row(cue: Cue): HTMLElement {
		const row = this.listEl.createDiv({ cls: 'll-subs__row' });
		const when = row.createDiv({ cls: 'll-subs__time' });
		when.createDiv({ text: formatTime(cue.start, false) });
		when.createDiv({ cls: 'll-subs__id', text: `#${cue.id}` });
		row.createDiv({ cls: 'll-subs__text', text: cue.text });
		const actions = row.createDiv({ cls: 'll-subs__actions' });
		this.action(actions, 'bookmark-plus', 'Insert into the note', () =>
			this.insert(cue, { thumbnail: false, study: false }),
		);
		this.action(actions, 'image-plus', 'Insert with a thumbnail', () =>
			this.insert(cue, { thumbnail: true, study: false }),
		);
		this.action(actions, 'languages', 'Study: thumbnail, sentence block, and copy the prompt', () =>
			this.insert(cue, { thumbnail: true, study: true }),
		);
		this.listen(row, 'click', () => this.host.seekTo(cue.start));
		return row;
	}

	private action(parent: HTMLElement, icon: string, label: string, run: () => void): void {
		const button = parent.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': label },
		});
		setIcon(button, icon);
		this.listen(button, 'click', (evt) => {
			evt.stopPropagation();
			run();
		});
	}

	private insert(cue: Cue, options: MomentOptions): void {
		const movie = this.host.currentMovie;
		if (movie) void insertMoment(this.plugin, movie, cue.start, cue, options);
	}

	private listen<K extends keyof HTMLElementEventMap>(
		target: HTMLElement,
		type: K,
		handler: (evt: HTMLElementEventMap[K]) => void,
	): void {
		const fn = handler as EventListener;
		target.addEventListener(type, fn);
		this.cleanups.push(() => target.removeEventListener(type, fn));
	}
}
