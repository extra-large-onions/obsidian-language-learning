/**
 * Minimal JSON Canvas shapes. Obsidian ships no types for the `.canvas`
 * format, so we describe only the parts an export has to touch and carry
 * everything else through untouched.
 */
export interface CanvasNode {
	id?: string;
	type?: string;
	/** Vault path, on `file` nodes. */
	file?: string;
	/** Markdown, on `text` nodes. */
	text?: string;
	[key: string]: unknown;
}

export interface CanvasData {
	nodes?: CanvasNode[];
	edges?: unknown[];
	[key: string]: unknown;
}

/** Parse a `.canvas` file, or null when it is not valid canvas JSON. */
export function parseCanvas(text: string): CanvasData | null {
	if (text.trim() === '') return { nodes: [], edges: [] };
	try {
		const data: unknown = JSON.parse(text);
		if (typeof data !== 'object' || data === null) return null;
		const nodes = (data as CanvasData).nodes;
		if (nodes !== undefined && !Array.isArray(nodes)) return null;
		return data as CanvasData;
	} catch {
		return null;
	}
}

/** Serialise a canvas the way Obsidian writes it. */
export function stringifyCanvas(data: CanvasData): string {
	return JSON.stringify(data, null, '\t');
}
