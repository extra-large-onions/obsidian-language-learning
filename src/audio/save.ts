import { App, TFile } from 'obsidian';
import { Recording } from './recorder';

/**
 * Write a recording into the vault, honouring the user's attachment folder
 * settings, and return the file it landed in.
 */
export async function saveRecording(
	app: App,
	recording: Recording,
	prefix: string,
	sourcePath: string,
): Promise<TFile> {
	const name = `${prefix} ${timestamp()}.${recording.extension}`;
	const path = await app.fileManager.getAvailablePathForAttachment(
		name,
		sourcePath,
	);
	const bytes = await recording.blob.arrayBuffer();
	return app.vault.createBinary(path, bytes);
}

/** An embed link to `file`, in whichever link style the vault is set to. */
export function embedLink(app: App, file: TFile, sourcePath: string): string {
	return `!${app.fileManager.generateMarkdownLink(file, sourcePath)}`;
}

/** `2026-08-29 14.32.05` - dots because colons are illegal in filenames. */
function timestamp(): string {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, '0');
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
	return `${date} ${time}`;
}
