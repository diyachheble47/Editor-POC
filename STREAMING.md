# Streaming kaise kaam karta hai (SSE)

Is project mein streaming sirf ek jagah use hoti hai: **document kholna**. Saved document server se thoda-thoda karke aata hai aur editor mein "type" hota dikhta hai. Technique: **SSE (Server-Sent Events)**.

---

## 1. Streaming kya hoti hai?

**Normal API:**

```
Browser:  "Document de do"
Server:   ...sab kuch ready karta hai...
Server:   [poora document ek saath]
Browser:  ab dikhata hai
```

Jab tak poora jawab ready na ho, browser ko kuch nahi milta.

**Streaming API:**

```
Browser:  "Document de do"
Server:   "Chemistry"   -> browser turant dikhata hai
Server:   " is the"     -> dikhata hai
Server:   " study of"   -> dikhata hai
...
Server:   (done)
```

Connection khula rehta hai aur server tukde bhejta rehta hai. ChatGPT mein jo jawab type hota dikhta hai, wo yahi hai.

## 2. SSE ka format

SSE ek simple text format hai. Server `Content-Type: text/event-stream` bhejta hai, aur har event aisa dikhta hai:

```
id: 3
event: text
data: {"t":"text","child":{"text":"Che","format":0}}

```

- `id:` event ka number.
- `event:` event ka type (naam).
- `data:` asli data, hum yahan JSON bhejte hain.
- **Khali line** (do `\n`) ek event ko doosre se alag karti hai. Yahi sabse zaroori baat hai: parser isi khali line par ek event khatam maanta hai.

Network tab mein DevTools ise "EventStream" ki tarah dikhata hai.

---

## 3. Poora flow ek nazar mein

```
 Document kholo
      │
      ▼
 InitStreamPlugin ──fetch──▶  GET /documents/{id}/stream   (FastAPI)
      ▲                              │
      │                              │ DB se saved JSON padhta hai
      │                              │ chhote events mein todta hai
      │                              │ har event ke baad thoda ruk-ke bhejta hai
      │◀──── start / open / text / text / close / block / ... / done
      │
 streamIntoEditor: har event aate hi editor mein ek tukda jodta hai
```

---

## 4. Backend (FastAPI)

File: `backend/app/routers/documents.py`

### 4.1 Document ko events mein todna: `stream_events()`

Document DB mein ek bada JSON hai (`document_segments.state`):

```json
{ "root": { "children": [
    { "type": "paragraph", "children": [{ "type": "text", "text": "Chemistry is..." }] },
    { "type": "model3d", "modelUrl": "idb-asset:abc" }
]}}
```

`root.children` ka har item ek **block** hai. Server har block ko dekhta hai:

| Block kaisa hai | Server kya bhejta hai |
|---|---|
| **Text block** (paragraph, heading, quote: jiske children sirf text hain) | `open` (khali block), phir bahut saare `text` (3 characters ke tukde), phir `close` |
| **Baaki sab** (3D model, equation, circuit, graph, list, table...) | ek hi `block` event, poora block andar |

Poora order:

```
start  → {blocks: 2, revision: 5}
open   → {node: paragraph, children khali}
text   → "Che"
text   → "mis"
text   → "try"
...
close  → paragraph khatam
block  → {node: model3d poora}
done   → khatam
```

### 4.2 Dheere bhejna: `StreamingResponse`

```python
async def body():
    for n, event in enumerate(stream_events(state, chunk), start=1):
        yield _sse(event, n)          # event bhejo
        await asyncio.sleep(pause)    # thoda ruko
```

- `yield` ka matlab: "ye tukda abhi bhej do, function yahin rukta hai, baad mein aage badhega". Yahi streaming ka dil hai.
- `await asyncio.sleep(...)` sirf speed dheemi karne ke liye hai. Asli AI backend mein ye pause nahi hota, model jitni tezi se tokens banata hai utni tezi se aate hain.
- DB ki row **pehle hi poori padh li jaati hai**, phir sirf bhejna dheere hota hai. Isse DB connection lamba nahi khula rehta.

### 4.3 Speed ke settings (URL ke parameters)

`GET /documents/{id}/stream?chunk=3&delay_ms=35&block_delay_ms=600`

| Parameter | Matlab | Default |
|---|---|---|
| `chunk` | ek `text` event mein kitne characters | 3 |
| `delay_ms` | har text tukde ke beech pause (ms) | 35 |
| `block_delay_ms` | poore block (model, equation...) ke baad pause | 600 |

Naya paragraph khulne se pehle `delay_ms * 4` ka pause hota hai.

### 4.4 404 aur headers

- Jo document kabhi save nahi hua, uske liye 404 aata hai (frontend use khali document ki tarah kholta hai).
- Headers `Cache-Control: no-cache` aur `X-Accel-Buffering: no` isliye hain ki beech mein koi proxy ya cache events ko rok kar ek saath na bhej de.

---

## 5. Frontend: stream padhna

File: `src/storage/api.ts`, function `streamServerDocument`

Hum browser ka `EventSource` use **nahi** karte, balki `fetch` se haath se parse karte hain. Do wajah:

1. **Rokna** ho (document switch kiya) to `AbortController` se turant band kar sakte hain.
2. `EventSource` stream khatam hone par khud dobara connect karne lagta hai, aur poora document phir se bhej deta.

Kaam ka tareeqa:

```ts
const res = await fetch(url, { headers: { accept: 'text/event-stream' }, signal })
const reader = res.body.getReader()          // body ko tukdon mein padho
let buffer = ''
for (;;) {
  const { done, value } = await reader.read() // network se jo bhi aaya
  buffer += decoder.decode(value, { stream: true })
  // jab tak buffer mein "\n\n" (khali line) milti hai, ek poora event nikalo
  while ((end = buffer.indexOf('\n\n')) !== -1) {
    const frame = buffer.slice(0, end)        // ek poora event
    buffer = buffer.slice(end + 2)            // baaki aage ke liye
    ... "data:" wali line se JSON nikalo ...
    onEvent(event)                            // editor ko do
  }
}
```

**Buffer kyun?** Network tukde apni marzi se todta hai. Ek `read()` mein aadha event aa sakta hai, ya do events saath. Isliye hum buffer mein jodte jaate hain aur sirf **poore events** (khali line tak) nikalte hain.

`done` event aate hi function `true` return karta hai. Agar stream `done` ke bina toot gayi to error throw hota hai, aur app "Could not load" warning dikhata hai.

---

## 6. Frontend: editor mein jodna

### 6.1 `InitStreamPlugin` (`src/editor/plugins/InitStreamPlugin.tsx`)

Jab bhi `activeDocId` badalta hai (document khola ya switch kiya):

1. `editor.setEditable(false)`: stream ke dauraan editor read-only, taaki beech mein typing na ho.
2. `streamServerDocument(...)` shuru, har event `builder.apply(e)` ko jaata hai.
3. Khatam hone par:
   - `CLEAR_HISTORY_COMMAND`: Undo history saaf. Warna Ctrl+Z se load kiya hua document hi gayab ho jaata.
   - `markClean()`: top bar mein "Unsaved changes" nahi dikhna chahiye, kyunki document kholna edit nahi hai.
   - `setEditable(true)`.
4. Cleanup mein `abort.abort()`: document badla to purani stream band.

### 6.2 `createDocumentStreamBuilder` (`src/editor/streamIntoEditor.ts`)

Ye har event ko Lexical editor ke action mein badalta hai:

| Event | Editor mein kya hota hai |
|---|---|
| `start` | root saaf (`$getRoot().clear()`) |
| `open` | khali block banao, root ke end mein lagao, uski key yaad rakho |
| `text` | yaad rakhe hue block ke andar text jodo |
| `close` | "ab koi block khula nahi" |
| `block` | poora block banao aur root ke end mein lagao |
| `done` | agar document khali hai to ek khali paragraph |

Block banane ka kaam Lexical ka `$parseSerializedNode(json)` karta hai: saved JSON se asli node.

`editor.update(..., { discrete: true })` ka matlab: **abhi turant** apply karo. Isse har tukda turant screen par aata hai, aur "Save" ke time state poori taiyaar hoti hai.

Agar koi block bana nahi paaye (jaise wo feature ab hata diya gaya), to `skipped` count badhta hai aur ek warning dikhti hai.

---

## 7. Model, equation, circuit jaise blocks kaise aate hain?

Ye text ki tarah type nahi ho sakte, isliye server inhe **ek poora `block` event** bhejta hai (jisme us block ki saari settings hain: equation ka LaTeX, circuit ke parts aur wires, graph ka data). Frontend use turant bana deta hai, aur 600ms ke pause ke saath dikhta hai.

**3D model ki baat alag hai:** document ke JSON mein model ki file nahi hoti. Sirf ek chhota reference hota hai (`idb-asset:<id>`). Block screen mein aate hi model apni file browser ke IndexedDB se load karta hai (server par file nahi hoti). Isliye pehle block dikhta hai aur model thodi der baad render hota hai.

**Question / quiz:** abhi aisa koi block nahi hai. Jab bane to wo bhi isi tarah ek `block` event hoga. Stream ke code mein kuch badalna nahi padega, sirf naya block type register hoga.

---

## 8. Save aur streaming ka rishta

- **Stream ke dauraan** editor read-only hai, aur `SavePlugin` ko update-listener mein `editor.isEditable()` check karna padta hai. Isse stream se aaya content "edit" nahi gina jaata.
- Stream khatam hone se pehle **Save kaam nahi karta** (`snapshot` null return karta hai), taaki aadha bana document server par save na ho jaye.
- Save ka flow alag hai: `PUT /documents/{id}/segments/0` (poora JSON ek baar mein). Streaming sirf **padhne** ke liye hai.

---

## 9. Files ka map

| Kaam | File |
|---|---|
| Document stream endpoint, events todna | `backend/app/routers/documents.py` |
| Stream padhne wale functions | `src/storage/api.ts` |
| Event se editor banana | `src/editor/streamIntoEditor.ts` |
| Document kholne par stream chalana | `src/editor/plugins/InitStreamPlugin.tsx` |
| Backend tests | `backend/tests/test_api.py` (`test_document_streams_as_events`) |

## 10. Khud try karna

Backend chalu rakh ke terminal mein:

```bash
curl -N "http://localhost:8000/documents/<doc-id>/stream"
```

`-N` ka matlab buffering band, taaki events aate hi dikhein. Browser mein Network tab kholkar stream wale request par **EventStream** tab dekho.

## 11. Aage kya ho sakta hai (abhi nahi bana)

- **Asli AI**: `body()` mein `asyncio.sleep` ki jagah AI model ke tokens `yield` karo. Frontend ka code lagbhag waisa hi rahega.
- **Stream beech mein tootne par jaari rakhna**: `id:` aur `Last-Event-ID` header se wahin se dobara shuru karna.
- **Block ke andar ka text type karna**: callout ya list ke text ko bhi tukdon mein bhejna.
