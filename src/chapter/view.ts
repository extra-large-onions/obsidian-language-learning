import {
	Component,
	HoverParent,
	HoverPopover,
	MarkdownRenderer,
	Notice,
	TextFileView,
	WorkspaceLeaf,
	setIcon,
} from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { Page } from '../types';
import { splitPages, stripFrontmatter } from './parser';
import { showAsMarkdown } from './toggle';
import { WriteTarget, findTaskLines, writeTaskMark } from './tasks';
import { clamp } from '../utils/helpers';
import { CHAPTER_VIEW_TYPE, HOVER_SOURCE } from '../utils/constants';

/** Where a chapter's reading position is filed. */
export function positionKey(path: string): string {
	return `file:${path}`;
}

/**
 * A whole `.chapter.md` note, read one page at a time.
 *
 * The file is an ordinary markdown note; only the page breaks are ours.
 * Nothing is written from here except a ticked checkbox, so the note stays
 * yours to edit in the normal editor, which the header button switches to.
 */
export class ChapterFileView extends TextFileView implements HoverParent {
	hoverPopover: HoverPopover | null = null;

	private readonly plugin: LanguageLearningPlugin;
	private pages: Page[] = [];
	private index = 0;
	private key = '';
	/** Set while we write a task, so our own edit does not re-render the page. */
	private selfEdit = false;

	private readonly rootEl: HTMLElement;
	private readonly pageEl: HTMLElement;
	private sheetEl!: HTMLElement;
	private readonly prevEl: HTMLButtonElement;
	private readonly nextEl: HTMLButtonElement;
	private readonly inputEl: HTMLInputElement;
	private readonly totalEl: HTMLElement;
	private pageComponent: Component | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LanguageLearningPlugin) {
		super(leaf);
		this.plugin = plugin;

		const root = this.contentEl.createDiv({ cls: 'll-chapter' });
		root.toggleClass('is-paper', plugin.settings.paperLook);
		root.tabIndex = 0;
		this.rootEl = root;
		this.pageEl = root.createDiv({ cls: 'll-chapter__page' });
		this.newSheet();

		const nav = root.createDiv({ cls: 'll-chapter__nav' });
		this.prevEl = navButton(nav, 'chevron-left', 'Previous page');
		this.registerDomEvent(this.prevEl, 'click', () => this.goTo(this.index - 1));

		const counter = nav.createDiv({ cls: 'll-chapter__counter' });
		this.inputEl = counter.createEl('input', {
			cls: 'll-chapter__input',
			type: 'number',
			attr: { min: '1', step: '1', 'aria-label': 'Page number' },
		});
		this.totalEl = counter.createSpan({ cls: 'll-chapter__total' });

		this.nextEl = navButton(nav, 'chevron-right', 'Next page');
		this.registerDomEvent(this.nextEl, 'click', () => this.goTo(this.index + 1));

		this.wireInteractions();
		this.addAction('pencil', 'Edit as markdown', () => {
			void showAsMarkdown(this.leaf, this.file);
		});

		// Follow edits made in the editor pane, or by another plugin.
		this.registerEvent(
			this.app.vault.on('modify', (changed) => {
				if (changed.path !== this.file?.path || this.selfEdit) return;
				void this.reload();
			}),
		);
	}

	override getViewType(): string {
		return CHAPTER_VIEW_TYPE;
	}

	override getIcon(): string {
		return 'book-open';
	}

	getViewData(): string {
		return this.data;
	}

	/**
	 * Take the file's text. `clear` marks a file just opened rather than a
	 * change to the one already open, which is when the saved position applies.
	 */
	setViewData(data: string, clear: boolean): void {
		this.data = data;
		this.key = positionKey(this.file?.path ?? '');
		this.pages = splitPages(data, stripFrontmatter(data).offset);

		if (this.pages.length === 0) {
			this.showMessage('This chapter has no pages yet.');
			return;
		}
		const wanted =
			clear && this.plugin.settings.rememberPosition
				? this.plugin.state.get(this.key)
				: this.index;
		this.index = clamp(wanted, 0, this.pages.length - 1);
		void this.render();
	}

	clear(): void {
		this.data = '';
		this.showMessage('');
	}

	/**
	 * Open on the page a line sits on. This is how the card list, which knows
	 * a card by its line in the file, lands on the page holding it.
	 */
	override setEphemeralState(state: unknown): void {
		super.setEphemeralState(state);
		const line = (state as { line?: unknown } | null)?.line;
		if (typeof line !== 'number' || this.pages.length === 0) return;

		let index = -1;
		this.pages.forEach((page, at) => {
			if (page.startLine <= line) index = at;
		});
		if (index >= 0) this.goTo(index);
	}

	private async reload(): Promise<void> {
		const file = this.file;
		if (!file) return;
		const text = await this.app.vault.cachedRead(file);
		if (text === this.data) return;
		this.setViewData(text, false);
	}

	/**
	 * Delegated handlers, registered once, so page content behaves like
	 * markdown anywhere else: link previews on hover, working checkboxes.
	 */
	private wireInteractions(): void {
		this.registerDomEvent(this.pageEl, 'mouseover', (evt) => {
			const target = evt.target;
			if (!(target instanceof HTMLElement)) return;
			const link = target.closest<HTMLElement>(
				'a.internal-link, .internal-embed',
			);
			if (!link) return;
			const linktext = link.getAttr('href') ?? link.getAttr('src');
			if (!linktext) return;
			this.app.workspace.trigger('hover-link', {
				event: evt,
				source: HOVER_SOURCE,
				hoverParent: this,
				targetEl: link,
				linktext,
				sourcePath: this.file?.path ?? '',
			});
		});

		this.registerDomEvent(this.pageEl, 'click', (evt) => {
			const target = evt.target;
			if (!(target instanceof HTMLInputElement)) return;
			if (!target.classList.contains('task-list-item-checkbox')) return;
			void this.onTaskToggle(target);
		});

		this.registerDomEvent(this.inputEl, 'change', () => this.jumpToInput());
		this.registerDomEvent(this.inputEl, 'keydown', (evt) => {
			if (evt.key === 'Enter') this.jumpToInput();
			evt.stopPropagation();
		});

		this.registerDomEvent(this.rootEl, 'keydown', (evt) => {
			if (evt.target === this.inputEl) return;
			if (evt.key === 'ArrowLeft' || evt.key === 'PageUp') {
				this.goTo(this.index - 1);
			} else if (evt.key === 'ArrowRight' || evt.key === 'PageDown') {
				this.goTo(this.index + 1);
			} else return;
			evt.preventDefault();
		});
	}

	private jumpToInput(): void {
		const requested = Number.parseInt(this.inputEl.value, 10);
		if (Number.isNaN(requested)) {
			this.syncControls();
			return;
		}
		this.goTo(requested - 1);
	}

	private goTo(index: number): void {
		const next = clamp(index, 0, this.pages.length - 1);
		if (next === this.index) {
			this.syncControls();
			return;
		}
		this.index = next;
		this.plugin.state.set(this.key, next);
		void this.render();
	}

	/** Render the current page, replacing the previous page's component. */
	private async render(): Promise<void> {
		this.syncControls();
		this.newSheet();

		const component = new Component();
		this.addChild(component);
		this.pageComponent = component;
		await MarkdownRenderer.render(
			this.app,
			this.pages[this.index]?.text ?? '',
			this.sheetEl,
			this.file?.path ?? '',
			component,
		);
	}

	/** A fresh sheet for the next page, so nothing of the last one is left. */
	private newSheet(): void {
		if (this.pageComponent) {
			this.removeChild(this.pageComponent);
			this.pageComponent = null;
		}
		this.pageEl.empty();
		this.pageEl.scrollTop = 0;
		this.sheetEl = this.pageEl.createDiv({
			cls: 'll-chapter__sheet markdown-rendered',
		});
	}

	private taskCheckboxes(): HTMLInputElement[] {
		return Array.from(
			this.sheetEl.querySelectorAll<HTMLInputElement>(
				'input.task-list-item-checkbox',
			),
		);
	}

	private async onTaskToggle(box: HTMLInputElement): Promise<void> {
		const page = this.pages[this.index];
		if (!page) return;
		const taskIndex = this.taskCheckboxes().indexOf(box);
		const local = findTaskLines(page.text)[taskIndex];
		const target = local === undefined ? null : this.resolveTarget(page, local);
		const checked = box.checked;

		if (!target) {
			box.checked = !checked;
			new Notice('Could not find that checkbox in the file.');
			return;
		}

		this.selfEdit = true;
		try {
			const written = await writeTaskMark(this.app.vault, target, checked);
			if (!written) {
				box.checked = !checked;
				new Notice('Could not find that checkbox in the file.');
				return;
			}
			applyTaskStyling(box, checked);
			// Keep our copy in step so the next toggle reads the true state.
			this.data = await this.app.vault.cachedRead(target.file);
			this.pages = splitPages(this.data, stripFrontmatter(this.data).offset);
		} finally {
			this.selfEdit = false;
		}
	}

	/** Map a page-local line onto the line it sits on in the file. */
	private resolveTarget(page: Page, localLine: number): WriteTarget | null {
		if (!this.file) return null;
		return { file: this.file, line: page.startLine + localLine };
	}

	private syncControls(): void {
		const total = this.pages.length;
		this.inputEl.value = String(this.index + 1);
		this.inputEl.max = String(total);
		this.totalEl.setText(`/ ${total}`);
		this.prevEl.disabled = this.index <= 0;
		this.nextEl.disabled = this.index >= total - 1;
	}

	private showMessage(text: string): void {
		this.newSheet();
		if (text !== '') {
			this.sheetEl.createDiv({ cls: 'll-chapter__empty', text });
		}
		this.pages = [];
		this.index = 0;
		this.inputEl.value = '0';
		this.totalEl.setText('/ 0');
		this.prevEl.disabled = true;
		this.nextEl.disabled = true;
	}
}

/** Match how Obsidian styles a ticked task elsewhere. */
function applyTaskStyling(box: HTMLInputElement, checked: boolean): void {
	const item = box.closest<HTMLElement>('.task-list-item');
	if (!item) return;
	item.toggleClass('is-checked', checked);
	item.setAttr('data-task', checked ? 'x' : ' ');
}

function navButton(
	parent: HTMLElement,
	icon: string,
	label: string,
): HTMLButtonElement {
	const button = parent.createEl('button', {
		cls: 'll-chapter__nav-button clickable-icon',
		attr: { 'aria-label': label, type: 'button' },
	});
	setIcon(button, icon);
	return button;
}
