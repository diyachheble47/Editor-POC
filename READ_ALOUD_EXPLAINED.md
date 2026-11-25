# How "Read aloud" (audiobook) works

A beginner-friendly guide. No prior knowledge of speech APIs needed.

## 1. What it does

There is a **speaker button** in the top bar. When you click it, the browser reads
your document out loud, from top to bottom. While it reads:

- the block being read is **highlighted** and scrolled into view,
- you can **pause**, **resume** or **stop**,
- you can change the **speed** (0.75x, 1x, 1.25x, 1.5x, 2x).

There is **no server, no API key and no cost**. Your browser already knows how to
speak, we just ask it to.

## 2. The one idea you must understand: the Web Speech API

Browsers have a built-in feature called the **Web Speech API**. It has two halves:

| Half | What it does | Do we use it? |
|---|---|---|
| `speechSynthesis` | text -> voice (text-to-speech) | **Yes** |
| `SpeechRecognition` | voice -> text (speech-to-text) | No |

The whole feature is built on three small things:

```ts
// 1. Make something to say
const u = new SpeechSynthesisUtterance('Hello class')   // "utterance" = one thing to say
u.rate = 1.25                                           // speed
u.lang = 'en-US'                                        // language

// 2. Say it
window.speechSynthesis.speak(u)

// 3. Control it
window.speechSynthesis.pause()
window.speechSynthesis.resume()
window.speechSynthesis.cancel()   // stop and forget everything queued
```

The voice itself comes from your **operating system / browser**, so it sounds
different on Chrome, Edge and Safari. That is normal.

## 3. The big picture

```
 Click speaker button
        |
        v
 [Step A] Take the document's blocks and turn them into short pieces of text
        |        (readAloud.ts)
        v
 [Step B] Say piece 1 -> when done, say piece 2 -> when done, say piece 3 ...
        |        (useReadAloud.ts)
        v
 [Step C] Highlight the block being read, scroll to it
        |
        v
 Last piece done (or you press stop) -> clean up
```

Three files do the work:

| File | Job |
|---|---|
| `src/editor/speech/readAloud.ts` | **Step A.** Turns the document into pieces of text. Pure logic, easy to test. |
| `src/editor/speech/useReadAloud.ts` | **Steps B and C.** A React hook that speaks the pieces, one after another. |
| `src/components/ReadAloudControl.tsx` | The buttons you see in the top bar. |

## 4. Step A: turning the document into text (`readAloud.ts`)

The editor shows blocks (paragraphs, headings, lists, tables, quizzes...). We need
plain sentences. Three things happen.

### A1. Take the text of each block, but skip what cannot be spoken

For each top-level block we make a **copy** and delete the parts that make no sense
when spoken:

```ts
const SKIP = 'pre, canvas, svg, img, iframe, video, audio, button, input, textarea, style, script, .katex, ...'
```

So code blocks, formulas, images, videos and buttons are **not read**. (We work on a
copy so the real document is never touched.)

### A2. Add small pauses

Without help, a list would sound like one long sentence:

> "Apples Pears Oranges"

So after every list item, table cell and heading we add a full stop:

> "Apples. Pears. Oranges."

The voice pauses at every full stop, so it sounds natural.

### A3. Cut the text into short sentences

Why? **Chrome has a bug-like limit**: if one utterance is too long (about 15 seconds),
Chrome just stops speaking in the middle. The fix is to never give it long text.

`splitSentences(text, 220)` splits at `. ! ?` and, if one sentence is still longer than
220 characters, breaks it at a space.

### The result

`speechPieces(root)` returns a list like this:

```ts
[
  { el: <h2>,  text: 'Photosynthesis' },
  { el: <p>,   text: 'Plants make food using sunlight.' },
  { el: <p>,   text: 'This happens in the leaves.' },
  ...
]
```

Each piece remembers **which block it came from** (`el`). That is how we highlight
the right block later.

## 5. Step B: speaking the pieces one by one (`useReadAloud.ts`)

### B1. The chain

We do **not** give the browser all pieces at once. We say one piece, and when it
finishes (`onend`), we say the next:

```ts
const next = (n) => {
  const piece = pieces[n]
  if (!piece) { finish(); return }          // no more pieces -> done
  highlight(piece.el)                        // Step C
  const u = new SpeechSynthesisUtterance(piece.text)
  u.rate = rate
  u.onend = () => next(n + 1)                // when finished, go to the next one
  speechSynthesis.speak(u)
}
next(0)
```

That little loop is the heart of the whole feature. We keep the current number in
`index`, so we always know where we are.

### B2. State

The hook keeps one piece of state, `state`, which is `'idle'`, `'playing'` or
`'paused'`. The buttons look at it to decide what to show.

| State | Buttons shown |
|---|---|
| `idle` | speaker icon |
| `playing` | pause, stop, speed |
| `paused` | play (resume), stop, speed |

### B3. Pause, resume, stop

- **Pause** -> `speechSynthesis.pause()` and `state = 'paused'`
- **Resume** -> `speechSynthesis.resume()` and `state = 'playing'`
- **Stop** -> `speechSynthesis.cancel()`, remove highlight, `state = 'idle'`

### B4. Changing speed while reading

An utterance that is already speaking **keeps its old speed**. So when you change the
speed we cancel and start again from the **same sentence** with the new speed. You
only hear a tiny repeat of the current sentence.

### B5. The "run id" trick (the trickiest part)

When we call `cancel()`, the browser fires events for the old utterance
(`onend` / `onerror`). If we are not careful, those old events would start the
**next** piece by mistake, and two chains would speak at once.

The fix: every start / restart gets a new number.

```ts
const id = ++run.current          // new run, new number
...
u.onend = () => next(n + 1)       // inside next(): "if (id !== run.current) return"
```

Old callbacks see that their number is out of date and quietly do nothing.

### B6. Clean up

Speech would otherwise **keep going** after you leave. So we stop it when:

- the page is closed or reloaded (`pagehide` event),
- the editor goes away (React cleanup).

## 6. Step C: highlighting (`highlight()`)

```ts
function highlight(el) {
  // remove the old highlight
  document.querySelectorAll('.reading-now').forEach(n => n.classList.remove('reading-now'))
  // add it to the block now being read and bring it into view
  el.classList.add('reading-now')
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
```

The look of `.reading-now` (a soft plum background) is in
`src/styles/read-aloud.css`. If the user prefers reduced motion, scrolling is instant
instead of smooth.

## 7. The buttons (`ReadAloudControl.tsx`)

- If the browser has no `speechSynthesis`, the control renders **nothing**.
- It is placed in `TopBar.tsx`, right after the Preview button.
- It calls the hook: `const { state, rate, start, pause, resume, stop, setRate } = useReadAloud(editor)`.
- The speed button cycles through `READ_RATES = [0.75, 1, 1.25, 1.5, 2]`.

## 8. Known limits

- Reading **always starts from the top**, not from your cursor.
- The **voice** is the browser's default for the page language. There is no voice picker yet.
  Hindi / Hinglish quality depends on which voices your computer has installed.
- If you **edit while it reads**, the new text is not picked up (the pieces are made once, at the start).
- Code, formulas, images, video and audio are **skipped** on purpose.

## 9. How to try it

1. `npm run dev`, open a document that has some text.
2. Click the speaker icon in the top bar.
3. Check: it speaks, the block highlights, pause / resume / stop work, speed changes.
4. Reload the page while it speaks. The voice must stop.

## 10. How it is tested

`src/editor/speech/readAloud.test.ts` tests Step A (sentence splitting, skipping code,
list pauses). Step A is plain "text in, text out", so it is easy to test. The speaking
part (Step B) needs a real browser voice, so it is checked by hand.

Run the tests: `npx vitest run src/editor/speech`.

## 11. Ideas for later

- Start reading from the cursor or the selected block.
- A voice picker.
- Pick up edits while reading.
