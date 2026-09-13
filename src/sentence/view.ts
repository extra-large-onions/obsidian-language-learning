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
			this.paint(root.createDiv({ cls: 'll-sentence__text' }), parsed);

			if (parsed.gloss) {
				root.createDiv({ cls: 'll-sentence__gloss', text: parsed.gloss });
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
