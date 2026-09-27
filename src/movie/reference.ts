import { App, TFile } from 'obsidian';
import { MOVIE_BLOCK_LANG } from '../utils/constants';
import { formatTime, parseTime } from './time';

/**
 * What a movie block points at:
 *
 *     ```movie
 *     file: cinema/Parasite.mp4
 *     line: 42
 *     time: 1:02:03.450
 *     ```
 *
 * `line` is the subtitle line's number in the .srt; the block shows that
 * line's text, read from the file. `time` is the frame for the thumbnail and
 * where play starts; without it, the line's start is used. Either one alone
 * is enough. `text` overrides the subtitle, or stands in when there is none.
 */
export interface MovieRef {
	file: string;
	line: number | null;
	time: number | null;
	text: string;
}

export function parseMovieBlock(source: string): MovieRef | string {
	const fields = new Map<string, string>();
	let last = '';
	for (const line of source.split('\n')) {
		const match = /^\s*(file|line|time|text)\s*:\s?(.*)$/i.exec(line);
		if (match) {
			last = (match[1] ?? '').toLowerCase();
			fields.set(last, (match[2] ?? '').trim());
		} else if (last === 'text' && line.trim() !== '') {
			// A two-line subtitle carries on under `text:`.
			fields.set('text', `${fields.get('text') ?? ''}\n${line.trim()}`);
		}
	}
	const file = (fields.get('file') ?? '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '');
	if (file === '') return 'Missing "file:" - the movie this points at.';

	const rawLine = (fields.get('line') ?? '').replace(/^#/, '');
	const line = /^\d+$/.test(rawLine) ? Number(rawLine) : null;
	if (rawLine !== '' && line === null) return `"line: ${rawLine}" is not a line number.`;
	const rawTime = fields.get('time') ?? '';
	const time = rawTime === '' ? null : parseTime(rawTime);
	if (rawTime !== '' && time === null) return `"time: ${rawTime}" is unreadable - write it as 1:02:03.450.`;
	if (line === null && time === null) return 'Give a "line:" from the subtitles, a "time:", or both.';

	return { file, line, time, text: fields.get('text') ?? '' };
}

export function buildMovieBlock(ref: MovieRef): string {
	const lines = [`file: ${ref.file}`];
	if (ref.line !== null) lines.push(`line: ${ref.line}`);
	if (ref.time !== null) lines.push(`time: ${formatTime(ref.time)}`);
	const [first, ...rest] = ref.text.split('\n');
	if (first) lines.push(`text: ${first}`, ...rest);
	return ['```' + MOVIE_BLOCK_LANG, ...lines, '```', ''].join('\n');
}

/** A path, or a link as `[[...]]` would resolve it from this note. */
export function resolveMovie(app: App, link: string, sourcePath: string): TFile | null {
	const direct = app.vault.getAbstractFileByPath(link);
	if (direct instanceof TFile) return direct;
	return app.metadataCache.getFirstLinkpathDest(link, sourcePath);
}
