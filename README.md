# Language learning

Read a chapter page by page — prev/next arrows and a page box showing
`3 / 12` — record your voice into it in two keys, and export the whole thing
as a self-contained bundle.

A chapter is a whole note, named `Lesson 1.chapter.md`. It is ordinary
markdown - search, backlinks and the graph go on treating it as the note it
is, and it opens on a device without this plugin - the only thing that is ours
is the page break. Nothing else in the vault is touched.

## Exporting

**Ctrl+P → Export current file with attachments**, or `/export`. Works on the
active note or canvas.

It walks what the file embeds, and what *those* embed, and bundles the lot.
Two formats, either or both:

**Folder** — a folder holding the document, every note it pulls in, and an
`attachments/` folder, with all links repointed. Works for notes and canvases.
This is the one to use when there is audio, video or a PDF involved.

**Single file** — one `.md` with every attachment as a base64 data URI. Notes
only: a canvas node references files by path, so it cannot hold a data URI.

Exports are written into the `Exports` folder in your vault (configurable), so
they work on mobile too. Move the folder out of the vault to send it on. A
second export of the same file gets its own folder rather than overwriting the
first.

### What it does that a plain copy would not

- **Chapters travel as chapters.** A single-file export of `Lesson 1.chapter`
  is `Lesson 1 (inline).chapter`, keeping the mark last, so the export is
  still read a page at a time.
- **Name collisions are handled.** `pic.png` and `sub/pic.png` both land in
  `attachments/`, so the second becomes `pic 2.png` and its links follow.
- **Canvas nodes are repointed** — file nodes and the markdown inside text
  nodes — while positions, sizes, colours and edges pass through untouched.

Base64 only *renders* for images. Audio and PDF data still travels in a
single-file export, but you get no player, so the export reports it and you
should prefer the folder format for those.

## Annotating a sentence

A `korean` code block holds a sentence and its grammar, or a list of them.
Each token takes a colour from its role. A hover shows what the token does and
what it means. A tap does the same on a phone.

Put the JSON from your model straight into the block:

````markdown
```korean
{"text":"저는 사과를 먹었어요.","gloss":"I ate an apple.","tokens":[
{"t":"저","pos":"pronoun","role":"subject"},
{"t":"는","pos":"particle","role":"marker","note":"Topic marker."},
{"t":"사과","pos":"noun","role":"object"},
{"t":"를","pos":"particle","role":"marker","note":"Object marker."},
{"t":"먹었어요","pos":"verb","role":"verb","lemma":"먹다","note":"Past tense, polite."},
{"t":".","pos":"punct","role":"punct"}]}
```
````

### More than one sentence

Put the objects in an array, and the block draws them one under the other.
Each one keeps its own gloss, and a group number belongs to its own sentence.

````markdown
```korean
[{"text":"저는 사과를 먹었어요.","gloss":"I ate an apple.","tokens":[...]},
{"text":"그리고 물을 마셨어요.","gloss":"And I drank water.","tokens":[...]}]
```
````

### Getting the JSON

1. Put the cursor on a sentence, or select one or more.
2. Type `/annotate`, or run **Copy annotation prompt for this sentence**.
3. Paste the prompt into your model.
4. Paste the reply into a `korean` block.

Set the two languages under **Settings -> Language learning -> Sentence**.

### Reviewing

In a `.chapter.md` note, under each sentence is a review line: a bar showing
how much of the card is likely to be left today, when you last did it, when it
comes up again, and four buttons - Again, Hard, Good, Easy. It reads `Done 3
days ago - In 5 days - 74%`. Hover the bar for the exact date and the interval.

Only chapters get that line. A `korean` block quoted in an ordinary note is
there to be read, and stays a plain annotated sentence. The cards are still
made either way, so the index finds those sentences and the card list
schedules them - you answer them from the card list rather than in the note.

The schedule is SM-2. A card you answer runs 1 day, 6 days, then the last
interval times its ease, which grows on Easy and shrinks on Hard. Again puts
it back to a day and makes it a little harder for good. A check that is late
and goes well counts the days the card actually survived, not the days it was
scheduled for.

The bar is the forgetting curve the schedule assumes. It passes through 90% on
the due day and falls away after that, so sorting by it is sorting by what you
are closest to losing.

The calendar button changes the day a card was last checked, for when you read
it away from your vault and grade it later. It moves the record without
touching the interval or the ease.

Your history is kept in
`.obsidian/plugins/obsidian-language-learning/reviews.json`, not in your notes,
so checking a card never rewrites the note it sits in. One card per line, so a
vault synced with git can merge two days of reviews instead of picking one:

```json
{
	"version": 1,
	"cards": {
		"1p4k9x": {"last":"2026-09-01","due":"2026-09-15","interval":14,"ease":2.5,"reps":4,"lapses":0}
	}
}
```

`last` is the day you last did the card, `due` the day it comes back. The key
is the card id - the `id` in the block, or the hash of its text until one is
written.

### Block ids

The first time a block is drawn, the plugin writes an id on top of it:

````markdown
```korean
id: k3f9x2ab
{"text":"저는 사과를 먹었어요.", ...}
```
````

It is a plain line above the JSON, not a field inside it, so nothing the model
wrote is ever touched.

The id is what a card's history and the word index are filed under, so both
survive you editing the sentence. A block with two sentences names them
`k3f9x2ab` and `k3f9x2ab#1`. Until a block has an id, its cards are known by
the hash of their text - they still review, they just forget when edited - and
the history moves across when the id is written.

Ids are written as you meet blocks. **Give every block an ID** does the whole
vault in one go, for notes you have not opened. A canvas card has no lines of
its own to write to, so blocks in one stay unnamed.

Turn the whole line off under **Settings -> Language learning -> Review**.

### The card list

**Language cards** in the ribbon, or the command of the same name, opens a
list of every card in the vault. It has two tabs.

**Cards** groups them into what is due, what has never been checked, and what
comes later, with the most overdue first. Each row carries the same bar and
the same four buttons as the block, so you can work down the list without
opening a note. A row you answer stays where it is: a list that reorders under
your hand is a list you cannot get through. Click a sentence to open the note
it is written in, at the block.

**Words** is the index, as a table: the form, its word class, and how many
cards it is in. The headings order it by word or by count. Open a row to see
its cards, each with the note and line it is written on and the id it is filed
under; click one to go straight to that block. This is how you find that a verb
turns up in two cards, and read them side by side.

The filter box searches sentences and glosses on the first tab, and words on
the second.

Cards inside canvas cards are counted too - a canvas keeps its text as
markdown, so the blocks are found the same way, though there is no line to
jump to inside one.

One sentence written in two places is one card, with one history. Editing a
sentence that was never checked leaves its old record behind; **Remove review
history for cards that are gone** clears those out.

### The index file

The index is written to
`.obsidian/plugins/obsidian-language-learning/.cache/index.json`. Two tables,
one entry per line, in key order:

```json
{
	"version": 1,
	"cards": {
		"k3f9x2ab": {"text":"저는 사과를 먹었어요.","gloss":"I ate an apple.","places":[{"path":"Lesson 1.md","line":12,"index":0}]}
	},
	"tokens": {
		"는": {"pos":["particle"],"cards":["k3f9x2ab","bbbb2222"]},
		"먹다": {"pos":["verb"],"cards":["k3f9x2ab"]}
	}
}
```

`tokens` is the word index: each form points at every card it appears in. The
key is the lemma when the model gave one, so 먹었어요 is filed under 먹다 and
every form of the verb lands together. Punctuation is left out.

It is a cache. Delete it and it is built again; nothing is lost. On startup it
is read first so the list appears at once, then the vault is scanned to be
sure it is true - edits made while Obsidian was closed are only caught by that
second pass. It is rewritten a couple of seconds after a change, and only when
something actually changed.

### When it updates

A note you edit is not read again on the spot. Its path is noted, and the
files that have piled up are read on a sweep - every two minutes by default,
under **Settings -> Language learning -> Reindex every**. At 0 minutes the
sweep never runs and the index waits to be asked.

It is asked in three ways:

- Opening the card list catches up whatever is waiting.
- The arrow beside the tabs reads the whole vault again.
- **Rebuild the card index** does the same from the command palette.

A save therefore costs nothing until the sweep, and a burst of saves costs one
pass rather than one per save.

### The nine roles

| Role | Colour | Role | Colour |
| --- | --- | --- | --- |
| subject | blue | connector | cyan |
| verb | red | marker | yellow |
| object | green | negation | pink |
| complement | purple | punct | grey |
| modifier | orange | | |

An unknown role gets no colour. It does not break the block.

The palette is muted, and it changes with the theme. To set your own, open
**Settings -> Language learning -> Role colours**. A colour you set there is
used in both light and dark mode. The arrow beside a colour restores the
default for that role, and the arrow beside the heading restores all of them.

### The block ignores what is wrong

A study note must never become an error message. The parser therefore drops
bad parts and keeps the rest:

- Broken JSON shows the plain text.
- A code fence or stray prose around the JSON is removed.
- A trailing comma is repaired.
- Missing brackets around a list are not needed. The objects are read anyway.
- One broken object in a list is dropped. The other sentences still draw.
- A field of the wrong type is dropped. The token stays.
- A token that is not in the sentence is dropped. The next token still aligns.

The block names what it ignored, under the sentence it belongs to.

### Two rules the model must follow

- **Copy each word exactly.** The plugin finds each token inside `text`. It
  then colours the real characters. Spacing therefore stays correct, even
  when a particle touches its noun.
- **Use the role list.** Free text gives you a new colour for every spelling
  of the same role.

## Compressing images

Paste or drop an image into a note. The plugin scales the image down and
saves the smaller copy. It then puts an embed at the cursor.

A 1080p screenshot becomes 720p. A movie frame with subtitles goes from
about 2 MB to about 150 KB. Subtitle text stays easy to read.

The default settings are:

| Setting | Default | Effect |
| --- | --- | --- |
| Maximum image size | 1280 | Longest edge in pixels. 1280 gives 720p. |
| Image quality | 80 | Lower values give smaller files. |
| Image format | WEBP | JPEG is available for older software. |

Four rules keep the plugin safe:

- The plugin does not scale a small image up. It only makes images smaller.
- The plugin does not touch a GIF or an SVG. A canvas keeps only the first
  frame of a GIF, and it changes an SVG into pixels.
- The plugin keeps the original file if the new file is not smaller.
- The plugin keeps the original file if it cannot read the image.

The plugin shows the new size after each paste. To stop the compression, set
**Settings -> Language learning -> Compress pasted images** to off.

## Recording your voice

Three ways in, whichever is closest to hand:

- type `/` in any note and pick **Record voice** (or `/rec`, `/voice`, `/audio`, `/mic`)
- **Ctrl+P → Record voice**
- assign a hotkey to the same command under **Settings → Hotkeys**

Recording starts the moment the dialog opens — that is the whole point — so a
take is **Stop**, then **Enter** to save. You get the take back to listen to
first, with **Record again** if it needs another pass.

The file goes to your normal attachment folder as
`Recording 2026-08-29 14.32.05.webm`, and an embed is inserted where your
cursor was. With no editor open — recording while a canvas is focused — the
file is still saved and its link copied to the clipboard, ready to paste into
a card.

The `/` menu can be turned off in settings; it never fires mid-word, so paths
like `and/or` and dates like `12/08` are left alone.

## Writing a chapter

Name the note with `.chapter` before the `.md` - `Lesson 1.chapter.md` - and
it opens in the reader. In Obsidian you make one the usual way, **New note**,
and rename it to `Lesson 1.chapter`; the `.md` is added for you and stays
hidden, so the file shows as `Lesson 1.chapter` everywhere.

The whole note is the chapter, and pages are separated by two dash lines, one
under the other:

```markdown
# Bonjour

**bonjour** - hello (formal, any time of day)

---
---

# Salut

**salut** - hi (informal, friends only)
```

A *single* `---` is left alone, so it stays what it is everywhere else in
markdown: a horizontal rule inside the page. It takes two to turn the page.

Frontmatter is not a page. A note may open with the usual `---` block and it
is skipped, along with its closing line.

Nothing else changes about the note. It is markdown in a `.md` file: vault
search finds its text, the graph and backlinks include it, a plain
`[[Lesson 1.chapter]]` links to it, and on a device without this plugin it
opens as an ordinary note, with two rules where each page ends.

## Reading it, and editing it

A chapter opens in the reader. The **pencil** button in the top right switches
that pane to the normal markdown editor, and the **book** button there
switches back. **Ctrl+P → Switch between the chapter reader and the editor**
does the same from the keyboard.

The choice is per pane and per file: a pane you have put into the editor stays
there, and opening a *different* chapter in it opens the reader again. A pane
left in either one comes back that way when Obsidian restarts.

Editing in one pane and reading in another works too: the reader re-splits
itself as the note is saved, so the page you are on follows the text.

## What a page supports

A page is rendered by Obsidian's own markdown renderer, so it behaves like
markdown anywhere else in the app:

- headings, lists, tables, quotes, callouts, footnotes, and math
- code blocks, including other plugins' code blocks
- images and audio, both `![[embeds]]` and standard markdown
- note embeds, tags, and internal links — clickable, with hover preview
- text selection and copy

**Checkboxes** are ticked off in the file itself, not just on screen. The page
knows the line each one came from, so a tick is written straight back to it -
and a page you have edited elsewhere in the meantime is read again before the
next tick, so nothing is written to a line that has moved.

## Reading position

The page you are on is remembered in the plugin's own data, never written back
into the file, and it is filed under the file's path - so it survives editing
the chapter, and follows the file when you rename it.

Turn it off under **Settings → Language learning → Remember reading position**.

## Controls

- **←** / **→**, or **Page Up** / **Page Down**, move a page
- Type a page number in the box and press **Enter** to jump
- The button in the top right swaps the reader for the editor, and back

## Settings

- **Remember reading position** — reopen each chapter where you left off
- **Paper look** — render pages on a paper-like surface
- **Slash commands** — offer the `/` menu while typing
- **Recording filename prefix** — defaults to `Recording`
- **Export folder** — defaults to `Exports`

## Development

```bash
npm install
npm run dev    # watch build
npm run build  # production build
npm run lint
```
