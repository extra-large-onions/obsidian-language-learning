import {
	Component,
	MarkdownRenderChild,
	MarkdownRenderer,
} from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { ParsedSentence, PlacedToken, parseSentenceBlock } from './parse';
import { isKnownRole } from './types';

/** How many ignored items are named under the sentence. */
const MAX_WARNINGS = 3;

/** Space between the token and its note, in pixels. */
const GAP = 8;

/** Only one note is open at a time, so one id is enough to point at it. */
const NOTE_ID = 'll-note-active';

/**
 * The annotated sentences in one block. Each token takes a colour from its
 * role, and a hover shows what the token does and what it means.
 *
 * A sentence is read here, not reviewed: the card is the page the block sits
 * on, and its review line is under the page in the chapter reader.
 */
export class SentenceView extends MarkdownRenderChild {
	private readonly plugin: LanguageLearningPlugin;
	private readonly sourcePath: string;
	private readonly source: string;

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
		sourcePath: string,
	) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
		this.sourcePath = sourcePath;
	}

	override onload(): void {
		const list = this.containerEl.createDiv({ cls: 'll-sentences' });
		for (const parsed of parseSentenceBlock(this.source)) {
			const root = list.createDiv({ cls: 'll-sentence' });
			const offset = this.placed.length;
			this.paint(root.createDiv({ cls: 'll-sentence__text' }), parsed);

			if (parsed.gloss) {
				this.paintGloss(root.createDiv({ cls: 'll-sentence__gloss' }), parsed, offset);
			}
			if (parsed.alt) {
				root.createDiv({ cls: 'll-sentence__alt', text: parsed.alt });
			}
			if (parsed.note) {
				// Folded, so a long note does not bury the sentence on a card.
				const details = root.createEl('details', { cls: 'll-sentence__note' });
				details.createEl('summary', { text: 'Notes' });
				void MarkdownRenderer.render(
					this.plugin.app,
					parsed.note,
					details.createDiv({ cls: 'll-sentence__note-body' }),
					this.sourcePath,
					this,
				);
			}
			for (const warning of parsed.warnings.slice(0, MAX_WARNINGS)) {
				root.createDiv({ cls: 'll-sentence__warning', text: warning });
			}
		}
		this.wire();
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
			}
			cursor = item.end;
		}
		if (cursor < text.length) textEl.appendText(text.slice(cursor));
	}

	/**
	 * Draw the gloss, with a span for the words a token turns into. The span
	 * takes that token's colour, and names its tokens by their index.
	 */
	private paintGloss(glossEl: HTMLElement, parsed: ParsedSentence, offset: number): void {
		const gloss = parsed.gloss ?? '';
		let cursor = 0;
		for (const link of parsed.links) {
			if (link.start > cursor) glossEl.appendText(gloss.slice(cursor, link.start));
			const first = parsed.placed[link.tokens[0] ?? -1];
			const role = first?.token.role ?? '';
			const span = glossEl.createSpan({
				cls: `ll-tok ll-gloss-tok is-explained ll-role-${isKnownRole(role) ? role : 'other'}`,
				text: gloss.slice(link.start, link.end),
			});
			span.dataset['tokens'] = link.tokens.map((index) => index + offset).join(' ');
			cursor = link.end;
		}
		if (cursor < gloss.length) glossEl.appendText(gloss.slice(cursor));
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

	/* ------------------------------------------------------------ note --- */

	private show(el: HTMLElement | null): void {
		if (!el || !el.hasClass('is-explained')) {
			this.hide();
			return;
		}
		if (el === this.activeEl && this.popoverEl) return;

		const item = this.placed[indexesOf(el)[0] ?? -1];
		if (!item) return;

		this.hide();
		this.activeEl = el;
		this.highlight(el, true);

		// The note is the token's description, rather than an aria-label on the
		// token itself: an aria-label would open Obsidian's own tooltip too, and
		// the reader would see two notes at once.
		const popover = this.containerEl.ownerDocument.body.createDiv({
			cls: 'll-note',
			attr: { id: NOTE_ID, role: 'tooltip' },
		});
		this.popoverEl = popover;
		el.setAttr('aria-describedby', NOTE_ID);

		const head = popover.createDiv({ cls: 'll-note__word', text: item.token.t });
		if (item.token.pron) {
			head.createSpan({ cls: 'll-note__pron', text: item.token.pron });
		}
		const meta = metaLine(item);
		if (meta) popover.createDiv({ cls: 'll-note__meta', text: meta });
		const tr = translationOf(item);
		if (tr) popover.createDiv({ cls: 'll-note__tr', text: tr });

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
		// The gloss sits under the sentence, so its note opens further down and
		// leaves the sentence in view.
		place(popover, el, el.hasClass('ll-gloss-tok'));
	}

	private hide(): void {
		if (this.activeEl) {
			this.highlight(this.activeEl, false);
			this.activeEl.removeAttribute('aria-describedby');
		}
		this.activeEl = null;
		this.popoverComponent?.unload();
		this.popoverComponent = null;
		this.popoverEl?.remove();
		this.popoverEl = null;
	}

	/**
	 * Light up everything that is one unit with this element: the tokens of
	 * its group, and the words of the gloss they turn into. Hovering either
	 * side lights up the other. A group belongs to its own sentence, so the
	 * peers are looked for there.
	 */
	private highlight(el: HTMLElement, on: boolean): void {
		const sentence = el.closest<HTMLElement>('.ll-sentence');
		if (!sentence) {
			el.toggleClass('is-active', on);
			return;
		}
		const indexes = new Set(indexesOf(el));
		const groups = new Set<number>();
		for (const index of indexes) {
			const group = this.placed[index]?.token.group;
			if (group !== undefined) groups.add(group);
		}

		const tokens = sentence.querySelectorAll<HTMLElement>('.ll-tok[data-index]');
		for (const peer of Array.from(tokens)) {
			const index = Number(peer.dataset['index']);
			const group = this.placed[index]?.token.group;
			if (group !== undefined && groups.has(group)) indexes.add(index);
		}

		el.toggleClass('is-active', on);
		const all = sentence.querySelectorAll<HTMLElement>('.ll-tok');
		for (const peer of Array.from(all)) {
			if (indexesOf(peer).some((index) => indexes.has(index))) {
				peer.toggleClass('is-active', on);
			}
		}
	}
}

/* --------------------------------------------------------------- utils --- */

function tokenAt(target: EventTarget | null): HTMLElement | null {
	if (!(target instanceof HTMLElement)) return null;
	return target.closest<HTMLElement>('.ll-tok');
}

/** The tokens an element stands for: its own, or those its gloss words translate. */
function indexesOf(el: HTMLElement): number[] {
	const raw = el.dataset['index'] ?? el.dataset['tokens'] ?? '';
	return raw
		.split(' ')
		.filter((part) => part !== '')
		.map(Number);
}

/** True when the token has something worth opening a note for. */
function explains(item: PlacedToken): boolean {
	const { pos, role, lemma, note, tr, pron } = item.token;
	return Boolean(note || lemma || tr || pron || (pos && role));
}

/** Reads as `-> did ... read`. */
function translationOf(item: PlacedToken): string {
	const { tr } = item.token;
	if (tr === undefined) return '';
	return `→ ${typeof tr === 'string' ? tr : tr.join(' ... ')}`;
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

/**
 * Put the note above the token, or below it when there is no room. With
 * `preferBelow`, the other way round.
 */
function place(popover: HTMLElement, token: HTMLElement, preferBelow = false): void {
	const anchor = token.getBoundingClientRect();
	const box = popover.getBoundingClientRect();
	const view = token.ownerDocument.defaultView;
	const width = view?.innerWidth ?? box.width;
	const height = view?.innerHeight ?? box.height;

	const above = anchor.top - box.height - GAP;
	const below = anchor.bottom + GAP;
	const fitsAbove = above >= 0;
	const fitsBelow = below + box.height + GAP <= height;
	const top = preferBelow
		? fitsBelow || !fitsAbove
			? Math.min(below, height - box.height - GAP)
			: above
		: fitsAbove
			? above
			: Math.min(below, height - box.height - GAP);
	const left = Math.max(
		GAP,
		Math.min(
			anchor.left + anchor.width / 2 - box.width / 2,
			width - box.width - GAP,
		),
	);
	popover.style.top = `${Math.max(GAP, top)}px`;
	popover.style.left = `${left}px`;
}
