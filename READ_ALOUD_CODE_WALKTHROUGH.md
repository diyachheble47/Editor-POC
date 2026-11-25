# Read aloud: code walkthrough (line by line)

Ye file **code ke hisaab se** samjhati hai. Order wahi hai jis order mein code chalta hai:

```
Button click  ->  start()  ->  speechPieces()  ->  speakFrom()  ->  next() loop  ->  finish()
```

Files:

| File | Kaam |
|---|---|
| `src/components/ReadAloudControl.tsx` | Button (UI) |
| `src/editor/speech/useReadAloud.ts` | Bolne ka logic (React hook) |
| `src/editor/speech/readAloud.ts` | Document se text nikalna |

---

## 0. Pehle 3 chhoti cheezein samajh lo

**(a) `speechSynthesis` kya hai?**
Browser ka ek ready object hai. Hum use text dete hain, wo bolta hai.

```ts
const u = new SpeechSynthesisUtterance('Hello')  // "ye bolna hai" ka packet
window.speechSynthesis.speak(u)                  // bolna shuru
```

`speak()` ek **queue** mein daalta hai. Agar pehle se kuch bol raha hai to ye uske baad bolta hai.

**(b) `useRef` kya hai?**
React ka ek "dabba" jisme value rakh sakte ho. `useState` se fark: `ref.current` badalne par
component **dobara render nahi hota**, aur callbacks ke andar hamesha **latest value** milti hai.
Isliye `index`, `run`, `pieces` jaisi cheezein ref mein hain, state mein nahi.

**(c) `useCallback` kya hai?**
Function ko yaad rakhta hai, taaki har render par naya function na bane. Bas performance ke liye.

---

## 1. Button: `ReadAloudControl.tsx`

```tsx
export function ReadAloudControl({ editor, disabled }) {
  const { state, rate, start, pause, resume, stop, setRate } = useReadAloud(editor)
  if (!speechSupported) return null
```

- `useReadAloud(editor)` saara logic deta hai: `state`, `rate`, aur functions.
- `speechSupported` false ho (purana browser) to **kuch render hi nahi hota**, button gayab.

```tsx
  if (state === 'idle') {
    return <button ... disabled={disabled} onClick={start}> <SpeakerIcon /> </button>
  }
```

- Kuch bol nahi raha (`idle`) -> sirf speaker button. Click par `start` chalega.
- `disabled` TopBar se aata hai: editor ready nahi ya document load ho raha ho to button band.

```tsx
  const nextRate = READ_RATES[(READ_RATES.indexOf(rate) + 1) % READ_RATES.length]
```

- `READ_RATES = [0.75, 1, 1.25, 1.5, 2]`.
- Current rate ka index + 1, aur `% length` se last ke baad wapas pehle par (**cycle**).
  Example: rate 2 hai, index 4, `(4+1) % 5 = 0` -> next 0.75.

```tsx
  <button onClick={state === 'playing' ? pause : resume}>
    {state === 'playing' ? <PauseIcon /> : <PlayIcon />}
  </button>
```

- Bol raha hai (`playing`) -> pause icon, click par `pause`.
- Paused hai -> play icon, click par `resume`.

```tsx
  <button onClick={stop}> <StopIcon /> </button>
  <button onClick={() => setRate(nextRate)}> {rate}× </button>
```

- Stop aur speed button. Speed button par jo number dikhta hai wo current rate hai.

Isko `TopBar.tsx` mein is tarah lagaya hai:

```tsx
<ReadAloudControl editor={editor} disabled={!editor || docLoading} />
```

---

## 2. Text nikalna: `readAloud.ts`

### 2.1 Do constants

```ts
const SKIP = 'pre, canvas, svg, img, iframe, video, audio, button, input, textarea, style, script, .katex, .rz-handle, [aria-hidden="true"]'
const PAUSE_AFTER = 'li, th, td, h1, h2, h3, h4, h5, h6'
const ENDS_SENTENCE = /[.!?:;,]$/
```

- `SKIP`: CSS selectors ki list. Inko bolna nahi hai (code, formula, image, video, buttons).
- `PAUSE_AFTER`: in elements ke baad rukna hai.
- `ENDS_SENTENCE`: regex. "text ke end mein `. ! ? : ; ,` me se koi hai?" (`$` matlab end).

### 2.2 `readableText(block)`: ek block ka bolne layak text

```ts
export function readableText(block: HTMLElement): string {
  const copy = block.cloneNode(true) as HTMLElement
```

- `cloneNode(true)` = block ki **poori copy** (andar ke bacche bhi). Hum copy badalte hain, asli document nahi.

```ts
  copy.querySelectorAll(SKIP).forEach(n => n.remove())
```

- Copy mein se jo bhi `SKIP` se match kare, sab delete.

```ts
  copy.querySelectorAll(PAUSE_AFTER).forEach(n => {
    if (!ENDS_SENTENCE.test((n.textContent ?? '').trim())) n.append('. ')
    else n.append(' ')
  })
```

- Har `li / td / heading` ke liye: agar uska text pehle se `.`/`?` jaisa kuch pe khatam nahi hota to
  end mein `". "` jodo. Warna sirf ek space.
- Isse `Apples` + `Pears` -> `Apples. Pears.` (voice beech mein rukti hai).
- Check karne ka fayda: `Why?` ke baad `.` nahi lagta, warna "Why?." ho jata.

```ts
  copy.querySelectorAll('p, div, br').forEach(n => n.append(' '))
```

- Paragraph/div/line-break ke end mein space, taaki do paragraph ke shabd chipak na jaayein
  (warna "end" aur "Begin" mil kar "endBegin" ban jaata).

```ts
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
```

- `textContent` = copy ka sirf text (tags nahi).
- `\s+` -> ek space: extra spaces/newlines saaf.
- `trim()` = aage peeche ke space hata do.

### 2.3 `splitSentences(text, max = 220)`: chhote tukde

```ts
export function splitSentences(text: string, max = 220): string[] {
  const out: string[] = []
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
```

- `split(/(?<=[.!?])\s+/)`: "jahan `. ! ?` ke **baad** space ho, wahan kaato". `(?<=...)` ko lookbehind kehte hain:
  wo punctuation tukde ke saath hi rehta hai.
- `'One. Two! Three?'` -> `['One.', 'Two!', 'Three?']`.

```ts
    let rest = sentence.trim()
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max)
      if (cut <= 0) cut = max
      out.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
    if (rest) out.push(rest)
  }
  return out
}
```

- Agar ek sentence 220 se lamba hai to:
  - `lastIndexOf(' ', max)` = 220 ke aas paas **aakhri space** dhundo (shabd beech mein na kate).
  - Space na mile (`cut <= 0`) to seedha 220 par kaato.
  - Pehla tukda `out` mein, baaki `rest` mein, loop dobara.
- Aakhir mein jo bacha wo `out` mein.

### 2.4 `speechPieces(root)`: poore document ke tukde

```ts
export function speechPieces(root: HTMLElement): SpeechPiece[] {
  const pieces: SpeechPiece[] = []
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue
    for (const text of splitSentences(readableText(child))) pieces.push({ el: child, text })
  }
  return pieces
}
```

- `root` = editor ka DOM element. `root.children` = uske **top-level blocks**
  (paragraph, heading, list, table...).
- Har block ke liye: `readableText` -> `splitSentences` -> har sentence ke liye `{ el: block, text }`.
- `el` yaad rakhte hain taaki baad mein **us block ko highlight** kar sakein.

Example: `<h2>Plants</h2><p>They grow. They eat light.</p>` ka result:

```ts
[
  { el: <h2>, text: 'Plants.' },        // heading ke baad "." laga
  { el: <p>,  text: 'They grow.' },
  { el: <p>,  text: 'They eat light.' },
]
```

---

## 3. Bolne ka logic: `useReadAloud.ts`

### 3.1 Upar ka setup

```ts
export type ReadState = 'idle' | 'playing' | 'paused'
export const READ_RATES = [0.75, 1, 1.25, 1.5, 2] as const
const NOW_CLASS = 'reading-now'
export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
```

- 3 state. Speeds ki list. Highlight wali CSS class ka naam.
- `speechSupported`: browser mein `speechSynthesis` hai ya nahi.

### 3.2 `highlight(el)`

```ts
function highlight(el: HTMLElement | null): void {
  document.querySelectorAll(`.${NOW_CLASS}`).forEach(n => n.classList.remove(NOW_CLASS))
  if (!el) return
  el.classList.add(NOW_CLASS)
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
}
```

1. Purana highlight sab jagah se hatao.
2. `el` null hai (stop ke time) to bas yahin ruk jao: ab koi highlight nahi.
3. Naye block par class lagao. Dikhne ka style `read-aloud.css` mein hai.
4. `matchMedia(...)`: user ne system mein "animation kam karo" lagaya hai? Haan to turant scroll, nahi to smooth.
5. `scrollIntoView({ block: 'center' })`: block ko screen ke beech mein laao.

### 3.3 Hook ke andar ke variables

```ts
const [state, setState] = useState<ReadState>('idle')   // UI ke liye (re-render chahiye)
const [rate, setRateState] = useState<number>(1)         // UI par "1×" dikhane ke liye
const pieces = useRef<SpeechPiece[]>([])  // bolne wale tukde
const index = useRef(0)                   // abhi kaun sa tukda
const run = useRef(0)                     // "run id" (neeche samjhaya)
const rateRef = useRef(1)                 // rate ki latest value callbacks ke liye
```

Faisla: jo **screen par dikhna** hai wo `useState`; jo sirf **andar ka kaam** hai wo `useRef`.
`rate` dono mein kyun? State UI ke liye, ref isliye ki chalte hue `next()` loop ko
latest rate mil sake (state ki purani value closure mein atak sakti hai).

### 3.4 `finish()`: sab band

```ts
const finish = useCallback(() => {
  run.current++
  window.speechSynthesis.cancel()
  highlight(null)
  setState('idle')
}, [])
```

- `run.current++`: run id badlo, taaki purane callbacks bekaar ho jaayein (3.6 dekho).
- `cancel()`: browser ki queue khaali, bolna band.
- `highlight(null)`: highlight hatao.
- `setState('idle')`: button wapas speaker ban jata hai.

Ye `stop` button par bhi chalta hai (hook ke return mein `stop: finish`).

### 3.5 `start()`: shuru

```ts
const start = useCallback(() => {
  const root = editor?.getRootElement()
  if (!root || !speechSupported) return
  pieces.current = speechPieces(root)
  if (!pieces.current.length) return
  setState('playing')
  speakFrom(0)
}, [editor, speakFrom])
```

1. `editor.getRootElement()`: Lexical editor ka DOM element.
2. Section 2.4 wala `speechPieces(root)` chalta hai aur tukdon ki list `pieces.current` mein rakhta hai.
   **Dhyan do:** tukde yahin **ek baar** bante hain. Isliye reading ke beech edit karne par naya text nahi uthta.
3. Document khaali hai to kuch nahi.
4. `setState('playing')` aur `speakFrom(0)`: pehle tukde se shuru.

### 3.6 `speakFrom(i)`: asli dil

```ts
const speakFrom = useCallback((i: number) => {
  const id = ++run.current
  window.speechSynthesis.cancel()
  window.speechSynthesis.resume()
```

- `id = ++run.current`: **naya run id**. Is chain ka apna number.
- `cancel()`: pehle ka kuch chal raha ho to band.
- `resume()`: agar engine pause mein tha, to cancel ke baad bhi paused rehta. Ye usse jagata hai.

```ts
  const next = (n: number) => {
    if (id !== run.current) return
```

- **Run id check.** Agar is chain ka `id` ab latest nahi hai (kisi ne stop/restart kiya), to chup chap nikal jao.
  Ye zaroori kyun hai: `cancel()` karne par browser purane utterance ke `onend`/`onerror` bhi bhejta hai.
  Check na ho to purana chain agla tukda bol dega aur do chain ek saath bolenge.

```ts
    const piece = pieces.current[n]
    if (!piece) { finish(); return }
```

- `n` wala tukda nahi mila = **sab ho gaye** -> `finish()`.

```ts
    index.current = n
    highlight(piece.el)
```

- Abhi kahan hain ye yaad rakho (speed badalne ke kaam aata hai), aur us block ko highlight karo.

```ts
    const u = new SpeechSynthesisUtterance(piece.text)
    u.rate = rateRef.current
    u.lang = document.documentElement.lang || navigator.language
```

- Bolne ka packet banao. Speed `rateRef` se. Language page ki (`<html lang>`), na ho to browser ki.

```ts
    u.onend = () => next(n + 1)
```

- **Chain ki kadi.** Ye tukda bol chuka -> agla tukda (`n + 1`). Isi se poora document padha jata hai.

```ts
    u.onerror = e => { if (id === run.current && e.error !== 'canceled' && e.error !== 'interrupted') finish() }
```

- Koi asli error aaye to band karo. Lekin `canceled` / `interrupted` ko ignore karo,
  kyunki wo hum khud `cancel()` se paida karte hain (normal hai).

```ts
    window.speechSynthesis.speak(u)
  }
  next(i)
}, [finish])
```

- `speak(u)` se bolna shuru. Aakhir mein `next(i)` se pehla tukda chalu.

**Poora flow ek example se** (3 tukde: A, B, C):

```
start() -> speakFrom(0), id=1
  next(0): highlight(A), speak(A)
     A khatam -> onend -> next(1): highlight(B), speak(B)
        B khatam -> onend -> next(2): highlight(C), speak(C)
           C khatam -> onend -> next(3): piece nahi mila -> finish()
```

### 3.7 Pause / resume

```ts
const pause = useCallback(() => { window.speechSynthesis.pause(); setState('paused') }, [])
const resume = useCallback(() => { window.speechSynthesis.resume(); setState('playing') }, [])
```

- Browser ko bolo pause/resume, aur UI ka state badlo. Chain waisi hi rehti hai, bas awaaz ruki hoti hai.

### 3.8 `setRate(r)`: speed badalna

```ts
const setRate = useCallback((r: number) => {
  rateRef.current = r
  setRateState(r)
  if (state !== 'idle') { setState('playing'); speakFrom(index.current) }
}, [state, speakFrom])
```

- Nayi speed `ref` (bolne ke liye) aur `state` (button par dikhane ke liye) dono mein.
- Kuch chal raha ho ya paused ho, to `speakFrom(index.current)`: **usi tukde se** dobara, nayi speed par.
  Wajah: jo utterance bol raha hai wo purani speed pakde rehta hai.
- Paused tha to `playing` bhi kar dete hain (speed badalna = chalna shuru).

### 3.9 Safai (cleanup)

```ts
useEffect(() => {
  if (!speechSupported) return
  const stop = () => { run.current++; window.speechSynthesis.cancel() }
  window.addEventListener('pagehide', stop)
  return () => { window.removeEventListener('pagehide', stop); stop(); highlight(null) }
}, [])
```

- `useEffect` mein `return () => {...}` ko **cleanup** kehte hain: component hatne par chalta hai.
- `pagehide`: page band/reload/chhodte waqt browser ye event deta hai. Tab awaaz band.
- Cleanup mein listener hata ke `stop()` aur highlight bhi saaf.
- `[]` = ye sirf ek baar (mount par) set hota hai.

### 3.10 Return

```ts
return { state, rate, start, pause, resume, stop: finish, setRate }
```

Button wali file ko bas yahi chahiye.

---

## 4. Poora safar ek jagah: "Plants. They grow." document

1. Teacher speaker dabata hai -> `start()`.
2. `speechPieces()` -> `[Plants., They grow.]`, har ek ke saath uska block.
3. `setState('playing')` -> button pause/stop/speed wala ban jata hai.
4. `speakFrom(0)`: `next(0)` -> heading highlight, "Plants." bola gaya.
5. `onend` -> `next(1)` -> paragraph highlight, "They grow." bola gaya.
6. `onend` -> `next(2)` -> tukda nahi -> `finish()` -> highlight gayab, `idle`.

Beech mein pause dabaya: `speechSynthesis.pause()`, state `paused`, chain wahin ruki.
Speed badli: `speakFrom(index.current)` se usi sentence se naye speed par.

---

## 5. Khud try karne ke liye kuch experiments (seekhne ka best tareeka)

1. `useReadAloud.ts` mein `next` ke andar `console.log('speaking', n, piece.text)` daalo. Console mein chain dikhegi.
2. `if (id !== run.current) return` line **hata ke** reading ke beech speed badlo. Do awaazein ek saath sunogi: yahi run id ki zaroorat hai.
3. `splitSentences(text, 220)` ko `1000` karo aur lamba document padho: Chrome beech mein ruk sakta hai.
4. `SKIP` se `pre` hata do: code blocks bhi padhe jaayenge.

---

## 6. Tests

`readAloud.test.ts` sirf **Section 2** (text nikalna) test karta hai, kyunki wo "text andar, text bahar" hai.
Bolne wala hissa asli browser awaaz maangta hai, isliye wo haath se check hota hai.

```
npx vitest run src/editor/speech
```
