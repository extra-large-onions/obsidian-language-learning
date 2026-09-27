import type LanguageLearningPlugin from '../main';
import { exportCurrent } from './export-current';
import { openCardCanvas } from './open-canvas';
import { rebuildIndex } from './rebuild-index';
import { registerMovieCommands } from './movie';

export function registerCommands(plugin: LanguageLearningPlugin): void {
	plugin.addCommand({
		id: 'card-canvas',
		name: 'Lay the cards out on a canvas',
		callback: () => void openCardCanvas(plugin),
	});

	plugin.addCommand({
		id: 'rebuild-index',
		name: 'Rebuild the card index',
		callback: () => void rebuildIndex(plugin),
	});

	plugin.addCommand({
		id: 'export-current',
		name: 'Export current file with attachments',
		callback: () => void exportCurrent(plugin),
	});

	registerMovieCommands(plugin);
}
