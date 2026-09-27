/**
 * Read a timestamp as seconds. Takes `1:02:03.450`, `02:03,5`, `123.4` - the
 * shapes subtitle files and people write. Returns null for anything else.
 */
export function parseTime(raw: string): number | null {
	const text = raw.trim().replace(',', '.');
	if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(text)) return null;
	let seconds = 0;
	for (const part of text.split(':')) seconds = seconds * 60 + Number(part);
	return Number.isFinite(seconds) ? seconds : null;
}

/** `1:02:03.450`, or `2:03.450` under an hour. */
export function formatTime(seconds: number, withMillis = true): string {
	const total = Math.max(0, seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (value: number) => String(value).padStart(2, '0');
	const sec = withMillis
		? s.toFixed(3).padStart(6, '0')
		: pad(Math.floor(s));
	return h > 0 ? `${h}:${pad(m)}:${sec}` : `${m}:${sec}`;
}
