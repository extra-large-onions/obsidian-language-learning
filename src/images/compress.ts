import { extension } from '../export/layout';

export type ImageFormat = 'webp' | 'jpeg';

export interface CompressOptions {
	/** Longest edge in pixels. At 1280, a 1920x1080 frame becomes 1280x720. */
	maxEdge: number;
	/** Encoder quality, from 0 to 1. */
	quality: number;
	/** Container for the new image. */
	format: ImageFormat;
}

export interface CompressedImage {
	bytes: ArrayBuffer;
	extension: string;
	width: number;
	height: number;
}

/** File extension for each type a canvas can write. */
const EXTENSIONS: Record<string, string> = {
	'image/webp': 'webp',
	'image/jpeg': 'jpg',
	'image/png': 'png',
};

/**
 * Formats that a canvas cannot re-encode without a loss of function: a GIF
 * keeps only its first frame, and an SVG stops being a vector.
 */
const KEEP_AS_IS = /gif|svg/;

export function isCompressible(name: string, type: string): boolean {
	if (!type.startsWith('image/')) return false;
	return !KEEP_AS_IS.test(type) && !KEEP_AS_IS.test(extension(name).toLowerCase());
}

/**
 * Size of an image after it fits inside a box of `maxEdge` on its longest
 * side. A small image is never scaled up: that only loses quality.
 */
export function fitInside(
	width: number,
	height: number,
	maxEdge: number,
): { width: number; height: number } {
	const scale = Math.min(1, maxEdge / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

/**
 * Scale an image down to fit `maxEdge`, then re-encode it. Returns null if
 * the image is unreadable, or if the result is not smaller than the source -
 * a re-encode that costs bytes is not worth the loss of quality.
 */
export async function compressImage(
	blob: Blob,
	name: string,
	options: CompressOptions,
): Promise<CompressedImage | null> {
	if (!isCompressible(name, blob.type)) return null;

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(blob);
	} catch (error) {
		console.error('Language learning: could not read the image', error);
		return null;
	}

	try {
		const { width, height } = fitInside(
			bitmap.width,
			bitmap.height,
			options.maxEdge,
		);
		const encoded = await encode(bitmap, width, height, options);
		if (!encoded || encoded.size >= blob.size) return null;

		return {
			bytes: await encoded.arrayBuffer(),
			extension: EXTENSIONS[encoded.type] ?? 'png',
			width,
			height,
		};
	} finally {
		bitmap.close();
	}
}

async function encode(
	bitmap: ImageBitmap,
	width: number,
	height: number,
	options: CompressOptions,
): Promise<Blob | null> {
	const canvas = createEl('canvas');
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	// JPEG has no alpha channel. Without this fill, transparency turns black.
	if (options.format === 'jpeg') {
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);
	}
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, width, height);

	const wanted = `image/${options.format}`;
	const first = await toBlob(canvas, wanted, options.quality);
	// A renderer without WebP answers with a PNG, which is larger, not smaller.
	if (first && first.type !== wanted && options.format === 'webp') {
		return (await toBlob(canvas, 'image/jpeg', options.quality)) ?? first;
	}
	return first;
}

export function toBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality: number,
): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
