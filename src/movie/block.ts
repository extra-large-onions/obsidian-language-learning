import { MarkdownRenderChild, TFile, setIcon } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { Cue, cueAt, cueById } from './subtitles';
import { MovieRef, parseMovieBlock, resolveMovie } from './reference';
import { cachedThumbnail, makeThumbnail } from './thumbnail';
import { formatTime } from './time';

interface Moment {
	time: number | null;
	text: string;
	/** Why the block cannot show all it should, or an empty string. */
	problem: string;
}

/**
 * A moment in a movie, inside a note. It shows the thumbnail once one has
 * been made - never on its own, since ffmpeg takes a moment - and a button
 * that takes the player there.
 */
export class MovieBlockView extends MarkdownRenderChild {
	private readonly plugin: LanguageLearningPlugin;
	private readonly source: string;
	private readonly sourcePath: string;
	private busy = false;

	constructor(
		plugin: LanguageLearningPlugin,
		source: string,
		containerEl: HTMLElement,
		sourcePath: string,
	) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
		this.sourcePath = sourcePath;
	}

	override onload(): void {
		const root = this.containerEl.createDiv({ cls: 'll-moment' });
		const ref = parseMovieBlock(this.source);
		if (typeof ref === 'string') {
			root.createDiv({ cls: 'll-moment__error', text: ref });
			return;
		}
		const movie = resolveMovie(this.plugin.app, ref.file, this.sourcePath);
		if (!movie) {
			root.createDiv({ cls: 'll-moment__error', text: `Cannot find "${ref.file}".` });
			return;
		}
		void this.render(root, movie, ref);
	}

	private async render(root: HTMLElement, movie: TFile, ref: MovieRef): Promise<void> {
		const frame = root.createDiv({ cls: 'll-moment__frame' });
		frame.hide();
		const textEl = root.createDiv({ cls: 'll-moment__text' });
		const bar = root.createDiv({ cls: 'll-moment__bar' });
		const errorEl = root.createDiv({ cls: 'll-moment__error' });
		errorEl.hide();

		const moment = await this.resolve(movie, ref);
		if (moment.problem) {
			errorEl.setText(moment.problem);
			errorEl.show();
		}
		textEl.setText(moment.text);
		textEl.toggle(moment.text !== '');
		if (moment.time === null) return;
		const time = moment.time;

		const jump = () => this.plugin.player.open(movie, time);
		const play = this.button(bar, 'play', 'Play from here', jump);
		play.addClass('mod-cta');
		const where = ref.line !== null ? `#${ref.line} · ` : '';
		bar.createSpan({
			cls: 'll-moment__label',
			text: `${where}${formatTime(time, false)} · ${movie.basename}`,
		});
		const makeButton = this.button(bar, 'image-plus', 'Make thumbnail', () => void generate());

		const showImage = (url: string) => {
			frame.empty();
			frame.show();
			const img = frame.createEl('img', { cls: 'll-moment__img', attr: { src: url, alt: moment.text } });
			this.registerDomEvent(img, 'click', jump);
			setIcon(makeButton, 'refresh-cw');
			makeButton.setAttr('aria-label', 'Make the thumbnail again');
		};

		const generate = async () => {
			if (this.busy) return;
			this.busy = true;
			makeButton.addClass('is-loading');
			errorEl.hide();
			try {
				showImage(await makeThumbnail(this.plugin, movie, time, moment.text));
			} catch (error) {
				errorEl.setText(`Could not make the thumbnail: ${error instanceof Error ? error.message : String(error)}`);
				errorEl.show();
				console.error('Language learning: thumbnail failed', error);
			} finally {
				this.busy = false;
				makeButton.removeClass('is-loading');
			}
		};

		const cached = await cachedThumbnail(this.plugin, movie, time);
		if (cached) showImage(cached);
	}

	/**
	 * Turn the block into a time and a text. `line` finds the subtitle line
	 * by its number; `time` picks the frame, or finds the line on screen.
	 */
	private async resolve(movie: TFile, ref: MovieRef): Promise<Moment> {
		let cues: Cue[] = [];
		let problem = '';
		try {
			cues = (await this.plugin.subtitles.current(movie))?.cues ?? [];
		} catch (error) {
			if (ref.line !== null) problem = `Could not read the subtitles: ${error instanceof Error ? error.message : String(error)}`;
		}

		const cue =
			ref.line !== null
				? cueById(cues, ref.line)
				: ref.time !== null
					? cueAt(cues, ref.time)
					: null;
		if (ref.line !== null && !cue && problem === '') {
			problem = `There is no line ${ref.line} in the subtitles of ${movie.name}.`;
		}
		return {
			time: ref.time ?? cue?.start ?? null,
			text: ref.text || cue?.text || '',
			problem,
		};
	}

	private button(parent: HTMLElement, icon: string, label: string, run: () => void): HTMLElement {
		const button = parent.createEl('button', {
			cls: 'clickable-icon ll-moment__button',
			attr: { 'aria-label': label },
		});
		setIcon(button, icon);
		this.registerDomEvent(button, 'click', (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			run();
		});
		return button;
	}
}
