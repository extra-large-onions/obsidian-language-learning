/** One page of a chapter, with the line its first line sits on in the file. */
export interface Page {
	text: string;
	startLine: number;
}

/** Everything the plugin persists via loadData/saveData. */
export interface PluginData {
	settings: import('./settings').LanguageLearningSettings;
	/** Reading position per chapter file, zero-based. */
	positions: Record<string, number>;
}
