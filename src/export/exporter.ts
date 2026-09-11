import { App, TFile } from 'obsidian';
import { EmbedRef, findRefs, rewriteRefs } from './scan';
import { Collected, isDocument, resolveTarget } from './collect';
import { CanvasNode, parseCanvas, stringifyCanvas } from './canvas';
import { dataUri, isImage } from './inline';
import {
	ATTACHMENT_DIR,
	basename,
	encodePath,
	planLayout,
	stem,
	uniqueFolder,
} from './layout';
import { chapterName } from '../chapter/file';

export interface ExportOptions {
	/** Write a folder with the attachments beside the document. */
	folder: boolean;
	/** Write a single markdown file with everything as data URIs. */
	inline: boolean;
	/** Vault folder the export is written into. */
	destination: string;
}

export interface ExportResult {
	folderPath: string | null;
	inlinePath: string | null;
	notes: number;
	attachments: number;
	missing: string[];
	/** Notes on what inline mode could not carry cleanly. */
	warnings: string[];
}

export async function runExport(
	app: App,
	collected: Collected,
	options: ExportOptions,
): Promise<ExportResult> {
	const result: ExportResult = {
		folderPath: null,
		inlinePath: null,
		notes: collected.notes.length,
		attachments: collected.attachments.length,
		missing: collected.missing,
		warnings: [],
	};

	await ensureFolder(app, options.destination);

	if (options.folder) {
		result.folderPath = await exportFolder(app, collected, options.destination);
	}
	if (options.inline) {
		const inline = await exportInline(app, collected, options.destination);
		result.inlinePath = inline.path;
		result.warnings = inline.warnings;
	}
	return result;
}

/* -------------------------------------------------------------- folder --- */

async function exportFolder(
	app: App,
	collected: Collected,
	destination: string,
): Promise<string> {
	const { root, notes, attachments } = collected;
	const layout = planLayout(
		root.path,
		notes.map((file) => file.path),
		attachments.map((file) => file.path),
	);

	const rootFolder = uniqueFolder(
		destination,
		stem(basename(root.path)),
		(path) => app.vault.getAbstractFileByPath(path) !== null,
	);
	await app.vault.createFolder(rootFolder);
	if (attachments.length > 0) {
		await app.vault.createFolder(`${rootFolder}/${ATTACHMENT_DIR}`);
	}

	for (const file of [root, ...notes]) {
		const out = layout.get(file.path);
		if (!out) continue;
		const text = await app.vault.cachedRead(file);
		const rewritten =
			file.extension === 'canvas'
				? rewriteCanvas(app, file, text, layout)
				: rewriteDocument(app, file, text, layout);
		await app.vault.create(`${rootFolder}/${out}`, rewritten);
	}

	for (const file of attachments) {
		const out = layout.get(file.path);
		if (!out) continue;
		const bytes = await app.vault.readBinary(file);
		await app.vault.createBinary(`${rootFolder}/${out}`, bytes);
	}

	return rootFolder;
}

/** Point every embed in a markdown document at its place in the export. */
function rewriteDocument(
	app: App,
	file: TFile,
	text: string,
	layout: Map<string, string>,
): string {
	return rewriteRefs(text, findRefs(text), (ref) => {
		const resolved = resolveTarget(app, ref.target, file.path);
		const out = resolved ? layout.get(resolved.path) : undefined;
		if (!resolved || !out) return null;
		return relink(ref, resolved, out);
	});
}

function rewriteCanvas(
	app: App,
	file: TFile,
	text: string,
	layout: Map<string, string>,
): string {
	const canvas = parseCanvas(text);
	if (!canvas) return text;

	for (const node of canvas.nodes ?? []) {
		rewriteCanvasNode(app, file, node, layout);
	}
	return stringifyCanvas(canvas);
}

function rewriteCanvasNode(
	app: App,
	file: TFile,
	node: CanvasNode,
	layout: Map<string, string>,
): void {
	if (typeof node.file === 'string' && node.file !== '') {
		const resolved = resolveTarget(app, node.file, file.path);
		const out = resolved ? layout.get(resolved.path) : undefined;
		if (out) node.file = out;
	}
	if (typeof node.text === 'string') {
		node.text = rewriteDocument(app, file, node.text, layout);
	}
}

/** Rebuild one reference, keeping the syntax the author used. */
function relink(ref: EmbedRef, resolved: TFile, out: string): string {
	// Notes live at the export root, so a bare name still resolves.
	const wikiTarget = isDocument(resolved) ? stem(basename(out)) : out;
	if (ref.kind === 'wiki') {
		return ref.alias ? `![[${wikiTarget}|${ref.alias}]]` : `![[${wikiTarget}]]`;
	}
	return `![${ref.alias}](${encodePath(out)})`;
}

/* -------------------------------------------------------------- inline --- */

/**
 * One markdown file with every attachment as a data URI. A chapter keeps its
 * `.chapter` mark, so the export is still read a page at a time.
 */
async function exportInline(
	app: App,
	collected: Collected,
	destination: string,
): Promise<{ path: string; warnings: string[] }> {
	const warnings: string[] = [];
	const body = await inlineDocument(app, collected.root, warnings);

	// `Lesson 1.chapter` becomes `Lesson 1 (inline).chapter`, keeping the mark
	// last where it is read from.
	const stemmed = stem(basename(collected.root.path));
	const label = chapterName(stemmed);
	const suffix = stemmed.slice(label.length);
	const name = uniqueFolder(
		destination,
		`${label} (inline)${suffix}`,
		(path) => app.vault.getAbstractFileByPath(`${path}.md`) !== null,
	);
	const path = `${name}.md`;
	await app.vault.create(path, body);
	return { path, warnings };
}

async function inlineDocument(
	app: App,
	file: TFile,
	warnings: string[],
): Promise<string> {
	const text = await app.vault.cachedRead(file);
	const refs = findRefs(text);

	// Resolve every replacement first; rewriteRefs itself stays synchronous.
	const replacements = new Map<number, string>();
	for (const ref of refs) {
		const resolved = resolveTarget(app, ref.target, file.path);
		if (!resolved) continue;

		if (!isDocument(resolved)) {
			const bytes = await app.vault.readBinary(resolved);
			const uri = dataUri(resolved.name, bytes);
			replacements.set(ref.start, `![${ref.alias}](${uri})`);
			// The bytes travel either way, but only images draw from a URI.
			if (!isImage(resolved.name)) {
				warnings.push(`${resolved.path} - carried as data, but only a folder export gives it a player`);
			}
			continue;
		}

		// An embedded note is a transclusion, not a file a data URI can carry.
		warnings.push(`${resolved.path} - embedded note left as a link`);
	}

	return rewriteRefs(text, refs, (ref) => replacements.get(ref.start) ?? null);
}

/* --------------------------------------------------------------- utils --- */

/** Create `path` and any missing parents. */
export async function ensureFolder(app: App, path: string): Promise<void> {
	const parts = path.split('/').filter((part) => part !== '');
	let current = '';
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (app.vault.getAbstractFileByPath(current) === null) {
			await app.vault.createFolder(current);
		}
	}
}
