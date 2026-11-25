// Reads the document aloud with the browser's speech engine (Web Speech API).
// One short utterance per sentence, chained, so long documents do not get cut off.
// The block being read is highlighted and scrolled into view.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LexicalEditor } from 'lexical'
import { speechPieces } from './readAloud'
import type { SpeechPiece } from './readAloud'

export type ReadState = 'idle' | 'playing' | 'paused'
export const READ_RATES = [0.75, 1, 1.25, 1.5, 2] as const
const NOW_CLASS = 'reading-now'

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

function highlight(el: HTMLElement | null): void {
  document.querySelectorAll(`.${NOW_CLASS}`).forEach(n => n.classList.remove(NOW_CLASS))
  if (!el) return
  el.classList.add(NOW_CLASS)
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
}

export function useReadAloud(editor: LexicalEditor | null) {
  const [state, setState] = useState<ReadState>('idle')
  const [rate, setRateState] = useState<number>(1)
  const pieces = useRef<SpeechPiece[]>([])
  const index = useRef(0)
  // Each start / restart gets a new run id; callbacks of an older (cancelled) run are ignored.
  const run = useRef(0)
  const rateRef = useRef(1)

  const finish = useCallback(() => {
    run.current++
    window.speechSynthesis.cancel()
    highlight(null)
    setState('idle')
  }, [])

  const speakFrom = useCallback((i: number) => {
    const id = ++run.current
    window.speechSynthesis.cancel()
    window.speechSynthesis.resume() // a cancelled, paused engine would otherwise stay paused
    const next = (n: number) => {
      if (id !== run.current) return
      const piece = pieces.current[n]
      if (!piece) { finish(); return }
      index.current = n
      highlight(piece.el)
      const u = new SpeechSynthesisUtterance(piece.text)
      u.rate = rateRef.current
      u.lang = document.documentElement.lang || navigator.language
      u.onend = () => next(n + 1)
      u.onerror = e => { if (id === run.current && e.error !== 'canceled' && e.error !== 'interrupted') finish() }
      window.speechSynthesis.speak(u)
    }
    next(i)
  }, [finish])

  const start = useCallback(() => {
    const root = editor?.getRootElement()
    if (!root || !speechSupported) return
    pieces.current = speechPieces(root)
    if (!pieces.current.length) return
    setState('playing')
    speakFrom(0)
  }, [editor, speakFrom])

  const pause = useCallback(() => { window.speechSynthesis.pause(); setState('paused') }, [])
  const resume = useCallback(() => { window.speechSynthesis.resume(); setState('playing') }, [])

  const setRate = useCallback((r: number) => {
    rateRef.current = r
    setRateState(r)
    // A speaking utterance keeps its old speed, so carry on from the same sentence at the new one.
    if (state !== 'idle') { setState('playing'); speakFrom(index.current) }
  }, [state, speakFrom])

  // Stop when the editor goes away or the page is left: speech would otherwise carry on.
  useEffect(() => {
    if (!speechSupported) return
    const stop = () => { run.current++; window.speechSynthesis.cancel() }
    window.addEventListener('pagehide', stop)
    return () => { window.removeEventListener('pagehide', stop); stop(); highlight(null) }
  }, [])

  return { state, rate, start, pause, resume, stop: finish, setRate }
}
