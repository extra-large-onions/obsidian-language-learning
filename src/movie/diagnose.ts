import { StreamInfo } from './ffmpeg';

/** Codecs Obsidian's Chromium decodes. HEVC depends on the machine's GPU. */
const PLAYABLE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora']);
const MAYBE_VIDEO = new Set(['hevc']);
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);

export const MEDIA_ERRORS: Record<number, string> = {
	1: 'Loading was aborted.',
	2: 'A network or disk error stopped the file from loading.',
	3: 'The file started to play, then could not be decoded.',
	4: 'The file or its codecs are not supported by Obsidian.',
};

/** Things about the streams that stop playback, or leave it silent. */
export function streamProblems(streams: StreamInfo[]): string[] {
	const problems: string[] = [];
	const video = streams.filter((stream) => stream.type === 'video' && stream.codec !== 'mjpeg' && stream.codec !== 'png');
	const audio = streams.filter((stream) => stream.type === 'audio');

	if (video.length === 0) problems.push('There is no video stream in this file.');
	for (const stream of video) {
		if (MAYBE_VIDEO.has(stream.codec)) {
			problems.push(`Video is ${stream.codec}: it only plays if your GPU decodes it.`);
		} else if (!PLAYABLE_VIDEO.has(stream.codec)) {
			problems.push(`Video is ${stream.codec}, which Obsidian cannot play.`);
		}
	}
	if (audio.length > 0 && !audio.some((stream) => isPlayableAudio(stream.codec))) {
		const codecs = [...new Set(audio.map((stream) => stream.codec))].join(', ');
		problems.push(`Audio is ${codecs}, which Obsidian cannot play - the picture will be silent.`);
	}
	return problems;
}

function isPlayableAudio(codec: string): boolean {
	return PLAYABLE_AUDIO.has(codec) || codec.startsWith('pcm_');
}

/** A command that turns the file into one Obsidian plays. */
export function fixCommand(streams: StreamInfo[], name: string): string {
	const video = streams.find((stream) => stream.type === 'video');
	const audio = streams.find((stream) => stream.type === 'audio');
	const videoArgs =
		video && PLAYABLE_VIDEO.has(video.codec) ? '-c:v copy' : '-c:v libx264 -crf 20 -preset fast';
	const audioArgs = audio && isPlayableAudio(audio.codec) ? '-c:a copy' : '-c:a aac -b:a 192k';
	const out = name.replace(/\.[^.]+$/, '') + '.fixed.mkv';
	return `ffmpeg -i "${name}" -map 0 ${videoArgs} ${audioArgs} -c:s copy "${out}"`;
}
