import { extension } from './layout';

/** Content types for the attachments Obsidian can embed. */
const MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	webp: 'image/webp',
	avif: 'image/avif',
	bmp: 'image/bmp',
	mp3: 'audio/mpeg',
	m4a: 'audio/mp4',
	wav: 'audio/wav',
	ogg: 'audio/ogg',
	oga: 'audio/ogg',
	flac: 'audio/flac',
	aac: 'audio/aac',
	'3gp': 'audio/3gpp',
	webm: 'video/webm',
	mp4: 'video/mp4',
	mov: 'video/quicktime',
	mkv: 'video/x-matroska',
	pdf: 'application/pdf',
};

/** Only images render from a data URI; audio and PDF need a real file. */
export function isImage(name: string): boolean {
	return mimeFor(name).startsWith('image/');
}

export function mimeFor(name: string): string {
	return MIME[extension(name).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Base64 in fixed chunks. Spreading a whole file into String.fromCharCode
 * overflows the call stack somewhere around a few hundred kilobytes.
 */
export function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const CHUNK = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

export function dataUri(name: string, buffer: ArrayBuffer): string {
	return `data:${mimeFor(name)};base64,${toBase64(buffer)}`;
}

/** Base64 inflates by about 4/3; used to warn before a huge inline export. */
export function inlinedSize(bytes: number): number {
	return Math.ceil(bytes / 3) * 4;
}
