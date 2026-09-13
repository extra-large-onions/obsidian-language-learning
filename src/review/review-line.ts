import { Component, setIcon, setTooltip } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { CardName } from './page-card';
import {
	ReviewState,
	describeDue,
	describeLast,
	interval,
	isDue,
	reviewed,
	retrievability,
	unreviewed,
} from './schedule';

/**
 * The review line for one card: how much of it is likely to be left today,
 * when it comes up again, and the button that says you have read it.
 *
 * There is nothing to grade. Every review is one press, and the record is
 * the list of days behind it, which the line opens to show.
 *
 * The first press writes the card's name onto its page before it is filed,
 * so the record survives the page being edited.
 */
export function renderReviewLine(
	plugin: LanguageLearningPlugin,
	parent: HTMLElement,
	component: Component,
	name: CardName,
): void {
	const row = parent.createDiv({ cls: 'll-review' });

	const curve = row.createDiv({ cls: 'll-review__curve' });
	const fill = curve.createDiv({ cls: 'll-review__fill' });
	const status = row.createEl('button', { cls: 'll-review__status' });

	const mark = row.createEl('button', { cls: 'll-review__mark' });
	setIcon(mark, 'check');
	mark.createSpan({ text: 'Read it' });
	setTooltip(mark, 'Write down that you have read this page today');

	const days = parent.createDiv({ cls: 'll-review__days' });
	days.hidden = true;

	const refresh = () => {
		const state = plugin.reviews.get(name.current);
		renderDays(plugin, days, component, name, state, refresh);
		if (!state) {
			row.dataset['state'] = 'new';
			fill.setCssProps({ '--ll-review-recall': '0%' });
			status.setText('Not read yet');
			setTooltip(curve, 'This page has no history yet.');
			return;
		}
		const recall = Math.round(retrievability(state) * 100);
		const times = state.days.length;
		row.dataset['state'] = isDue(state) ? 'due' : 'ok';
		fill.setCssProps({ '--ll-review-recall': `${recall}%` });
		status.setText(
			`${describeLast(state)} - ${describeDue(state)} - ${recall}% - ` +
				`${times} time${times === 1 ? '' : 's'}`,
		);
		setTooltip(
			curve,
			`About ${recall}% likely to come back today. Read ${times} ` +
				`time${times === 1 ? '' : 's'}, every ${interval(state)} ` +
				`day${interval(state) === 1 ? '' : 's'} now.`,
		);
	};

	component.registerDomEvent(mark, 'click', () => {
		void name.settle().then((id) => {
			const { reviews } = plugin;
			reviews.set(id, reviewed(reviews.get(id)));
			days.hidden = false;
			refresh();
		});
	});

	setTooltip(status, 'Show every day you read this page');
	component.registerDomEvent(status, 'click', () => {
		days.hidden = !days.hidden;
	});

	refresh();
}

/** Every day the card was read, newest first, each one removable. */
function renderDays(
	plugin: LanguageLearningPlugin,
	parent: HTMLElement,
	component: Component,
	name: CardName,
	state: ReviewState | null,
	refresh: () => void,
): void {
	parent.empty();
	if (!state) {
		parent.createSpan({ cls: 'll-review__day-none', text: 'No reviews yet.' });
		return;
	}
	for (const day of [...state.days].reverse()) {
		const entry = parent.createSpan({ cls: 'll-review__day' });
		entry.createSpan({ text: day });
		const drop = entry.createEl('button', { cls: 'll-review__drop' });
		setIcon(drop, 'x');
		setTooltip(drop, `Take ${day} out of the record`);
		component.registerDomEvent(drop, 'click', () => {
			const current = plugin.reviews.get(name.current);
			if (!current) return;
			const left = unreviewed(current, day);
			if (left.days.length === 0) plugin.reviews.remove(name.current);
			else plugin.reviews.set(name.current, left);
			refresh();
		});
	}
}
