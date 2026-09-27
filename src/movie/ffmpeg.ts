import { App, FileSystemAdapter, Platform, TFile } from 'obsidian';

type ChildProcess = typeof import('child_process');

/** One stream of a media file, as ffprobe reports it. */
export interface StreamInfo {
	/** Index across all streams, as `-map 0:<index>` wants it. */
	index: number;
	/** `video`, `audio`, `subtitle`, ... */
	type: string;
	codec: string;
	language: string;
	title: string;
}

interface RawProbe {
	streams?: {
		index?: number;
		codec_type?: string;
		codec_name?: string;
		tags?: Record<string, string>;
	}[];
}

/** Thrown when the program cannot be started at all, not when it fails. */
export class FfmpegMissingError extends Error {}

/**
 * Node's child_process, reached at call time. A top-level import would stop
 * the whole plugin from loading on mobile, where there is no Node.
 */
function childProcess(): ChildProcess | null {
	if (!Platform.isDesktopApp) return null;
	const load = (window as unknown as { require?: (id: string) => unknown })
		.require;
	return load ? (load('child_process') as ChildProcess) : null;
}

/** The file's path on disk, which ffmpeg needs. Null off the desktop. */
export function diskPath(app: App, file: TFile): string | null {
	const adapter = app.vault.adapter;
	return adapter instanceof FileSystemAdapter
		? adapter.getFullPath(file.path)
		: null;
}

/** ffprobe lives beside ffmpeg; a custom ffmpeg path implies where. */
function probePath(ffmpeg: string): string {
	return /ffmpeg(\.exe)?$/i.test(ffmpeg)
		? ffmpeg.replace(/ffmpeg(\.exe)?$/i, (_m, exe: string | undefined) => `ffprobe${exe ?? ''}`)
		: 'ffprobe';
}

interface RunResult {
	stdout: Uint8Array<ArrayBuffer>;
	stderr: string;
}

function run(program: string, args: string[]): Promise<RunResult> {
	const cp = childProcess();
	if (!cp) {
		return Promise.reject(
			new FfmpegMissingError('ffmpeg needs the desktop app.'),
		);
	}
	return new Promise((resolve, reject) => {
		const child = cp.spawn(program, args, { windowsHide: true });
		const out: Uint8Array[] = [];
		let err = '';
		child.stdout.on('data', (chunk: Uint8Array) => out.push(chunk));
		child.stderr.on('data', (chunk: Uint8Array) => {
			// Only the tail matters, and a chatty run should not grow forever.
			err = (err + new TextDecoder().decode(chunk)).slice(-4000);
		});
		child.on('error', (error: Error & { code?: string }) => {
			reject(
				error.code === 'ENOENT'
					? new FfmpegMissingError(
							`Could not start "${program}". Install ffmpeg, or set its ` +
								'path in Settings → Language learning → Movie.',
						)
					: error,
			);
		});
		child.on('close', (code) => {
			if (code === 0) resolve({ stdout: concat(out), stderr: err });
			else reject(new Error(`${program} exited with ${code}: ${err.trim()}`));
		});
	});
}

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
	const all = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		all.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return all;
}

export async function probe(ffmpeg: string, path: string): Promise<StreamInfo[]> {
	const { stdout } = await run(probePath(ffmpeg), [
		'-v', 'error',
		'-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language,title',
		'-of', 'json',
		path,
	]);
	const raw = JSON.parse(new TextDecoder().decode(stdout)) as RawProbe;
	return (raw.streams ?? []).map((stream) => ({
		index: stream.index ?? 0,
		type: stream.codec_type ?? '',
		codec: stream.codec_name ?? '',
		language: stream.tags?.['language'] ?? '',
		title: stream.tags?.['title'] ?? '',
	}));
}

/** Subtitle codecs that are text, and so can become SRT. */
const TEXT_SUBTITLES = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);

export function isTextSubtitle(codec: string): boolean {
	return TEXT_SUBTITLES.has(codec);
}

/** An embedded subtitle stream, converted to SRT text. Reads the whole file. */
export async function extractSubtitle(
	ffmpeg: string,
	path: string,
	streamIndex: number,
): Promise<string> {
	const { stdout } = await run(ffmpeg, [
		'-v', 'error',
		'-i', path,
		'-map', `0:${streamIndex}`,
		'-f', 'srt',
		'-',
	]);
	return new TextDecoder().decode(stdout);
}

/**
 * One frame at `seconds`, as PNG bytes. Seeking before the input is fast and,
 * since ffmpeg 2.1, still frame-accurate. Anamorphic video is squared up.
 */
export async function grabFrame(
	ffmpeg: string,
	path: string,
	seconds: number,
): Promise<Uint8Array<ArrayBuffer>> {
	const { stdout } = await run(ffmpeg, [
		'-v', 'error',
		'-ss', seconds.toFixed(3),
		'-i', path,
		'-frames:v', '1',
		'-vf', 'scale=iw*sar:ih,setsar=1',
		'-f', 'image2pipe',
		'-c:v', 'png',
		'-',
	]);
	if (stdout.byteLength === 0) {
		throw new Error(`No frame at ${seconds.toFixed(1)}s - is that past the end?`);
	}
	return stdout;
}
