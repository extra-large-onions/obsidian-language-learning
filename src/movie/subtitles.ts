import { parseTime } from './time';

/** One subtitle line on screen, in seconds. */
export interface Cue {
	/**
	 * The line's number in its file - the counter above each SRT cue - so a
	 * note can point at it. Files without one are numbered in order.
	 */
	id: number;
	start: number;
	end: number;
	text: string;
}

/**
 * Read a subtitle file. The format is taken from the extension, and failing
 * that from the content: SRT, WebVTT and ASS/SSA are understood.
 */
export function parseSubtitles(content: string, ext = ''): Cue[] {
	const unmarked = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
	const text = unmarked.replace(/\r\n?/g, '\n');
	const kind = ext.toLowerCase();
	const cues =
		kind === 'ass' || kind === 'ssa' || /^\[Script Info\]/m.test(text)
			? parseAss(text)
			: parseSrtOrVtt(text);
	return unroll(
		cues
			.filter((cue) => cue.text !== '' && cue.end > cue.start)
			.sort((a, b) => a.start - b.start),
	);
}

/** A cue this short is a caption scrolling up, not a line to read. */
const FLASH = 0.2;

/**
 * YouTube's automatic captions roll: each cue repeats the line before it
 * under the new one, with a flash between them while the text scrolls up.
 * Keep only what each cue adds, so one cue is one new line. Files that do
 * not roll pass through unchanged.
 */
function unroll(cues: Cue[]): Cue[] {
	const out: Cue[] = [];
	for (const cue of cues) {
		const prev = out[out.length - 1];
		const lastLine = prev?.text.split('\n').pop() ?? '';
		const lines = cue.text.split('\n');
		const rolls = prev !== undefined && lines.length > 1 && lines[0] === lastLine;
		const fresh = rolls ? lines.slice(1).join('\n') : cue.text;

		if (prev && cue.end - cue.start < FLASH && cue.text.split('\n').includes(lastLine)) {
			continue;
		}
		// A block opens with its first line on screen for a flash only, then
		// rolls it into the next cue. Keep that line, as part of the next cue.
		if (rolls && prev && prev.end - prev.start < FLASH) {
			prev.text = cue.text;
			prev.end = cue.end;
			continue;
		}
		if (prev && fresh === prev.text) {
			prev.end = Math.max(prev.end, cue.end);
			continue;
		}
		out.push({ ...cue, text: fresh });
	}
	return out;
}

/** SRT and WebVTT share their cue shape: a timing line, then text lines. */
function parseSrtOrVtt(text: string): Cue[] {
	const cues: Cue[] = [];
	for (const block of text.split(/\n{2,}/)) {
		const lines = block.split('\n');
		const at = lines.findIndex((line) => line.includes('-->'));
		if (at < 0) continue;
		const label = (lines[at - 1] ?? '').trim();
		const id = /^\d+$/.test(label) ? Number(label) : cues.length + 1;
		const [from, rest] = (lines[at] ?? '').split('-->');
		// VTT puts cue settings after the end time: `00:01.000 line:90%`.
		const start = parseTime(from ?? '');
		const end = parseTime((rest ?? '').trim().split(/\s+/)[0] ?? '');
		if (start === null || end === null) continue;
		cues.push({ id, start, end, text: cleanText(lines.slice(at + 1).join('\n')) });
	}
	return cues;
}

function parseAss(text: string): Cue[] {
	const cues: Cue[] = [];
	let fields: string[] = [];
	let inEvents = false;
	for (const line of text.split('\n')) {
		if (/^\[.*\]$/.test(line.trim())) {
			inEvents = line.trim().toLowerCase() === '[events]';
			continue;
		}
		if (!inEvents) continue;
		if (line.startsWith('Format:')) {
			fields = line
				.slice(7)
				.split(',')
				.map((field) => field.trim().toLowerCase());
			continue;
		}
		if (!line.startsWith('Dialogue:') || fields.length === 0) continue;
		// Text is the last field and may hold commas of its own.
		const values = line.slice(9).split(',');
		const textValue = values.splice(fields.length - 1).join(',');
		const get = (name: string) => values[fields.indexOf(name)] ?? '';
		const start = parseTime(get('start'));
		const end = parseTime(get('end'));
		if (start === null || end === null) continue;
		cues.push({ id: cues.length + 1, start, end, text: cleanText(textValue) });
	}
	return cues;
}

/** Drop styling: `{\an8}`, `<i>`, `<font ...>`, and ASS line breaks. */
function cleanText(raw: string): string {
	return raw
		.replace(/\{[^}]*\}/g, '')
		.replace(/\\N/gi, '\n')
		.replace(/\\h/g, ' ')
		.replace(/<[^>]+>/g, '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '')
		.join('\n');
}

/* ----------------------------------------------------------- finding --- */

export function cueById(cues: Cue[], id: number): Cue | null {
	return cues.find((cue) => cue.id === id) ?? null;
}

/** The cue on screen at `time`, if any. */
export function cueAt(cues: Cue[], time: number): Cue | null {
	// Last cue that started at or before `time`; overlaps are rare enough.
	let found: Cue | null = null;
	for (const cue of cues) {
		if (cue.start > time) break;
		if (time < cue.end) found = cue;
	}
	return found;
}

/** Start of the first cue after the one playing now. */
export function nextCue(cues: Cue[], time: number): Cue | null {
	return cues.find((cue) => cue.start > time + 0.05) ?? null;
}

/**
 * The cue to go back to. Well into a line, that is the line itself - press
 * again right after, and it is the one before.
 */
export function previousCue(cues: Cue[], time: number): Cue | null {
	let found: Cue | null = null;
	for (const cue of cues) {
		if (cue.start >= time - 0.6) break;
		found = cue;
	}
	return found;
}

/** Where `time` sits: `12 / 1480`, the number of the cue at or before it. */
export function cuePosition(cues: Cue[], time: number): number {
	let index = 0;
	for (const cue of cues) {
		if (cue.start > time) break;
		index++;
	}
	return index;
}
