/**
 * One sentence, annotated by a language model. The model's JSON output is
 * stored as-is, so there is no conversion layer between the two.
 */
export interface AnnotatedSentence {
	/**
	 * Stable name for the card, written by the plugin the first time the
	 * sentence is checked. It is what the review history is filed under, so
	 * editing the sentence afterwards keeps its record.
	 */
	id?: string;
	/** The sentence, copied exactly. */
	text: string;
	tokens: AnnotatedToken[];
	/** A natural translation of the whole sentence. */
	gloss?: string;
}

export interface AnnotatedToken {
	/** The word, exactly as it appears in the sentence. */
	t: string;
	/** Word class. Shown on hover. */
	pos?: string;
	/** Job in the sentence. Drives the colour. */
	role?: string;
	/** Dictionary form, when it differs from `t`. */
	lemma?: string;
	/** Short explanation of this word in this sentence. */
	note?: string;
	/** Tokens with the same number are one unit, even when they are apart. */
	group?: number;
}

/**
 * The roles that get a colour. Nine is the limit: more colours than that are
 * hard to tell apart, so an unknown role falls back to plain text.
 */
export const ROLES = [
	'subject',
	'verb',
	'object',
	'complement',
	'modifier',
	'connector',
	'marker',
	'negation',
	'punct',
] as const;

/** Word classes offered to the model, so the hover text stays consistent. */
export const PARTS_OF_SPEECH = [
	'noun',
	'verb',
	'aux',
	'pronoun',
	'adjective',
	'adverb',
	'determiner',
	'preposition',
	'postposition',
	'conjunction',
	'particle',
	'numeral',
	'interjection',
	'punct',
] as const;

export function isKnownRole(role: string): boolean {
	return (ROLES as readonly string[]).includes(role);
}
