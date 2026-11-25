// Top-bar controls for reading the document aloud (see editor/speech/useReadAloud).
// A speaker button starts it; while it plays there are pause / resume, stop and a speed button.

import type { LexicalEditor } from 'lexical'
import { READ_RATES, speechSupported, useReadAloud } from '../editor/speech/useReadAloud'

export function ReadAloudControl({ editor, disabled }: { editor: LexicalEditor | null; disabled: boolean }) {
  const { state, rate, start, pause, resume, stop, setRate } = useReadAloud(editor)
  if (!speechSupported) return null

  if (state === 'idle') {
    return (
      <button type="button" className="icon-btn" disabled={disabled} onClick={start} title="Read aloud" aria-label="Read aloud">
        <SpeakerIcon />
      </button>
    )
  }

  const nextRate = READ_RATES[(READ_RATES.indexOf(rate as (typeof READ_RATES)[number]) + 1) % READ_RATES.length]
  return (
    <span className="read-aloud" role="group" aria-label="Read aloud controls">
      <button
        type="button"
        className="icon-btn read-aloud-on"
        onClick={state === 'playing' ? pause : resume}
        title={state === 'playing' ? 'Pause reading' : 'Resume reading'}
        aria-label={state === 'playing' ? 'Pause reading' : 'Resume reading'}
      >
        {state === 'playing' ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" className="icon-btn" onClick={stop} title="Stop reading" aria-label="Stop reading">
        <StopIcon />
      </button>
      <button
        type="button"
        className="read-aloud-rate"
        onClick={() => setRate(nextRate)}
        title="Reading speed"
        aria-label={`Reading speed ${rate}x, change to ${nextRate}x`}
      >
        {rate}×
      </button>
    </span>
  )
}

function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 6v4h2.6L8.5 12.8V3.2L5.1 6H2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10.7 5.7a3.2 3.2 0 0 1 0 4.6M12.4 3.9a5.7 5.7 0 0 1 0 8.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="4" y="3" width="2.8" height="10" rx="0.8" />
      <rect x="9.2" y="3" width="2.8" height="10" rx="0.8" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
    </svg>
  )
}
