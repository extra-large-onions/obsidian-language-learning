import { PARTS_OF_SPEECH, ROLES } from './types';

/**
 * The contract with the language model. The reply is pasted straight into a
 * code block, so the shape asked for here is also the shape stored on disk.
 *
 * The passage may hold more than one sentence, and then the reply is a list.
 */
export function buildPrompt(
	passage: string,
	sentenceLanguage: string,
	learnerLanguage: string,
): string {
	return `You annotate a passage for a language learner.

Sentence language: ${sentenceLanguage}
Learner language: ${learnerLanguage}

Passage:
<<<
${passage.trim()}
>>>

Return one JSON object per sentence, and no other text. For a single
sentence, return the object on its own. For more than one, return a JSON
array of the objects, in reading order.

{
  "text":   string    the sentence, copied exactly
  "tokens": Token[]   every word and mark, in reading order
  "gloss":  string    a natural translation of the whole sentence
}

Token:
{
  "t":     string   the word, copied exactly from the sentence
  "pos":   string   word class, from the POS list
  "role":  string   job in the sentence, from the ROLE list
  "lemma": string   optional. The dictionary form. Give it only if it differs from "t".
  "note":  string   optional. See the NOTE rules.
  "group": number   optional. See the GROUP rules.
}

ROLE list. Use these words only:
${ROLES.join(', ')}

POS list. Use these words only:
${PARTS_OF_SPEECH.join(', ')}

TOKEN rules:
- Copy each "t" exactly. Do not change the spelling, the case, or the marks.
- Split a word from the particle that follows it. Each one is a token.
- Make each punctuation mark its own token.
- The tokens must rebuild the sentence.

SENTENCE rules:
- Split the passage into sentences. Do not merge two into one object.
- Each "text" holds one sentence, copied exactly, with its own end mark.
- A group number belongs to its own sentence. Number from 1 in each one.

NOTE rules:
- Write a note only if the meaning is not obvious to a learner.
- Explain the word in this sentence. Do not write a dictionary entry.
- Use 15 words or fewer.

GROUP rules:
- Give the same group number to tokens that work as one unit.
- Use this for a unit that is split, and for a phrase.
- Number the groups from 1.

Example reply, for one sentence:
{"text":"저는 사과를 먹었어요.","gloss":"I ate an apple.","tokens":[
{"t":"저","pos":"pronoun","role":"subject","note":"Polite word for \\"I\\"."},
{"t":"는","pos":"particle","role":"marker","note":"Topic marker. It marks 저 as the topic."},
{"t":"사과","pos":"noun","role":"object"},
{"t":"를","pos":"particle","role":"marker","note":"Object marker."},
{"t":"먹었어요","pos":"verb","role":"verb","lemma":"먹다","note":"Past tense, polite form."},
{"t":".","pos":"punct","role":"punct"}]}

For two sentences, the same objects go in an array:
[{"text":"...","gloss":"...","tokens":[...]},{"text":"...","gloss":"...","tokens":[...]}]
`;
}
