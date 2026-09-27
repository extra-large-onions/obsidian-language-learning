import { TFile } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { hashString } from '../utils/helpers';
import { cacheFolder } from './cache';
import {
	diskPath,
	extractSubtitle,
	isTextSubtitle,
	probe,
} from './ffmpeg';
import { Cue, parseSubtitles } from './subtitles';

export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'];

export type TrackSource =
	| { kind: 'file'; path: string; ext: string }
	| { kind: 'stream'; index: number; codec: string };

export interface SubtitleTrack {
	id: string;
	label: string;
	language: string;
	source: TrackSource;
	/** False for picture subtitles (PGS, VobSub), which have no text to read. */
	usable: boolean;
	/** When the source last changed, so an edited file is read again. */
	mtime: number;
}

export interface LoadedTrack {
	track: SubtitleTrack;
	cues: Cue[];
}

/**
 * Finds a movie's subtitles - files beside it named after it, and streams
 * inside it - and reads them once. Both the player and the movie blocks ask
 * here, so a film's subtitles are extracted a single time.
 */
export class SubtitleStore {
	private readonly plugin: LanguageLearningPlugin;
	private readonly tracks = new Map<string, Promise<SubtitleTrack[]>>();
	private readonly cues = new Map<string, Promise<Cue[]>>();
	/** Track picked by hand for each movie, by path. */
	private readonly chosen = new Map<string, string>();

	constructor(plugin: LanguageLearningPlugin) {
		this.plugin = plugin;
	}

	tracksFor(movie: TFile): Promise<SubtitleTrack[]> {
		const key = movie.path;
		let found = this.tracks.get(key);
		if (!found) {
			found = this.findTracks(movie);
			this.tracks.set(key, found);
			// A failed probe (no ffmpeg yet) should be tried again next time.
			found.catch(() => this.tracks.delete(key));
		}
		return found;
	}

	/** Look for subtitle files again - one may have been added since. */
	forget(movie: TFile): void {
		this.tracks.delete(movie.path);
	}

	choose(movie: TFile, trackId: string): void {
		this.chosen.set(movie.path, trackId);
	}

	/** The picked track, or the best guess, with its cues. */
	async current(movie: TFile): Promise<LoadedTrack | null> {
		const tracks = await this.tracksFor(movie);
		const usable = tracks.filter((track) => track.usable);
		const picked =
			usable.find((track) => track.id === this.chosen.get(movie.path)) ??
			this.bestGuess(usable);
		if (!picked) return null;
		return { track: picked, cues: await this.load(movie, picked) };
	}

	load(movie: TFile, track: SubtitleTrack): Promise<Cue[]> {
		const key = `${movie.path}|${track.id}|${track.mtime}`;
		let found = this.cues.get(key);
		if (!found) {
			found = this.read(movie, track);
			this.cues.set(key, found);
			found.catch(() => this.cues.delete(key));
		}
		return found;
	}

	/* --------------------------------------------------------- finding --- */

	private async findTracks(movie: TFile): Promise<SubtitleTrack[]> {
		const tracks: SubtitleTrack[] = [];
		// Asked of the disk, not the vault: Obsidian leaves out file types it
		// does not know unless "Detect all file extensions" is on.
		const adapter = this.plugin.app.vault.adapter;
		const folder = movie.parent?.path ?? '';
		const listing = await adapter.list(folder === '/' ? '' : folder);
		for (const path of listing.files) {
			const name = path.slice(path.lastIndexOf('/') + 1);
			const dot = name.lastIndexOf('.');
			const ext = name.slice(dot + 1).toLowerCase();
			const basename = name.slice(0, dot);
			if (!SUBTITLE_EXTENSIONS.includes(ext)) continue;
			if (basename !== movie.basename && !basename.startsWith(`${movie.basename}.`)) {
				continue;
			}
			// `Movie.ko.srt` says its language after the movie's name.
			const language = basename.slice(movie.basename.length + 1);
			const stat = await adapter.stat(path);
			tracks.push({
				id: `file:${path}`,
				label: name.slice(movie.basename.length) || name,
				language,
				source: { kind: 'file', path, ext },
				usable: true,
				mtime: stat?.mtime ?? 0,
			});
		}

		const path = diskPath(this.plugin.app, movie);
		if (path) {
			try {
				const streams = await probe(this.plugin.settings.ffmpegPath, path);
				for (const stream of streams) {
					if (stream.type !== 'subtitle') continue;
					const usable = isTextSubtitle(stream.codec);
					const name = [stream.language, stream.title].filter(Boolean).join(' - ');
					tracks.push({
						id: `stream:${stream.index}`,
						label: `Embedded #${stream.index}${name ? ` (${name})` : ''}` +
							(usable ? '' : ` - ${stream.codec}, picture only`),
						language: stream.language,
						source: { kind: 'stream', index: stream.index, codec: stream.codec },
						usable,
						mtime: movie.stat.mtime,
					});
				}
			} catch (error) {
				// Sidecar files still work without ffmpeg; say so, then go on.
				if (tracks.length === 0) throw error;
				console.warn('Language learning: could not probe the movie', error);
			}
		}
		return tracks;
	}

	private bestGuess(tracks: SubtitleTrack[]): SubtitleTrack | null {
		const wanted = languageCodes(this.plugin.settings.sentenceLanguage);
		const matches = (track: SubtitleTrack) => {
			const lang = track.language.toLowerCase();
			return (
				wanted.includes(lang) ||
				wanted.some((code) => track.label.toLowerCase().includes(`.${code}.`))
			);
		};
		// A file beside the movie is what the user put there on purpose.
		return (
			tracks.find(matches) ??
			tracks.find((track) => track.source.kind === 'file') ??
			tracks[0] ??
			null
		);
	}

	/* --------------------------------------------------------- reading --- */

	private async read(movie: TFile, track: SubtitleTrack): Promise<Cue[]> {
		const { source } = track;
		const adapter = this.plugin.app.vault.adapter;
		if (source.kind === 'file') {
			const bytes = await adapter.readBinary(source.path);
			return parseSubtitles(decodeText(bytes), source.ext);
		}

		const dir = await cacheFolder(this.plugin, 'subtitles');
		const cached = `${dir}/${hashString(`${movie.path}|${movie.stat.mtime}|${source.index}`)}.srt`;
		if (await adapter.exists(cached)) {
			return parseSubtitles(await adapter.read(cached), 'srt');
		}

		const path = diskPath(this.plugin.app, movie);
		if (!path) throw new Error('Embedded subtitles need the desktop app.');
		const srt = await extractSubtitle(this.plugin.settings.ffmpegPath, path, source.index);
		await adapter.write(cached, srt);
		return parseSubtitles(srt, 'srt');
	}
}

/**
 * Subtitle files are often not UTF-8: Korean ones are frequently CP949. Try
 * UTF-8 strictly, and fall back to the legacy encoding.
 */
function decodeText(bytes: ArrayBuffer): string {
	const view = new Uint8Array(bytes);
	if (view[0] === 0xff && view[1] === 0xfe) return new TextDecoder('utf-16le').decode(view);
	if (view[0] === 0xfe && view[1] === 0xff) return new TextDecoder('utf-16be').decode(view);
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(view);
	} catch {
		return new TextDecoder('euc-kr').decode(view);
	}
}

const LANGUAGE_CODES: Record<string, string[]> = {
	korean: ['ko', 'kor'],
	japanese: ['ja', 'jpn'],
	chinese: ['zh', 'chi', 'zho'],
	english: ['en', 'eng'],
	french: ['fr', 'fre', 'fra'],
	german: ['de', 'ger', 'deu'],
	spanish: ['es', 'spa'],
};

function languageCodes(name: string): string[] {
	const key = name.trim().toLowerCase();
	return LANGUAGE_CODES[key] ?? [key.slice(0, 2), key.slice(0, 3), key];
}
