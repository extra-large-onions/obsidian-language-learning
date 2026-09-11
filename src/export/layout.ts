/** Folder that attachments are copied into, inside the export. */
export const ATTACHMENT_DIR = 'attachments';

/**
 * Decide where every file lands inside the export, as paths relative to the
 * export root. Notes sit at the root and attachments in one folder, so two
 * files with the same name from different vault folders would collide - the
 * second one gets a numbered suffix instead of silently overwriting.
 */
export function planLayout(
	rootPath: string,
	notePaths: readonly string[],
	attachmentPaths: readonly string[],
): Map<string, string> {
	const outputs = new Map<string, string>();
	const taken = new Set<string>();

	const claim = (dir: string, name: string): string => {
		const base = stem(name);
		const ext = extension(name);
		let candidate = name;
		let n = 2;
		while (taken.has(key(dir, candidate))) {
			candidate = ext ? `${base} ${n}.${ext}` : `${base} ${n}`;
			n++;
		}
		taken.add(key(dir, candidate));
		return dir ? `${dir}/${candidate}` : candidate;
	};

	outputs.set(rootPath, claim('', basename(rootPath)));
	for (const path of notePaths) {
		if (outputs.has(path)) continue;
		outputs.set(path, claim('', basename(path)));
	}
	for (const path of attachmentPaths) {
		if (outputs.has(path)) continue;
		outputs.set(path, claim(ATTACHMENT_DIR, basename(path)));
	}
	return outputs;
}

const key = (dir: string, name: string) => `${dir}/${name.toLowerCase()}`;

export function basename(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash === -1 ? path : path.slice(slash + 1);
}

/** Filename without its extension. */
export function stem(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot <= 0 ? name : name.slice(0, dot);
}

export function extension(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot <= 0 ? '' : name.slice(dot + 1);
}

/** Percent-encode a vault-relative path for use inside a markdown link. */
export function encodePath(path: string): string {
	return path
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
}

/** Pick a folder name inside `parent` that is not taken yet. */
export function uniqueFolder(
	parent: string,
	name: string,
	exists: (path: string) => boolean,
): string {
	const prefix = parent ? `${parent}/` : '';
	let candidate = `${prefix}${name}`;
	let n = 2;
	while (exists(candidate)) {
		candidate = `${prefix}${name} ${n}`;
		n++;
	}
	return candidate;
}
