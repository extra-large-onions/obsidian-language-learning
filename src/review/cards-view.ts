import { ItemView, TFile, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { IndexedCard, IndexedWord, Place } from './card-index';
import {
	GRADES,
	Grade,
	ReviewState,
	applyGrade,
	describeDue,
	describeLast,
	dueIn,
	isDue,
	retrievability,
} from './schedule';

export const CARDS_VIEW_TYPE = 'language-learning-cards';

/** How many rows a group draws before it stops and says what is left. */
const MAX_ROWS = 150;

/** What each grade button says, in the order they are shown. */
const GRADE_LABELS: Record<Grade, string> = {
	again: 'Again',
	hard: 'Hard',
	good: 'Good',
	easy: 'Easy',
};

type Tab = 'cards' | 'words';

/** Which column the word table is ordered by. */
type Sort = 'word' | 'count';

interface Row {
	card: IndexedCard;
	state: ReviewState | null;
}

/**
 * Every card in the vault, in two readings: what is due, and what words the
 * cards are made of. Both are drawn from the index, so nothing here reads
 * the vault itself.
 */
export class CardsView extends ItemView {
	private readonly plugin: LanguageLearningPlugin;
	private tab: Tab = 'cards';
	private sort: Sort = 'count';
	private filter = '';

	private tabEls = new Map<Tab, HTMLElement>();
	private busy = false;
	private summaryEl!: HTMLElement;
	private bodyEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: LanguageLearningPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return CARDS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Language cards';
	}

	override getIcon(): string {
		return 'gallery-vertical-end';
	}

	override async onOpen(): Promise<void> {
		this.register(this.plugin.index.subscribe(() => this.render()));
		this.render();
		// Read whatever changed while this was closed, so the list is current.
		await this.plugin.index.refresh(true);
	}

	/**
	 * A pane that was not on the page when it opened has nothing drawn in it,
	 * so catch it the moment it is given a size. The guard keeps an ordinary
	 * resize from redrawing the whole list.
	 */
	override onResize(): void {
		if (this.contentEl.firstElementChild) return;
		this.render();
	}

	/* ------------------------------------------------------------ frame --- */

	/**
	 * Obsidian may build a view before its pane is on the page, and a frame
	 * built into an element that is then thrown away leaves the view blank
	 * with no way back. Drawing it from render, rather than once on open,
	 * means the view finds itself again the first time it is really shown.
	 */
	private ensureFrame(): void {
		if (this.contentEl.firstElementChild) return;
		this.buildFrame();
	}

	private buildFrame(): void {
		this.contentEl.empty();
		const root = this.contentEl.createDiv({ cls: 'll-cards' });

		const tabs = root.createDiv({ cls: 'll-cards__tabs' });
		for (const tab of ['cards', 'words'] as const) {
			const button = tabs.createEl('button', {
				cls: 'll-cards__tab',
				text: tab === 'cards' ? 'Cards' : 'Words',
			});
			this.tabEls.set(tab, button);
			this.registerDomEvent(button, 'click', () => {
				if (this.tab === tab) return;
				this.tab = tab;
				this.render();
			});
		}

		const again = tabs.createEl('button', { cls: 'll-cards__reindex' });
		setIcon(again, 'refresh-cw');
		setTooltip(again, 'Read the whole vault again');
		this.registerDomEvent(again, 'click', () => void this.reindex(again));

		const filter = root.createEl('input', {
			cls: 'll-cards__filter',
			type: 'search',
			placeholder: 'Filter',
		});
		this.registerDomEvent(filter, 'input', () => {
			this.filter = filter.value.trim().toLowerCase();
			this.render();
		});

		this.summaryEl = root.createDiv({ cls: 'll-cards__summary' });
		this.bodyEl = root.createDiv({ cls: 'll-cards__body' });
	}

	private async reindex(button: HTMLElement): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		button.addClass('is-busy');
		try {
			await this.plugin.index.rebuild();
		} finally {
			this.busy = false;
			button.removeClass('is-busy');
		}
	}

	private render(): void {
		this.ensureFrame();
		for (const [tab, el] of this.tabEls) {
			el.toggleClass('is-active', tab === this.tab);
		}
		this.bodyEl.empty();

		if (!this.plugin.index.ready) {
			this.summaryEl.setText('Reading your vault...');
			return;
		}
		if (this.tab === 'cards') this.renderCards();
		else this.renderWords();
	}

	/* ------------------------------------------------------------ cards --- */

	private renderCards(): void {
		const { index, reviews } = this.plugin;
		const due: Row[] = [];
		const fresh: Row[] = [];
		const later: Row[] = [];

		for (const card of index.allCards()) {
			if (!this.matches(card)) continue;
			const state = reviews.get(card.id);
			if (!state) fresh.push({ card, state: null });
			else if (isDue(state)) due.push({ card, state });
			else later.push({ card, state });
		}

		// The most overdue first: that is what is closest to being lost.
		due.sort(byDue);
		later.sort(byDue);
		fresh.sort((a, b) => a.card.text.localeCompare(b.card.text));

		this.refreshSummary();
		if (due.length + fresh.length + later.length === 0) {
			this.bodyEl.createDiv({
				cls: 'll-cards__empty',
				text:
					this.filter === ''
						? 'No cards yet. Annotate a sentence to make one.'
						: 'Nothing matches that filter.',
			});
			return;
		}

		this.section('Due', due);
		this.section('Not checked yet', fresh);
		this.section('Later', later);
	}

	private section(title: string, rows: Row[]): void {
		if (rows.length === 0) return;

		const head = this.bodyEl.createDiv({ cls: 'll-cards__section' });
		head.createSpan({ text: title });
		head.createSpan({ cls: 'll-cards__count', text: String(rows.length) });

		for (const row of rows.slice(0, MAX_ROWS)) this.cardRow(row);
		if (rows.length > MAX_ROWS) {
			this.bodyEl.createDiv({
				cls: 'll-cards__more',
				text: `and ${rows.length - MAX_ROWS} more`,
			});
		}
	}

	private cardRow(row: Row): void {
		const el = this.bodyEl.createDiv({ cls: 'll-card' });
		const curve = el.createDiv({ cls: 'll-review__curve' });
		const fill = curve.createDiv({ cls: 'll-review__fill' });

		const main = el.createDiv({ cls: 'll-card__main' });
		const text = main.createEl('button', {
			cls: 'll-card__text',
			text: row.card.text,
		});
		const first = row.card.places[0];
		if (first) {
			setTooltip(text, `Open ${first.path}`);
			this.registerDomEvent(text, 'click', () => void this.open(first));
		}
		if (row.card.gloss) {
			main.createDiv({ cls: 'll-card__gloss', text: row.card.gloss });
		}
		const meta = main.createDiv({ cls: 'll-card__meta' });

		const refresh = () => {
			const state = this.plugin.reviews.get(row.card.id);
			const where = describePlaces(row.card.places);
			if (!state) {
				el.dataset['state'] = 'new';
				fill.setCssProps({ '--ll-review-recall': '0%' });
				meta.setText(`Not checked yet - ${where}`);
				return;
			}
			const recall = Math.round(retrievability(state) * 100);
			el.dataset['state'] = isDue(state) ? 'due' : 'ok';
			fill.setCssProps({ '--ll-review-recall': `${recall}%` });
			meta.setText(
				`${describeLast(state)} - ${describeDue(state)} - ${recall}% - ${where}`,
			);
		};

		const grades = el.createDiv({ cls: 'll-review__grades' });
		for (const grade of GRADES) {
			const button = grades.createEl('button', {
				cls: `ll-review__grade mod-${grade}`,
				text: GRADE_LABELS[grade],
			});
			this.registerDomEvent(button, 'click', () => {
				const { reviews } = this.plugin;
				reviews.set(row.card.id, applyGrade(reviews.get(row.card.id), grade));
				// The row stays where it is: a list that reorders under the
				// hand is a list you cannot work down.
				el.addClass('is-checked');
				refresh();
				this.refreshSummary();
			});
		}

		refresh();
	}

	/* ------------------------------------------------------------ words --- */

	private renderWords(): void {
		const words = this.plugin.index
			.allWords()
			.filter((word) => this.filter === '' || word.key.includes(this.filter));
		// allWords comes back by count; by word is the other way to read it.
		if (this.sort === 'word') words.sort((a, b) => a.key.localeCompare(b.key));

		this.summaryEl.setText(count(words.length, 'word'));
		if (words.length === 0) {
			this.bodyEl.createDiv({
				cls: 'll-cards__empty',
				text:
					this.filter === ''
						? 'No words yet. They come from the tokens in your cards.'
						: 'Nothing matches that filter.',
			});
			return;
		}

		const table = this.bodyEl.createEl('table', { cls: 'll-index' });
		const head = table.createEl('thead').createEl('tr');
		this.column(head, 'Word', 'word');
		head.createEl('th', { text: 'Class' });
		this.column(head, 'Cards', 'count', 'll-index__num');

		const body = table.createEl('tbody');
		for (const word of words.slice(0, MAX_ROWS)) this.wordRow(body, word);

		if (words.length > MAX_ROWS) {
			this.bodyEl.createDiv({
				cls: 'll-cards__more',
				text: `and ${words.length - MAX_ROWS} more`,
			});
		}
	}

	/** A heading that orders the table by its own column. */
	private column(row: HTMLElement, label: string, key: Sort, cls?: string): void {
		const th = row.createEl('th', cls === undefined ? {} : { cls });
		const button = th.createEl('button', {
			cls: 'll-index__sort',
			text: label,
		});
		button.toggleClass('is-active', this.sort === key);
		this.registerDomEvent(button, 'click', () => {
			if (this.sort === key) return;
			this.sort = key;
			this.render();
		});
	}

	/** One word, and under it the cards it is in, when the row is opened. */
	private wordRow(body: HTMLElement, word: IndexedWord): void {
		const row = body.createEl('tr', { cls: 'll-index__row' });
		row.tabIndex = 0;
		row.setAttr('aria-expanded', 'false');
		row.createEl('td', { cls: 'll-index__word', text: word.display });
		row.createEl('td', { cls: 'll-index__pos', text: word.pos.join(', ') });
		row.createEl('td', {
			cls: 'll-index__num',
			text: String(word.cards.size),
		});

		const holder = body.createEl('tr', { cls: 'll-index__cards' });
		holder.hidden = true;
		const cell = holder.createEl('td');
		cell.setAttr('colspan', '3');

		const toggle = () => {
			holder.hidden = !holder.hidden;
			row.toggleClass('is-open', !holder.hidden);
			row.setAttr('aria-expanded', String(!holder.hidden));
			if (holder.hidden || cell.childElementCount > 0) return;

			for (const card of this.plugin.index.cardsFor(word.key)) {
				for (const place of card.places) this.cardLink(cell, card, place);
			}
		};
		this.registerDomEvent(row, 'click', toggle);
		this.registerDomEvent(row, 'keydown', (evt) => {
			if (evt.key !== 'Enter' && evt.key !== ' ') return;
			evt.preventDefault();
			toggle();
		});
	}

	/** A card, and the block it is written in. */
	private cardLink(
		parent: HTMLElement,
		card: IndexedCard,
		place: Place,
	): void {
		const link = parent.createEl('button', { cls: 'll-index__card' });
		link.createSpan({ cls: 'll-index__sentence', text: card.text });
		link.createSpan({ cls: 'll-index__where', text: describePlace(place) });
		link.createSpan({ cls: 'll-index__id', text: card.id });
		setTooltip(link, `Open ${place.path}`);
		this.registerDomEvent(link, 'click', () => void this.open(place));
	}

	/* ------------------------------------------------------------ utils --- */

	private refreshSummary(): void {
		const { index, reviews } = this.plugin;
		const cards = index.allCards();
		let dueCount = 0;
		let freshCount = 0;
		for (const card of cards) {
			const state = reviews.get(card.id);
			if (!state) freshCount++;
			else if (isDue(state)) dueCount++;
		}
		this.summaryEl.setText(
			`${dueCount} due - ${freshCount} new - ${count(cards.length, 'card')}`,
		);
	}

	private matches(card: IndexedCard): boolean {
		if (this.filter === '') return true;
		return (
			card.text.toLowerCase().includes(this.filter) ||
			(card.gloss ?? '').toLowerCase().includes(this.filter)
		);
	}

	private async open(place: Place): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(place.path);
		if (!(file instanceof TFile)) return;
		const leaf = this.app.workspace.getLeaf(false);
		// A canvas has no line to jump to, so it is opened as it is.
		await leaf.openFile(
			file,
			place.line > 0 ? { eState: { line: place.line } } : {},
		);
	}
}

function byDue(a: Row, b: Row): number {
	return (a.state ? dueIn(a.state) : 0) - (b.state ? dueIn(b.state) : 0);
}

/** Reads as `Lesson 3:12`, or just the file when it has no lines to count. */
function describePlace(place: Place): string {
	const name = stemOf(place.path);
	return place.line > 0 ? `${name}:${place.line + 1}` : name;
}

/** Reads as `Lesson 3`, or `Lesson 3 +2` when the sentence is in more notes. */
function describePlaces(places: Place[]): string {
	const first = places[0];
	if (!first) return 'nowhere';
	const stem = stemOf(first.path);
	return places.length > 1 ? `${stem} +${places.length - 1}` : stem;
}

function stemOf(path: string): string {
	const name = path.split('/').pop() ?? path;
	return name.replace(/\.(md|canvas)$/, '');
}

function count(value: number, noun: string): string {
	return `${value} ${noun}${value === 1 ? '' : 's'}`;
}
