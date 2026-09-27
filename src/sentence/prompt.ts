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
  "alt":    string    optional. See the ALT rules.
  "note":   string    optional. See the SENTENCE NOTE rules.
}

Token:
{
  "t":     string   the word, copied exactly from the sentence
  "pos":   string   word class, from the POS list
  "role":  string   job in the sentence, from the ROLE list
  "lemma": string   optional. The dictionary form. Give it only if it differs from "t".
  "note":  string   optional. See the NOTE rules.
  "pron":  string   optional. See the PRON rules.
  "group": number   optional. See the GROUP rules.
  "tr":    string or string[]   optional. See the TR rules.
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
- Write a note when a learner could miss something. Skip obvious words.
- Explain the word in this sentence. Do not write a dictionary entry.
- For a conjugated verb or adjective, show each step from the dictionary
  form to the final form: stem, tense, honorific, helper verb, ending.
  Example: 가다 -> 가 + -시- -> 가시 + -었- -> 가셨 + -어요 -> 가셨어요.
- Name the job of each ending: connective, question, conditional, reason,
  wish, command, suggestion, quoted speech.
- Name the job of each particle, and what changes if another one is used.
- Mention a catch a new learner would miss, with a short example.
- Use 40 words or fewer.

SENTENCE NOTE rules:
- Markdown. Short lines or a short list. 80 words or fewer.
- Name the speech level: formal, polite, casual, plain.
- Name a common pattern if the sentence uses one: wanting, trying,
  command, if/then, because, while, intention. Show how it is built.
- Describe the tone if it is not neutral: sarcasm, teasing, anger,
  cringe, hesitation, slang, rudeness.
- Add one nuance or usage tip, with a short example sentence.

ALT rules:
- The same sentence one step more casual, or more polite if it is casual.
- Start with the level: "casual: ...", "polite: ...", "formal: ...".
- Leave it out for a title, a label or a sign.

PRON rules:
- Give "pron" for every word token. Leave it out for punctuation.
- Write the romanization of how the token sounds in this sentence.
- When the sound differs from the spelling, put the sounded Hangul first
  in brackets, and name the rule in "note": linking, nasalization, tensing,
  ㄴ insertion, aspiration, ㅎ dropping.
- Put a sound change across two tokens on the first of them.

GROUP rules:
- Give the same group number to tokens that work as one unit.
- Use this for a unit that is split, and for a phrase.
- Number the groups from 1.

TR rules:
- "tr" holds the words of "gloss" that translate this token.
- Copy them exactly from "gloss": same spelling, same case.
- Give "tr" to every token that has a direct translation: nouns, verbs,
  pronouns, adjectives, adverbs, negations.
- Leave "tr" out for particles, endings and marks with no words of their own.
- Use a list when the words are apart in the gloss: ["did", "read"].
- Tokens of one group may repeat the same "tr".
- Do not give two tokens the same words unless they are one unit.

Example reply, for one sentence:
{"text":"바빠서 어제 친구가 추천해 준 책을 아직 다 못 읽었어요.",
"gloss":"Because I was busy, I still haven't finished reading the book my friend recommended to me yesterday.",
"alt":"casual: 바빠서 어제 친구가 추천해 준 책을 아직 다 못 읽었어.",
"note":"- Polite speech (해요체).\\n- Pattern: A-아서 B = because A, B. The reason comes first. It cannot end in a command: not 바빠서 가세요.\\n- 추천해 준 책: a clause before a noun describes it, like 'that ... recommended'.\\n- 아직 + negative = not yet. 아직 못 먹었어요: I have not eaten yet.",
"tokens":[
{"t":"바빠서","pos":"adjective","role":"connector","lemma":"바쁘다","tr":["Because","was busy"],"pron":"ba-ppa-seo","note":"바쁘다 -> 바쁘 + -아서 -> ㅡ drops -> 바빠서. Connective ending -아서: reason."},
{"t":"어제","pos":"adverb","role":"modifier","tr":"yesterday","pron":"eo-je","note":"Belongs to the clause before 책: when the friend recommended it."},
{"t":"친구","pos":"noun","role":"subject","tr":"my friend","pron":"chin-gu"},
{"t":"가","pos":"particle","role":"marker","pron":"ga","note":"Subject marker, inside the describing clause. 는 here would sound like a contrast."},
{"t":"추천해","pos":"verb","role":"verb","lemma":"추천하다","group":1,"tr":"recommended","pron":"chu-cheon-hae","note":"추천하다 -> 추천하 + -여 -> 추천해, to join the helper verb 주다."},
{"t":"준","pos":"aux","role":"verb","lemma":"주다","group":1,"tr":"to me","pron":"jun","note":"주다 -> 주 + -ㄴ (past modifier) -> 준. -아/어 주다: do for someone."},
{"t":"책","pos":"noun","role":"object","tr":"the book","pron":"[채글] chae-geul","note":"Linking: ㄱ moves into 을."},
{"t":"을","pos":"particle","role":"marker","pron":"eul","note":"Object marker."},
{"t":"아직","pos":"adverb","role":"modifier","tr":"still","pron":"a-jik","note":"With a negative verb: 'not yet'."},
{"t":"다","pos":"adverb","role":"modifier","tr":"finished","pron":"da","note":"'All'. 다 읽다 means to read to the end."},
{"t":"못","pos":"adverb","role":"negation","group":2,"tr":"haven't","pron":"[몬닐거써요] mon-nil-geo-sseo-yo","note":"Could not, despite trying. 안 would mean chose not to. ㄴ insertion and nasalization with 읽었어요."},
{"t":"읽었어요","pos":"verb","role":"verb","lemma":"읽다","group":2,"tr":"reading","pron":"[일거써요] il-geo-sseo-yo","note":"읽다 -> 읽 + -었- -> 읽었 + -어요 -> 읽었어요. Past, polite."},
{"t":".","pos":"punct","role":"punct","tr":"."}]}

For two sentences, the same objects go in an array:
[{"text":"...","gloss":"...","tokens":[...]},{"text":"...","gloss":"...","tokens":[...]}]
`;
}
