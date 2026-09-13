/**
 * Spaced repetition, as pure functions over one card's history.
 *
 * A card's record is the list of days you read it. Everything else - when it
 * is due, how likely it is to have stuck - is worked out from that list, so
 * the record is exactly what happened and nothing else.
 *
 * There are no grades. Each review pushes the card one rung up a fixed
 * ladder: a day, six days, and then half again as far each time.
 *
 * Cards are scheduled by the day, not by the minute. A learner's day is the
 * unit they think in, and it keeps the state small and readable on disk.
 */

/** A day, as `YYYY-MM-DD` in local time. */
export type Day = string;

export interface ReviewState {
	/** Every day the card was read, oldest first, one entry per day. */
	days: Day[];
}

/** The first two rungs of the ladder, in days. */
const FIRST_INTERVAL = 1;
const SECOND_INTERVAL = 6;

/** How much further each review carries the card after the second. */
const GROWTH = 2.5;

/** Ten years. A card further out than this is learnt. */
const MAX_INTERVAL = 3650;

/**
 * The retention the intervals aim for. It also sets the forgetting curve:
 * the curve is drawn so that it passes through this value on the due day.
 */
const TARGET_RETENTION = 0.9;

/* ------------------------------------------------------------ scheduling --- */

/** Days to wait after the nth review. */
export function intervalFor(reviews: number): number {
	if (reviews <= 1) return FIRST_INTERVAL;
	let interval = SECOND_INTERVAL;
	for (let i = 2; i < reviews; i++) interval = Math.round(interval * GROWTH);
	return Math.min(interval, MAX_INTERVAL);
}

/** Write down that the card was read. Twice in a day is once. */
export function reviewed(
	previous: ReviewState | null,
	on: Day = today(),
): ReviewState {
	const days = [...(previous?.days ?? []), on];
	return { days: [...new Set(days)].sort() };
}

/** Take a day back out, for a review written down by mistake. */
export function unreviewed(state: ReviewState, day: Day): ReviewState {
	return { days: state.days.filter((entry) => entry !== day) };
}

/** How many times the card has been read. */
export function reps(state: ReviewState): number {
	return state.days.length;
}

/** The day it was last read. */
export function lastDay(state: ReviewState): Day {
	return state.days[state.days.length - 1] ?? today();
}

/** Days the card is meant to wait, given how often it has been read. */
export function interval(state: ReviewState): number {
	return intervalFor(state.days.length);
}

/** The day it comes back. */
export function dueDay(state: ReviewState): Day {
	return addDays(lastDay(state), interval(state));
}

/* ------------------------------------------------------- forgetting curve --- */

/**
 * How likely the card is to come back today, on the curve the schedule
 * assumes. It is the target retention on the due day, and it falls away
 * after that.
 */
export function retrievability(state: ReviewState, on: Day = today()): number {
	const elapsed = Math.max(0, daysBetween(lastDay(state), on));
	return TARGET_RETENTION ** (elapsed / Math.max(1, interval(state)));
}

/**
 * Reads as `Read today`, `Read 5 days ago`, or the day itself once that stops
 * being easier to picture than the date.
 */
export function describeLast(state: ReviewState, on: Day = today()): string {
	const last = lastDay(state);
	const days = daysBetween(last, on);
	if (days < 0 || days > 30) return `Read ${last}`;
	if (days === 0) return 'Read today';
	if (days === 1) return 'Read yesterday';
	return `Read ${days} days ago`;
}

/** Days until the card is due. Negative when it is overdue. */
export function dueIn(state: ReviewState, on: Day = today()): number {
	return daysBetween(on, dueDay(state));
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
 * Read one record off disk.
 *
 * A record written by an older version held only the last day and a count of
 * answers. The days before it cannot be recovered, so they are placed where
 * the ladder says they would have been - the card keeps its spacing, and the
 * dates it shows for those older reviews are honest about being a guess only
 * in that they are evenly spaced.
 */
export function cleanState(value: unknown): ReviewState | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;

	const days = record['days'];
	if (Array.isArray(days)) {
		const clean = [...new Set(days.filter(isDay))].sort();
		return clean.length > 0 ? { days: clean } : null;
	}

	const last = record['last'];
	if (!isDay(last)) return null;
	const count = Math.max(
		1,
		Math.round(number(record['reps'], 0)) + (number(record['reps'], 0) > 0 ? 1 : 0),
	);
	const walked: Day[] = [last];
	for (let i = count - 1; i >= 1; i--) {
		const first = walked[0] ?? last;
		walked.unshift(addDays(first, -intervalFor(i)));
	}
	return { days: walked };
}

function number(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
