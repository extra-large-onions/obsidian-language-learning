/** A finished recording, ready to be written into the vault. */
export interface Recording {
	blob: Blob;
	/** File extension matching the codec the browser actually gave us. */
	extension: string;
}

/**
 * Containers in preference order. Obsidian can embed all of these; which one
 * is available depends on the platform (webm on desktop, mp4 on iOS).
 */
const CANDIDATES: ReadonlyArray<readonly [string, string]> = [
	['audio/webm;codecs=opus', 'webm'],
	['audio/webm', 'webm'],
	['audio/ogg;codecs=opus', 'ogg'],
	['audio/mp4', 'm4a'],
];

/** The best container this platform can record, or null if none can. */
export function pickMimeType(): { mimeType: string; extension: string } | null {
	if (typeof MediaRecorder === 'undefined') return null;
	for (const [mimeType, extension] of CANDIDATES) {
		if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType, extension };
	}
	return null;
}

/**
 * Microphone capture over MediaRecorder. The microphone track is always
 * released on stop or cancel, so the recording indicator does not linger.
 */
export class VoiceRecorder {
	private stream: MediaStream | null = null;
	private recorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private extension = 'webm';
	private startedAt = 0;

	/** Milliseconds captured so far. */
	get elapsed(): number {
		return this.startedAt === 0 ? 0 : Date.now() - this.startedAt;
	}

	get isRecording(): boolean {
		return this.recorder?.state === 'recording';
	}

	/** Ask for the microphone and begin capturing. */
	async start(): Promise<void> {
		const format = pickMimeType();
		if (!format) {
			throw new Error('This platform cannot record audio.');
		}
		this.extension = format.extension;

		try {
			this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch (error) {
			throw new Error(describeMicError(error));
		}

		this.chunks = [];
		this.recorder = new MediaRecorder(this.stream, {
			mimeType: format.mimeType,
		});
		this.recorder.addEventListener('dataavailable', (event) => {
			if (event.data.size > 0) this.chunks.push(event.data);
		});
		this.recorder.start();
		this.startedAt = Date.now();
	}

	/** Stop capturing and resolve with what was recorded. */
	stop(): Promise<Recording> {
		const recorder = this.recorder;
		if (!recorder || recorder.state === 'inactive') {
			this.release();
			return Promise.reject(new Error('Nothing was recorded.'));
		}

		return new Promise<Recording>((resolve, reject) => {
			recorder.addEventListener(
				'stop',
				() => {
					const blob = new Blob(this.chunks, { type: recorder.mimeType });
					this.release();
					if (blob.size === 0) reject(new Error('Nothing was recorded.'));
					else resolve({ blob, extension: this.extension });
				},
				{ once: true },
			);
			recorder.stop();
		});
	}

	/** Abandon the recording and free the microphone. */
	cancel(): void {
		if (this.recorder?.state === 'recording') this.recorder.stop();
		this.chunks = [];
		this.release();
	}

	private release(): void {
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
		this.recorder = null;
		this.startedAt = 0;
	}
}

/** Turn a getUserMedia rejection into something worth showing a person. */
function describeMicError(error: unknown): string {
	const name = error instanceof Error ? error.name : '';
	if (name === 'NotAllowedError' || name === 'SecurityError') {
		return 'Microphone access was denied. Allow it in your system settings.';
	}
	if (name === 'NotFoundError' || name === 'OverconstrainedError') {
		return 'No microphone was found.';
	}
	if (name === 'NotReadableError') {
		return 'The microphone is already in use by another app.';
	}
	return 'Could not start recording.';
}

/** `m:ss` for the elapsed-time readout. */
export function formatElapsed(ms: number): string {
	const total = Math.floor(ms / 1000);
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
