import { Editor, Notice, TFile } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { compressImage } from './compress';
import { embedLink } from '../audio/save';
import { extension } from '../export/layout';
import { formatBytes } from '../utils/helpers';

interface Stored {
	file: TFile;
	size: number;
	/** `1280x720`, or an empty string if the image went in unchanged. */
	label: string;
}

/**
 * Shrink images as they enter a note. Obsidian saves a pasted screenshot at
 * full size, so this handler takes the paste over and writes a scaled copy.
 */
export function registerImagePaste(plugin: LanguageLearningPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('editor-paste', (evt, editor, info) => {
			if (evt.defaultPrevented) return;
			if (!plugin.settings.compressPastedImages) return;
			const images = imagesIn(evt.clipboardData);
			if (images.length === 0) return;
			evt.preventDefault();
			void insertAll(plugin, images, editor, info.file);
		}),
	);
	plugin.registerEvent(
		plugin.app.workspace.on('editor-drop', (evt, editor, info) => {
			if (evt.defaultPrevented) return;
			if (!plugin.settings.compressPastedImages) return;
			const images = imagesIn(evt.dataTransfer);
			if (images.length === 0) return;
			evt.preventDefault();
			void insertAll(plugin, images, editor, info.file);
		}),
	);
}

/** The image files in a paste or a drop. */
function imagesIn(data: DataTransfer | null): File[] {
	return Array.from(data?.files ?? []).filter((file) =>
		file.type.startsWith('image/'),
	);
}

async function insertAll(
	plugin: LanguageLearningPlugin,
	images: File[],
	editor: Editor,
	note: TFile | null,
): Promise<void> {
	const sourcePath = note?.path ?? '';
	let before = 0;
	let after = 0;
	let shrunk = 0;
	let label = '';

	for (const image of images) {
		try {
			const stored = await store(plugin, image, sourcePath);
			editor.replaceSelection(
				`${embedLink(plugin.app, stored.file, sourcePath)}\n`,
			);
			before += image.size;
			after += stored.size;
			if (stored.label !== '') {
				shrunk++;
				label = stored.label;
			}
		} catch (error) {
			console.error('Language learning: could not save the image', error);
			new Notice('Could not save the image.');
		}
	}

	if (shrunk === 0) return;
	const scope = shrunk === 1 ? label : `${shrunk} images`;
	new Notice(
		`${scope} - ${formatBytes(before)} to ${formatBytes(after)}`,
		4000,
	);
}

/** Write one image into the attachment folder and report what it cost. */
async function store(
	plugin: LanguageLearningPlugin,
	image: File,
	sourcePath: string,
): Promise<Stored> {
	const original = await image.arrayBuffer();
	const smaller = await compressImage(image, image.name, {
		maxEdge: plugin.settings.imageMaxEdge,
		quality: plugin.settings.imageQuality / 100,
		format: plugin.settings.imageFormat,
	});

	const bytes = smaller ? smaller.bytes : original;
	const ext = smaller ? smaller.extension : extension(image.name) || 'png';
	const path = await plugin.app.fileManager.getAvailablePathForAttachment(
		`${pastedName()}.${ext}`,
		sourcePath,
	);
	const file = await plugin.app.vault.createBinary(path, bytes);

	return {
		file,
		size: bytes.byteLength,
		label: smaller ? `${smaller.width}x${smaller.height}` : '',
	};
}

/** `Pasted image 20260830143005`, the name Obsidian itself gives a paste. */
function pastedName(): string {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, '0');
	return [
		'Pasted image ',
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
	].join('');
}
