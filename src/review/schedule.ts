import { clamp } from '../utils/helpers';

/**
 * Spaced repetition, as pure functions over one card's state.
 *
 * The scheduler is SM-2 with the usual guard rails. It is kept apart from
 * Obsidian so the numbers can be read, and checked, on their own.
 *
 * Cards are scheduled by the day, not by the minute. A learner's day is the
 * unit they think in, and it keeps the state small and readable on disk.
 */

/** A day, as `YYYY-MM-DD` in local time. */
export type Day = string;

export const GRADES = ['again', 'hard', 'good', 'easy'] as const;

export type Grade = (typeof GRADES)[number];

export interface ReviewState {
	/** The day the card was last checked. */
	last: Day;
	/** The day it comes up again. */
	due: Day;
	/** Days between those two. Kept, so a late check does not lose the plan. */
	interval: number;
	/** How fast the interval grows. SM-2's easiness factor. */
	ease: number;
	/** Checks in a row that were not "again". */
	reps: number;
	/** Times the card was forgotten. */
	lapses: number;
}

/** The first two steps of the ladder, in days. */
const FIRST_INTERVAL = 1;
const SECOND_INTERVAL = 6;

export const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3;

/** Ten years. A card further out than this is learnt. */
const MAX_INTERVAL = 3650;

const EASE_DELTA: Record<Grade, number> = {
	again: -0.2,
	hard: -0.15,
	good: 0,
	easy: 0.15,
};

const INTERVAL_FACTOR: Record<Grade, number> = {
	again: 0,
	hard: 0.6,
	good: 1,
	easy: 1.3,
};

/**
 * The retention the intervals aim for. It also sets the forgetting curve:
 * the curve is drawn so that it passes through this value on the due day.
 */
const TARGET_RETENTION = 0.9;

/* ------------------------------------------------------------ scheduling --- */

/** A card that has never been checked. It is due the day it is made. */
export function newCard(on: Day = today()): ReviewState {
	return {
		last: on,
		due: on,
		interval: FIRST_INTERVAL,
		ease: DEFAULT_EASE,
		reps: 0,
		lapses: 0,
	};
}

/** Check a card, and place it on the calendar again. */
export function applyGrade(
	previous: ReviewState | null,
	grade: Grade,
	on: Day = today(),
): ReviewState {
	const state = previous ?? newCard(on);
	const ease = clamp(state.ease + EASE_DELTA[grade], MIN_EASE, MAX_EASE);

	if (grade === 'again') {
		return {
			last: on,
			due: addDays(on, FIRST_INTERVAL),
			interval: FIRST_INTERVAL,
			ease,
			reps: 0,
			lapses: state.lapses + 1,
		};
	}

	const interval = clamp(
		Math.round(nextInterval(state, grade, ease, on)),
		FIRST_INTERVAL,
		MAX_INTERVAL,
	);
	return {
		last: on,
		due: addDays(on, interval),
		interval,
		ease,
		reps: state.reps + 1,
		lapses: state.lapses,
	};
}

/**
 * The ladder is one day, then six, then the interval times the ease.
 *
 * A late check that went well counts the days the card actually survived,
 * because that is the evidence. A hard one does not, so a card you struggled
 * with is not pushed further out for having been left alone.
 */
function nextInterval(
	state: ReviewState,
	grade: Grade,
	ease: number,
	on: Day,
): number {
	if (state.reps === 0) {
		return grade === 'easy' ? SECOND_INTERVAL : FIRST_INTERVAL;
	}
	if (state.reps === 1) return SECOND_INTERVAL * INTERVAL_FACTOR[grade];

	const survived = Math.max(state.interval, daysBetween(state.last, on));
	const base = grade === 'hard' ? state.interval : survived;
	return base * ease * INTERVAL_FACTOR[grade];
}

/**
 * Move the day a card was last checked, keeping its plan. This is for fixing
 * the record - you read the card on the train and graded it the day after -
 * so the interval and the ease are left alone.
 */
export function setLastChecked(state: ReviewState, day: Day): ReviewState {
	return { ...state, last: day, due: addDays(day, state.interval) };
}

/* ------------------------------------------------------- forgetting curve --- */

/**
 * How likely the card is to come back today, on the curve the schedule
 * assumes. It is the target retention on the due day, and it falls away
 * after that.
 */
export function retrievability(state: ReviewState, on: Day = today()): number {
	const elapsed = Math.max(0, daysBetween(state.last, on));
	return TARGET_RETENTION ** (elapsed / Math.max(1, state.interval));
}

/**
 * Reads as `Done today`, `Done 5 days ago`, or the day itself once that stops
 * being easier to picture than the date.
 */
export function describeLast(state: ReviewState, on: Day = today()): string {
	const days = daysBetween(state.last, on);
	if (days < 0 || days > 30) return `Done ${state.last}`;
	if (days === 0) return 'Done today';
	if (days === 1) return 'Done yesterday';
	return `Done ${days} days ago`;
}

/** Days until the card is due. Negative when it is overdue. */
export function dueIn(state: ReviewState, on: Day = today()): number {
	return daysBetween(on, state.due);
}

export function isDue(state: ReviewState, on: Day = today()): boolean {
	return dueIn(state, on) <= 0;
}

/** Reads as `Due today`, `In 5 days`, or `2 days late`. */
export function describeDue(state: ReviewState, on: Day = today()): string {
	const days = dueIn(state, on);
	if (days === 0) return 'Due today';
	if (days === 1) return 'Due tomorrow';
	if (days > 1) return `In ${days} days`;
	if (days === -1) return '1 day late';
	return `${-days} days late`;
}

/* ----------------------------------------------------------------- days --- */

export function today(now: Date = new Date()): Day {
	return toDay(now);
}

/** The local calendar day of a date. Local, because a study day is local. */
export function toDay(date: Date): Day {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight on a day. */
export function fromDay(day: Day): Date {
	const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
	return new Date(year, month - 1, date);
}

export function addDays(day: Day, days: number): Day {
	const date = fromDay(day);
	date.setDate(date.getDate() + Math.round(days));
	return toDay(date);
}

/** Whole days from one day to the next. Rounded, so a clock change is free. */
export function daysBetween(from: Day, to: Day): number {
	const ms = fromDay(to).getTime() - fromDay(from).getTime();
	return Math.round(ms / 86400000);
}

export function isDay(value: unknown): value is Day {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/* ---------------------------------------------------------------- state --- */

/**
 * Read one state off disk. A field that is missing or the wrong type takes
 * its default, and a card that has no days at all is dropped, because a card
 * without a last check is not a record of anything.
 */
export function cleanState(value: unknown): ReviewState | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	const last = record['last'];
	if (!isDay(last)) return null;

	const interval = clamp(
		number(record['interval'], FIRST_INTERVAL),
		FIRST_INTERVAL,
		MAX_INTERVAL,
	);
	return {
		last,
		due: isDay(record['due']) ? record['due'] : addDays(last, interval),
		interval,
		ease: clamp(number(record['ease'], DEFAULT_EASE), MIN_EASE, MAX_EASE),
		reps: Math.max(0, Math.round(number(record['reps'], 0))),
		lapses: Math.max(0, Math.round(number(record['lapses'], 0))),
	};
}

function number(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
