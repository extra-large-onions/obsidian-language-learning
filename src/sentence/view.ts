import {
	Component,
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	MarkdownRenderer,
	setIcon,
	setTooltip,
} from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { cardId, stampBlock } from '../review/card';
import {
	GRADES,
	Grade,
	applyGrade,
	describeDue,
	describeLast,
	isDay,
	isDue,
	retrievability,
	setLastChecked,
	today,
} from '../review/schedule';
import { isChapterPath } from '../chapter/file';
import { newBlockId, readBlockId } from '../utils/block-id';
import { SENTENCE_BLOCK_LANG } from '../utils/constants';
import { ParsedSentence, PlacedToken, parseSentenceBlock } from './parse';
import { isKnownRole } from './types';

/** How many ignored items are named under the sentence. */
const MAX_WARNINGS = 3;

/** Space between the token and its note, in pixels. */
const GAP = 8;

/** What each grade button says, in the order they are shown. */
const GRADE_LABELS: Record<Grade, string> = {
	again: 'Again',
	hard: 'Hard',
	good: 'Good',
	easy: 'Easy',
};

/**
 * The annotated sentences in one block. Each token takes a colour from its
 * role, and a hover shows what the token does and what it means.
 */
export class SentenceView extends MarkdownRenderChild {
	private readonly plugin: LanguageLearningPlugin;
	private readonly ctx: MarkdownPostProcessorContext;
	private readonly sourcePath: string;
	private readonly source: string;
	/** The name written on the block, when it has one. */
	private readonly blockId: string | null;

	/** Every token in the block, in reading order. The span holds its index. */
	private placed: PlacedToken[] = [];
	private popoverEl: HTMLElement | null = null;
	private popoverComponent: Component | null = null;
	private activeEl: HTMLElement | null = null;
	/** A tap holds the note open. A pointer alone does not. */
	private pinned = false;

	constructor(
		plugin: LanguageLearningPlugin,
		source: string,
		containerEl: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) {
		super(containerEl);
		this.plugin = plugin;
		this.ctx = ctx;
		this.source = source;
		this.sourcePath = ctx.sourcePath;
		this.blockId = readBlockId(source);
	}

	/**
	 * Whether this block gets the review line under each sentence.
	 *
	 * Only a chapter does. A `korean` block quoted in an ordinary note is
	 * there to be read, not answered, and the curve and its four buttons in
	 * the middle of a page of prose are noise. The cards themselves are not
	 * conditional: the index still finds these sentences, and the card list
	 * still schedules them.
	 */
	private get reviewable(): boolean {
		return (
			this.plugin.settings.showReviewControls && isChapterPath(this.sourcePath)
		);
	}

	override onload(): void {
		const sentences = parseSentenceBlock(this.source);
		const list = this.containerEl.createDiv({ cls: 'll-sentences' });
		sentences.forEach((parsed, index) => {
			const root = list.createDiv({ cls: 'll-sentence' });
			this.paint(root.createDiv({ cls: 'll-sentence__text' }), parsed);

			if (parsed.gloss) {
				root.createDiv({ cls: 'll-sentence__gloss', text: parsed.gloss });
			}
			for (const warning of parsed.warnings.slice(0, MAX_WARNINGS)) {
				root.createDiv({ cls: 'll-sentence__warning', text: warning });
			}
			// A block that is not JSON has no card in it to check.
			if (this.reviewable && parsed.annotated) {
				this.addReview(root, parsed, index);
			}
		});
		this.wire();

		if (this.blockId === null && sentences.some((one) => one.annotated)) {
			void this.stamp(sentences);
		}
	}

	/**
	 * Name the block the first time it is drawn, so its cards keep their
	 * history when the sentences are edited, and so the word index has
	 * something stable to point at. Any history filed under the old text
	 * hash moves across with it.
	 */
	private async stamp(sentences: ParsedSentence[]): Promise<void> {
		const id = newBlockId();
		const written = await stampBlock(
			this.plugin.app,
			this.ctx,
			this.containerEl,
			SENTENCE_BLOCK_LANG,
			id,
		);
		if (!written) return;

		sentences.forEach((sentence, index) => {
			this.plugin.reviews.rename(
				cardId(sentence, null, index),
				cardId(sentence, id, index),
			);
		});
	}

	override onunload(): void {
		this.hide();
	}

	/** Draw one sentence from its own characters, with a span per token. */
	private paint(textEl: HTMLElement, parsed: ParsedSentence): void {
		const { text } = parsed;
		let cursor = 0;
		for (const item of parsed.placed) {
			if (item.start > cursor) {
				textEl.appendText(text.slice(cursor, item.start));
			}
			const { token } = item;
			const role = token.role ?? '';
			const span = textEl.createSpan({
				cls: `ll-tok ll-role-${isKnownRole(role) ? role : 'other'}`,
				text: text.slice(item.start, item.end),
			});
			span.dataset['index'] = String(this.placed.push(item) - 1);
			if (token.group !== undefined) {
				span.dataset['group'] = String(token.group);
			}
			if (explains(item)) {
				span.addClass('is-explained');
				span.tabIndex = 0;
				span.setAttr('aria-label', label(item));
			}
			cursor = item.end;
		}
		if (cursor < text.length) textEl.appendText(text.slice(cursor));
	}

	private wire(): void {
		const { containerEl } = this;
		// A canvas card starts a drag on pointerdown; keep tokens tappable.
		this.registerDomEvent(containerEl, 'pointerdown', (evt) =>
			evt.stopPropagation(),
		);

		this.registerDomEvent(containerEl, 'mouseover', (evt) => {
			if (this.pinned) return;
			this.show(tokenAt(evt.target));
		});
		this.registerDomEvent(containerEl, 'mouseleave', () => {
			if (!this.pinned) this.hide();
		});
		this.registerDomEvent(containerEl, 'focusin', (evt) => {
			if (!this.pinned) this.show(tokenAt(evt.target));
		});
		this.registerDomEvent(containerEl, 'click', (evt) => {
			const el = tokenAt(evt.target);
			if (!el) return;
			this.pinned = el !== this.activeEl || !this.pinned;
			if (this.pinned) this.show(el);
			else this.hide();
		});
		// A tap anywhere else lets the note go.
		this.registerDomEvent(containerEl.ownerDocument, 'click', (evt) => {
			if (!this.pinned) return;
			const target = evt.target;
			if (target instanceof Node && containerEl.contains(target)) return;
			this.pinned = false;
			this.hide();
		});
	}

	/* ---------------------------------------------------------- review --- */

	/**
	 * The review line for one sentence: how much of it is likely to be left
	 * today, when it comes up again, and the four ways to answer it.
	 */
	private addReview(
		root: HTMLElement,
		parsed: ParsedSentence,
		index: number,
	): void {
		const id = cardId(parsed, this.blockId, index);
		const row = root.createDiv({ cls: 'll-review' });

		const curve = row.createDiv({ cls: 'll-review__curve' });
		const fill = curve.createDiv({ cls: 'll-review__fill' });
		const status = row.createDiv({ cls: 'll-review__status' });

		const grades = row.createDiv({ cls: 'll-review__grades' });
		const date = row.createEl('input', {
			cls: 'll-review__date',
			type: 'date',
		});
		date.hidden = true;

		const refresh = () => {
			const state = this.plugin.reviews.get(id);
			if (!state) {
				row.dataset['state'] = 'new';
				fill.setCssProps({ '--ll-review-recall': '0%' });
				status.setText('Not checked yet');
				setTooltip(curve, 'This card has no history yet.');
				return;
			}
			const recall = Math.round(retrievability(state) * 100);
			row.dataset['state'] = isDue(state) ? 'due' : 'ok';
			fill.setCssProps({ '--ll-review-recall': `${recall}%` });
			status.setText(
				`${describeLast(state)} - ${describeDue(state)} - ${recall}%`,
			);
			setTooltip(
				curve,
				`About ${recall}% likely to come back today. Checked ${state.last}, ` +
					`every ${state.interval} day${state.interval === 1 ? '' : 's'}.`,
			);
		};

		for (const grade of GRADES) {
			const button = grades.createEl('button', {
				cls: `ll-review__grade mod-${grade}`,
				text: GRADE_LABELS[grade],
			});
			this.registerDomEvent(button, 'click', () => {
				const { reviews } = this.plugin;
				reviews.set(id, applyGrade(reviews.get(id), grade));
				refresh();
			});
		}

		const calendar = row.createEl('button', { cls: 'll-review__when' });
		setIcon(calendar, 'calendar-clock');
		setTooltip(calendar, 'Change the day this was last checked');
		this.registerDomEvent(calendar, 'click', () => {
			date.hidden = !date.hidden;
			if (date.hidden) return;
			date.value = this.plugin.reviews.get(id)?.last ?? today();
			date.focus();
		});
		this.registerDomEvent(date, 'change', () => {
			if (!isDay(date.value)) return;
			const state = this.plugin.reviews.get(id);
			this.plugin.reviews.set(
				id,
				state
					? setLastChecked(state, date.value)
					: applyGrade(null, 'good', date.value),
			);
			date.hidden = true;
			refresh();
		});

		refresh();
	}

	/* ------------------------------------------------------------ note --- */

	private show(el: HTMLElement | null): void {
		if (!el || !el.hasClass('is-explained')) {
			this.hide();
			return;
		}
		if (el === this.activeEl && this.popoverEl) return;

		const item = this.placed[Number(el.dataset['index'] ?? '-1')];
		if (!item) return;

		this.hide();
		this.activeEl = el;
		this.highlightGroup(el, true);

		const popover = this.containerEl.ownerDocument.body.createDiv({
			cls: 'll-note',
		});
		this.popoverEl = popover;

		popover.createDiv({ cls: 'll-note__word', text: item.token.t });
		const meta = metaLine(item);
		if (meta) popover.createDiv({ cls: 'll-note__meta', text: meta });

		if (item.token.note) {
			const body = popover.createDiv({ cls: 'll-note__body' });
			const component = new Component();
			this.popoverComponent = component;
			component.load();
			void MarkdownRenderer.render(
				this.plugin.app,
				item.token.note,
				body,
				this.sourcePath,
				component,
			);
		}
		place(popover, el);
	}

	private hide(): void {
		if (this.activeEl) this.highlightGroup(this.activeEl, false);
		this.activeEl = null;
		this.popoverComponent?.unload();
		this.popoverComponent = null;
		this.popoverEl?.remove();
		this.popoverEl = null;
	}

	/**
	 * A split unit lights up as one, so a split negation reads as one thing.
	 * A group belongs to its own sentence, so the peers are looked for there.
	 */
	private highlightGroup(el: HTMLElement, on: boolean): void {
		const group = el.dataset['group'];
		const sentence = el.closest<HTMLElement>('.ll-sentence__text');
		if (group === undefined || !sentence) {
			el.toggleClass('is-active', on);
			return;
		}
		sentence
			.querySelectorAll<HTMLElement>(`.ll-tok[data-group="${group}"]`)
			.forEach((peer) => peer.toggleClass('is-active', on));
	}
}

/* --------------------------------------------------------------- utils --- */

function tokenAt(target: EventTarget | null): HTMLElement | null {
	if (!(target instanceof HTMLElement)) return null;
	return target.closest<HTMLElement>('.ll-tok');
}

/** True when the token has something worth opening a note for. */
function explains(item: PlacedToken): boolean {
	const { pos, role, lemma, note } = item.token;
	return Boolean(note || lemma || (pos && role));
}

/** Reads as `pronoun - subject - from <lemma>`. */
function metaLine(item: PlacedToken): string {
	const { pos, role, lemma } = item.token;
	const parts: string[] = [];
	if (pos) parts.push(pos);
	if (role) parts.push(role);
	if (lemma && lemma !== item.token.t) parts.push(`from ${lemma}`);
	return parts.join(' - ');
}

function label(item: PlacedToken): string {
	const meta = metaLine(item);
	const note = item.token.note ?? '';
	return [item.token.t, meta, note].filter((part) => part !== '').join('. ');
}

/** Put the note above the token, or below it when there is no room. */
function place(popover: HTMLElement, token: HTMLElement): void {
	const anchor = token.getBoundingClientRect();
	const box = popover.getBoundingClientRect();
	const view = token.ownerDocument.defaultView;
	const width = view?.innerWidth ?? box.width;
	const height = view?.innerHeight ?? box.height;

	const above = anchor.top - box.height - GAP;
	const below = Math.min(anchor.bottom + GAP, height - box.height - GAP);
	const left = Math.max(
		GAP,
		Math.min(
			anchor.left + anchor.width / 2 - box.width / 2,
			width - box.width - GAP,
		),
	);
	popover.style.top = `${Math.max(GAP, above >= 0 ? above : below)}px`;
	popover.style.left = `${left}px`;
}
