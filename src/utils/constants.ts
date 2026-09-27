/**
 * Notes whose name ends this way - `Lesson 1.chapter.md` - are read as a
 * chapter, a page at a time. They stay markdown, so search, backlinks and the
 * graph go on treating them as the notes they are.
 */
export const CHAPTER_SUFFIX = '.chapter';

/** The view that reads a `.chapter` file. */
export const CHAPTER_VIEW_TYPE = 'll-chapter-view';

/** A line of three or more dashes. Two in a row separate one page from the next. */
export const PAGE_BREAK = /^[ \t]*-{3,}[ \t]*$/;

/** Code block language that renders an annotated sentence. */
export const SENTENCE_BLOCK_LANG = 'korean';

/** Identifies this plugin to the Page preview core plugin. */
export const HOVER_SOURCE = 'language-learning-chapter';

/** Code block language that points at a moment in a movie. */
export const MOVIE_BLOCK_LANG = 'movie';

/** Video files the movie player offers to open. */
export const MOVIE_EXTENSIONS = ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'ogv'];

/** The tab the movie player can move into, instead of floating. */
export const MOVIE_PLAYER_VIEW_TYPE = 'll-movie-player';
