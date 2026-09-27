import { TFile } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { fitInside, toBlob } from '../images/compress';
import { hashString } from '../utils/helpers';
import { cacheFolder } from './cache';
import { diskPath, grabFrame } from './ffmpeg';
import { formatTime } from './time';

const EXTENSIONS = ['webp', 'jpg'];

/**
 * Cache file name for a moment: `Parasite k3x9 1.02.03.450`. The movie's
 * name keeps the folder browsable, the hash keeps two movies of one name
 * apart. The subtitle text is not part of it.
 */
function keyOf(movie: TFile, time: number): string {
	const name = movie.basename.replace(/[^\p{L}\p{N} _-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
	const stamp = formatTime(time).replace(/:/g, '.');
	return `${name} ${hashString(movie.path).slice(0, 4)} ${stamp}`;
}

/** URL of the cached thumbnail, or null if none has been made yet. */
export async function cachedThumbnail(
	plugin: LanguageLearningPlugin,
	movie: TFile,
	time: number,
): Promise<string | null> {
	const dir = await cacheFolder(plugin, 'thumbnails');
	const adapter = plugin.app.vault.adapter;
	for (const ext of EXTENSIONS) {
		const path = `${dir}/${keyOf(movie, time)}.${ext}`;
		if (await adapter.exists(path)) return bust(adapter.getResourcePath(path));
	}
	return null;
}

/**
 * Grab the frame with ffmpeg, write the subtitle across its foot, scale it
 * down and encode it with the same settings as pasted images. Returns the
 * new thumbnail's URL.
 */
export async function makeThumbnail(
	plugin: LanguageLearningPlugin,
	movie: TFile,
	time: number,
	text: string,
): Promise<string> {
	const path = diskPath(plugin.app, movie);
	if (!path) throw new Error('Thumbnails need ffmpeg, so the desktop app.');
	const png = await grabFrame(plugin.settings.ffmpegPath, path, time);
	const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));

	const { settings } = plugin;
	const { width, height } = fitInside(bitmap.width, bitmap.height, settings.imageMaxEdge);
	const canvas = createEl('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not draw the thumbnail.');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	if (text.trim() !== '') drawSubtitle(ctx, text, width, height);

	const wanted = `image/${settings.imageFormat}`;
	let blob = await toBlob(canvas, wanted, settings.imageQuality / 100);
	if (blob && blob.type !== wanted) {
		blob = await toBlob(canvas, 'image/jpeg', settings.imageQuality / 100);
	}
	if (!blob) throw new Error('Could not encode the thumbnail.');

	const dir = await cacheFolder(plugin, 'thumbnails');
	const adapter = plugin.app.vault.adapter;
	const key = keyOf(movie, time);
	for (const ext of EXTENSIONS) {
		const old = `${dir}/${key}.${ext}`;
		if (await adapter.exists(old)) await adapter.remove(old);
	}
	const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
	const out = `${dir}/${key}.${ext}`;
	await adapter.writeBinary(out, await blob.arrayBuffer());
	return bust(adapter.getResourcePath(out));
}

/** White text with a dark outline, as a film shows it, wrapped to fit. */
function drawSubtitle(
	ctx: CanvasRenderingContext2D,
	text: string,
	width: number,
	height: number,
): void {
	const size = Math.max(14, Math.round(height * 0.055));
	const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
	ctx.font = `600 ${size}px ${family}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.lineJoin = 'round';

	const lines = text
		.split('\n')
		.flatMap((line) => wrap(ctx, line, width * 0.9));
	const lineHeight = size * 1.25;
	let y = height - size * 0.9 - (lines.length - 1) * lineHeight;
	for (const line of lines) {
		ctx.lineWidth = Math.max(3, size / 6);
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
		ctx.strokeText(line, width / 2, y);
		ctx.fillStyle = '#ffffff';
		ctx.fillText(line, width / 2, y);
		y += lineHeight;
	}
}

/** Break a line at spaces - or anywhere, for text with none - to fit `max`. */
function wrap(ctx: CanvasRenderingContext2D, line: string, max: number): string[] {
	const out: string[] = [];
	let current = '';
	const words = line.includes(' ') ? line.split(' ') : Array.from(line);
	const joiner = line.includes(' ') ? ' ' : '';
	for (const word of words) {
		const next = current === '' ? word : `${current}${joiner}${word}`;
		if (current !== '' && ctx.measureText(next).width > max) {
			out.push(current);
			current = word;
		} else {
			current = next;
		}
	}
	if (current !== '') out.push(current);
	return out;
}

/** A fresh query, so a regenerated image is not served from the cache. */
function bust(url: string): string {
	return `${url.replace(/\?.*$/, '')}?${Date.now()}`;
}
