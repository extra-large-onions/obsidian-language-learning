# Language learning

This plugin helps you study a language in Obsidian. With this plugin, you can:

- Read a chapter one page at a time.
- Show the grammar of a sentence in colour.
- Review each page on a schedule.
- Record your voice into a note with two key presses.
- Export a note or a canvas with all its attachments.

The reader has a previous arrow, a next arrow, and a page box, for example
`3 / 12`.

A chapter is one note with a name like `Lesson 1.chapter.md`. The note is
usual Markdown. Search, backlinks, and the graph use it as a usual note. The
note also opens on a device that does not have this plugin. The plugin adds
only one item to the note: the page break. The plugin does not change your
other notes.

## Export a file

To export the active note or canvas:

1. Push **Ctrl+P**.
2. Select **Export current file with attachments**.

You can also type `/export` in a note.

The plugin finds all the files that the file embeds. It also finds all the
files that those files embed. It then puts all these files into one export.

There are two export formats. You can select one format or the two formats.

**Folder.** The export is a folder that contains these items:

- The document.
- All the notes that the document embeds.
- An `attachments/` folder.

The plugin changes all the links so that they point to the new files. This
format is for notes and for canvases. Use this format if the file contains
audio, video, or a PDF.

**Single file.** The export is one `.md` file. Each attachment is in the file
as a base64 data URI. This format is for notes only. A canvas node refers to a
file by its path, thus a canvas node cannot contain a data URI.

The plugin writes exports into the `Exports` folder in your vault. You can
change this folder in the settings. Because the export is in the vault, the
export also works on mobile devices. To send an export to a different person,
move the export folder out of the vault.

If you export the same file again, the plugin makes a new folder. The plugin
does not write over the first export.

### Differences from a usual copy

- **A chapter stays a chapter.** A single-file export of `Lesson 1.chapter`
  has the name `Lesson 1 (inline).chapter`. The `.chapter` mark stays at the
  end of the name. Thus, you can read the export one page at a time.
- **Files with the same name receive different names.** `pic.png` and
  `sub/pic.png` both go into `attachments/`. The second file becomes
  `pic 2.png`, and its links change to the new name.
- **Canvas nodes point to the new files.** This applies to file nodes and to
  the Markdown in text nodes. Positions, sizes, colours, and edges do not
  change.

**Note:** Obsidian shows base64 data as a picture only for images. A
single-file export also contains audio data and PDF data, but Obsidian shows
no player for this data. The export tells you about this problem. For audio
files and PDF files, use the folder format.

## Annotate a sentence

A `korean` code block contains one sentence and its grammar. The block can
also contain a list of sentences. Each token has a colour that shows its role.
To see the job and the meaning of a token, move the pointer onto the token. On
a phone, tap the token.

Put the JSON from your model directly into the block:

````markdown
```korean
{"text":"바빠서 어제 친구가 추천해 준 책을 아직 다 못 읽었어요.",
"gloss":"Because I was busy, I still haven't finished reading the book my friend recommended to me yesterday.",
"alt":"casual: 바빠서 어제 친구가 추천해 준 책을 아직 다 못 읽었어.",
"note":"- Polite speech (해요체).\n- The subject 'I' is left out. Korean drops it when the context shows it.\n- Pattern: A-아서 B = because A, B. The reason comes first. B cannot be a command: not 바빠서 가세요.\n- 추천해 준 책: a clause before a noun describes it, like 'that ... recommended'.\n- 아직 + negative = not yet. 아직 못 먹었어요: I have not eaten yet.",
"tokens":[
{"t":"바빠서","pos":"adjective","role":"connector","lemma":"바쁘다","tr":["Because","was busy"],"pron":"ba-ppa-seo","note":"바쁘다 -> 바쁘 + -아서 -> ㅡ drops -> 바빠서. Connective ending -아서: reason."},
{"t":"어제","pos":"adverb","role":"modifier","tr":"yesterday","pron":"eo-je","note":"Belongs to the clause before 책: when the friend recommended it."},
{"t":"친구","pos":"noun","role":"subject","tr":"my friend","pron":"chin-gu"},
{"t":"가","pos":"particle","role":"marker","pron":"ga","note":"Subject marker, inside the describing clause. 는 here would sound like a contrast."},
{"t":"추천해","pos":"verb","role":"verb","lemma":"추천하다","group":1,"tr":"recommended","pron":"chu-cheon-hae","note":"추천하다 -> 추천하 + -여 -> 추천해, to join the helper verb 주다."},
{"t":"준","pos":"aux","role":"verb","lemma":"주다","group":1,"tr":"to me","pron":"jun","note":"주다 -> 주 + -ㄴ (past modifier) -> 준. -아/어 주다: do something for someone."},
{"t":"책","pos":"noun","role":"object","tr":"the book","pron":"[채글] chae-geul","note":"Linking: ㄱ moves into 을."},
{"t":"을","pos":"particle","role":"marker","pron":"eul","note":"Object marker."},
{"t":"아직","pos":"adverb","role":"modifier","tr":"still","pron":"a-jik","note":"With a negative verb: 'not yet'."},
{"t":"다","pos":"adverb","role":"modifier","tr":"finished","pron":"da","note":"'All'. 다 읽다 means to read to the end."},
{"t":"못","pos":"adverb","role":"negation","group":2,"tr":"haven't","pron":"[몬닐거써요] mon-nil-geo-sseo-yo","note":"Could not, despite trying. 안 would mean chose not to. 못 읽 -> [몬닐]: ㄴ insertion, then nasalization."},
{"t":"읽었어요","pos":"verb","role":"verb","lemma":"읽다","group":2,"tr":"reading","pron":"[닐거써요] nil-geo-sseo-yo","note":"읽다 -> 읽 + -었- -> 읽었 + -어요 -> 읽었어요. Past, polite. Alone it sounds [일거써요]."},
{"t":".","pos":"punct","role":"punct"}]}
```
````

### Link a word to its translation

A token can have a `tr` field. This field contains the words of the `gloss`
that translate the token. Copy these words exactly. The plugin then shows
these words in the colour of the token. When you move the pointer onto the
token, its words in the gloss become bright. When you move the pointer onto
the words, the token becomes bright.

If the words are not next to each other in the gloss, use a list:

```json
{"t":"읽었나","pos":"verb","role":"verb","tr":["did","read"]}
```

The `tr` field is optional. Particles and punctuation marks usually do not
have a `tr` field. The gloss words that no token names stay plain.

Two tokens of one unit can name the same words. These words then have the
colour of the first token. If a `tr` word is not in the gloss, the plugin
shows a message below the sentence. The plugin also reads a `translation`
field as a `tr` field.

### Pronunciation, other speech level, and sentence notes

These fields are also optional:

| Field | Location | Result |
| --- | --- | --- |
| `pron` | token | Shows next to the word in the pop-up note. Example: `[일거써요] il-geo-sseo-yo` |
| `alt` | sentence | Shows as a light line below the gloss. Example: `casual: ... 읽었어.` |
| `note` | sentence | Shows in a closed **Notes** section, in Markdown. It can give the speech level, the pattern, the tone, or a tip. |

**Note:** JSON does not permit a line break in a string. The block reads the
line break correctly, because models often write line breaks in long notes.

### More than one sentence

Put the objects in an array. The block then shows each sentence below the
sentence before it. Each sentence has its own gloss. A group number applies
only to its own sentence.

````markdown
```korean
[{"text":"저는 사과를 먹었어요.","gloss":"I ate an apple.","tokens":[...]},
{"text":"그리고 물을 마셨어요.","gloss":"And I drank water.","tokens":[...]}]
```
````

### Make the JSON

1. Put the cursor on a sentence, or select one or more sentences.
2. Type `/annotate`, or run **Copy annotation prompt for this sentence**.
3. Paste the prompt into your model.
4. Paste the reply of the model into a `korean` block.

To set the two languages, go to **Settings → Language learning → Sentence**.

### The nine roles

| Role | Colour | Role | Colour |
| --- | --- | --- | --- |
| subject | blue | connector | cyan |
| verb | red | marker | yellow |
| object | green | negation | pink |
| complement | purple | punct | grey |
| modifier | orange | | |

If a role is not in this list, the token has no colour. The block continues
to work.

The colours are soft, and they change with the theme. To set your own
colours, go to **Settings → Language learning → Role colours**. A colour that
you set applies in light mode and in dark mode.

- To set the default colour for one role again, click the arrow next to that
  colour.
- To set all the default colours again, click the arrow next to the heading.

### How the block uses bad data

A study note must not become an error message. Thus, the parser removes the
bad parts and keeps the other parts:

- If the JSON is broken, the block shows the plain text.
- The block removes a code fence or other text around the JSON.
- The block repairs a comma at the end of a list.
- The block does not need brackets around a list. It reads the objects
  without the brackets.
- If one object in a list is broken, the block removes that object. The block
  shows the other sentences.
- If a field has the wrong type, the block removes the field. The token stays.
- If a token is not in the sentence, the block removes the token. The block
  continues to align the next token.

Below each sentence, the block shows a list of the parts that it removed.

### Two rules for the model

- **Copy each word exactly.** The plugin finds each token in `text`. The
  plugin then colours the real characters. Thus, the spacing stays correct,
  also when a particle touches its noun.
- **Use only the words in the role list.** If the model writes free text,
  each different spelling of a role receives a new colour.

## Cards

A card is one **page** of a chapter. A page is the text between two page
breaks in a `.chapter.md` note. A page break is a `---` line with a second
`---` line below it.

You review all the contents of the page: a paragraph, a list, a picture, or
some annotated sentences. The plugin shows the `korean` blocks on a page as
usual. These blocks are not separate cards. The plugin files their words under
the page that contains them.

### Review a page

In the chapter reader, the review line is below the page. The review line has
these parts:

- A bar. The bar shows how much of the page you probably remember today.
- A text, for example `Read 3 days ago - In 5 days - 74% - 4 times`.
- A **Read it** button.

You do not give a grade. When you click **Read it**, the plugin records the
date of today. The page then moves up one step on a fixed schedule:

1. 1 day
2. 6 days
3. 15 days
4. 37 days
5. 92 days

After 92 days, each interval is 1.5 times the previous interval. The maximum
interval is ten years.

To see all the days that you read the page, click the text. The newest day is
at the top. To remove a day that you recorded by mistake, click the **x** next
to that day.

The bar shows the forgetting curve that the schedule uses. The curve is at 90%
on the due day. After the due day, the curve decreases. Thus, if you sort the
pages by this value, the pages that you will forget first are at the top.

The plugin keeps your history in
`.obsidian/plugins/obsidian-language-learning/reviews.json`. The plugin does
not keep your history in your notes. Each card is on its own line. Thus, if
you sync your vault with git, git can merge two days of reviews. Git does not
have to select one of them.

```json
{
	"version": 2,
	"cards": {
		"k3f9x2ab": {"days":["2026-08-02","2026-08-08","2026-08-23","2026-09-29"]}
	}
}
```

The days are the full record. The plugin calculates these values from the
days:

- The due date of the card.
- The interval between two reviews.
- The probability that you remember the card.

The key is the card id.

To stop the review line, set **Settings → Language learning → Review** to off.

### The card canvas

The command **Lay the cards out on a canvas** makes a canvas of all the cards.
The command then opens the canvas. The canvas has one node for each page. Each
node shows the record of the page, and then the text of the page. Each row has
four nodes.

The canvas shows the pages in this order:

1. The pages that are late. The page that is most late is first.
2. The pages that are not due yet.
3. The pages that you did not read before. A page without a history has no due
   date.

The colour of the border shows the status of the page:

- Red: the page is late.
- Orange: the page is due today.
- Green: the page is not due yet.

The record of each page is in a callout above the page. Thus, the record looks
like a label, not like a part of the page:

````markdown
**7.** [[Lesson 3.chapter#^k3f9x2ab|Salut]]

> [!danger] 3 days late · 4x
> read 9 days ago (2026-09-03) · due 2026-09-09 · every 6 days
>
> [[Lesson 3.chapter|Lesson 3]] · p.2 of 12 · `k3f9x2ab`
>
> 3 words: 안녕, 하다, 친구

---

*the page itself*
````

The title of the callout gives the most important data first:

- How late the card is.
- How many times you read the card.

If you did not read the card, the title is **Never read**. The colour of the
callout agrees with the title:

- Red: the card is late.
- Blue: the card is due today.
- Grey-blue: the card is not due yet.
- No colour: you did not read the card.

The first link opens the page in the reader. The second link opens the full
chapter. If a page is in two chapters, the callout shows the other location
below the words.

The canvas is `Card review.canvas`, at the root of your vault.

**CAUTION:** When you close the canvas tab, the plugin deletes the canvas. The
file goes to the location where your vault puts deleted files. Before you
close the tab, copy the data that you want to keep into your own canvas.

The plugin makes a new canvas each time that you run the command. Thus, you do
not have to keep the canvas. The text on the canvas is a copy of the pages at
the time that you ran the command.

The canvas shows a maximum of 200 cards. This limit makes sure that Obsidian
can show the canvas.

### Page ids

When you read a page for the first time and click **Read it**, the plugin
writes an id on the last line of the page:

```markdown
# Salut

**salut** - hi (informal, friends only)

^k3f9x2ab

---
---
```

This id is a usual Obsidian block id. Reading view and the chapter reader do
not show the id. `[[Lesson 1.chapter#^k3f9x2ab]]` is a link to the page. When
you click this link in a rendered note, the chapter opens in the reader on
that page.

The plugin files the history of a card under this id. Thus, the history stays
when you edit the page.

Before a page has an id, the plugin identifies the page by a hash of its text.
The page continues to show in reviews and in the lists. But if you edit the
page before its first review, its history starts again. When the plugin writes
the id, the history moves to the id.

The command **Rebuild the card index** gives an id to all the pages in the
vault. Use this command if you want to link to pages that you did not read
yet.

### The card index note

The note `Card index.md`, at the root of the vault, shows all the cards
together. The note contains two tables:

- A table of cards. Each row has a link to the page, the words on the page,
  all the days that you read the page, and the card id.
- A table of words. Each row has links to the pages that contain the word.

The note stays after a sync, and it opens on a phone. You can link to this
note as to all other notes.

The plugin keeps this note up to date. The plugin writes the note again
approximately two seconds after the index changes. The plugin writes the note
only if the text changes. Thus, if a sweep finds no new data, the note does
not change.

**CAUTION:** Do not edit `Card index.md`. The plugin writes the full note each
time, and it writes over your changes.

To stop this note, set **Settings → Language learning → Card index note** to
off. To update the note immediately, run **Rebuild the card index**.

If you copy one page into two chapters, the page is one card with one record.

### The index file

The plugin writes the index to
`.obsidian/plugins/obsidian-language-learning/.cache/index.json`. The file has
two tables. Each entry is on its own line, in key order:

```json
{
	"version": 2,
	"cards": {
		"k3f9x2ab": {"title":"Salut","named":true,"places":[{"path":"Lesson 1.chapter.md","line":8,"page":1}]}
	},
	"tokens": {
		"는": {"pos":["particle"],"cards":["k3f9x2ab","bbbb2222"]},
		"먹다": {"pos":["verb"],"cards":["k3f9x2ab"]}
	}
}
```

The `tokens` table is the word index. Each word form points to all the pages
that contain it. If the model gave a lemma, the key is the lemma. Thus, the
plugin files 먹었어요 under 먹다, and all the forms of the verb are together.
The index does not include punctuation.

The file is a cache. If you delete the file, the plugin makes it again. You do
not lose data.

At startup, the plugin does these steps:

1. The plugin reads the cache. Thus, the list shows immediately.
2. The plugin reads all the chapters to make sure that the cache is correct.

Only step 2 finds the changes that you made while Obsidian was closed.

The plugin writes the file approximately two seconds after a change. The
plugin writes the file only if the data changed.

### When the index updates

When you edit a chapter, the plugin does not read the chapter again
immediately. The plugin records the path of the file. At each sweep, the
plugin reads all the files that it recorded.

By default, a sweep occurs every two minutes. To change this interval, go to
**Settings → Language learning → Reindex every**. If you set the interval to 0
minutes, no sweep occurs. The index then updates only when you tell it to.

These two commands update the index:

- **Lay the cards out on a canvas** reads all the files that wait for a sweep.
- **Rebuild the card index** reads the full vault again, gives an id to all
  the pages, and writes `Card index.md`.

Thus, a save uses no resources until the sweep. Many saves together cause only
one sweep, not one sweep for each save.

## Compress images

When you paste or drop an image into a note, the plugin makes the image
smaller. The plugin saves the smaller copy. The plugin then puts an embed at
the cursor.

A 1080p screenshot becomes 720p. A movie frame with subtitles decreases from
approximately 2 MB to approximately 150 KB. You can still read the subtitle
text easily.

The default settings are:

| Setting | Default | Result |
| --- | --- | --- |
| Maximum image size | 1280 | The longest edge in pixels. 1280 gives 720p. |
| Image quality | 80 | A lower value makes a smaller file. |
| Image format | WEBP | JPEG is also available, for older software. |

The plugin obeys four safety rules:

- The plugin does not make a small image larger. It only makes images smaller.
- The plugin does not change a GIF or an SVG. A canvas keeps only the first
  frame of a GIF, and a canvas changes an SVG into pixels.
- If the new file is not smaller, the plugin keeps the original file.
- If the plugin cannot read the image, the plugin keeps the original file.

After each paste, the plugin shows the new size. To stop the compression, set
**Settings → Language learning → Compress pasted images** to off.

## Record your voice

To start a recording, do one of these steps:

- In a note, type `/` and select **Record voice**. You can also type `/rec`,
  `/voice`, `/audio`, or `/mic`.
- Push **Ctrl+P** and select **Record voice**.
- Push the hotkey for this command. To set a hotkey, go to
  **Settings → Hotkeys**.

The recording starts immediately when the dialog opens. To save the recording:

1. Click **Stop**.
2. Optional: Listen to the recording. To record again, click **Record again**.
3. Push **Enter**.

The plugin saves the file in your usual attachment folder, with a name like
`Recording 2026-08-29 14.32.05.webm`. The plugin puts an embed at the position
of the cursor.

If no editor is open, the plugin also saves the file. An example is when a
canvas has the focus. The plugin then copies the link of the file to the
clipboard. You can paste the link into a card.

You can set the `/` menu to off in the settings. The menu does not open in the
middle of a word. Thus, paths like `and/or` and dates like `12/08` do not
change.

## Write a chapter

If the name of a note has `.chapter` before `.md`, the note opens in the
reader. An example is `Lesson 1.chapter.md`.

To make a chapter in Obsidian:

1. Make a new note with **New note**.
2. Change the name of the note to `Lesson 1.chapter`.

Obsidian adds `.md` to the name and does not show it. Thus, the file shows as
`Lesson 1.chapter` in all locations.

The full note is the chapter. To start a new page, write two dash lines, one
below the other:

```markdown
# Bonjour

**bonjour** - hello (formal, any time of day)

---
---

# Salut

**salut** - hi (informal, friends only)
```

A single `---` line does not start a new page. The line stays a horizontal
rule in the page, as in usual Markdown. You must write two lines to start a
new page.

Frontmatter is not a page. If a note starts with a usual `---` frontmatter
block, the plugin skips the block and its last line.

The note stays a usual Markdown note in a `.md` file:

- Vault search finds its text.
- The graph and the backlinks include the note.
- A usual `[[Lesson 1.chapter]]` link goes to the note.
- On a device without this plugin, the note opens as a usual note. Two
  horizontal rules show at the end of each page.

## Read and edit a chapter

A chapter opens in the reader.

- To open the usual Markdown editor in that pane, click the **pencil** button
  at the top right.
- To go back to the reader, click the **book** button at the top right.
- To do this with the keyboard, push **Ctrl+P** and run **Switch between the
  chapter reader and the editor**.

The plugin keeps this selection for each pane and for each file. A pane that
you set to the editor stays in the editor. If you open a different chapter in
that pane, the reader opens again. When Obsidian starts again, each pane opens
in the mode that it had before.

You can also edit in one pane and read in a different pane. When you save the
note, the reader divides the pages again. Thus, the reader stays on the same
part of the text.

## Page contents

The Obsidian Markdown renderer shows each page. Thus, a page shows Markdown as
all other parts of Obsidian do:

- Headings, lists, tables, quotes, callouts, footnotes, and math.
- Code blocks, also the code blocks of other plugins.
- Images and audio, with `![[embeds]]` and with standard Markdown.
- Note embeds, tags, and internal links. You can click the links. A link
  shows a preview when you move the pointer onto it.
- Text that you can select and copy.

When you tick a **checkbox**, the plugin writes the change into the file. The
page knows the line of each checkbox. Thus, the plugin writes the tick
directly into that line.

If you edited the page in a different pane, the plugin reads the page again
before the next tick. Thus, the plugin does not write to a line that moved.

## Reading position

The plugin records the page that you are on. The plugin keeps this data in its
own data file, not in the chapter. The plugin files the position under the
path of the file. Thus:

- The position stays when you edit the chapter.
- The position moves with the file when you change the name of the file.

To stop this function, set
**Settings → Language learning → Remember reading position** to off.

## Controls

- To go to the next page or the previous page, push **←** / **→**, or
  **Page Up** / **Page Down**.
- To go to a specific page, type its number in the page box. Then push
  **Enter**.
- To change between the reader and the editor, click the button at the top
  right.

## Settings

- **Remember reading position**: A chapter opens again at the page where you
  stopped.
- **Paper look**: Pages show on a surface that looks like paper.
- **Slash commands**: The `/` menu shows when you type.
- **Recording filename prefix**: The first word in the name of a recording.
  The default is `Recording`.
- **Export folder**: The folder for exports. The default is `Exports`.
- **Review**: The review line below each page in the reader.
- **Reindex every**: The number of minutes before the plugin reads a changed
  chapter again.
- **Card index note**: The plugin keeps `Card index.md` up to date.

## Development

```bash
npm install
npm run dev    # watch build
npm run build  # production build
npm run lint
```
