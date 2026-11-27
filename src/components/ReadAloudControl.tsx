// The audiobook player of the document preview: a "Listen" button in the preview bar, and,
// once it plays, a player that floats at the bottom of the page (see editor/speech/useReadAloud).

import type { LexicalEditor } from 'lexical'
import { createPortal } from 'react-dom'
import { READ_RATES, speechSupported, useReadAloud } from '../editor/speech/useReadAloud'

export function ReadAloudPlayer({ editor }: { editor: LexicalEditor | null }) {
  const { state, rate, hasText, progress, skip, start, pause, resume, stop, setRate } = useReadAloud(editor)
  if (!speechSupported) return null

  const idle = state === 'idle'
  const nextRate = READ_RATES[(READ_RATES.indexOf(rate as (typeof READ_RATES)[number]) + 1) % READ_RATES.length]
  const percent = progress.total ? Math.round(((progress.at + 1) / progress.total) * 100) : 0

  return (
    <>
      <button
        type="button"
        className="preview-listen"
        disabled={!editor || (idle && !hasText)}
        onClick={idle ? start : stop}
        title={idle ? (hasText ? 'Listen to this document' : 'Nothing to read yet') : 'Stop listening'}
      >
        {idle ? <SpeakerIcon /> : <CloseIcon />} {idle ? 'Listen' : 'Stop'}
      </button>

      {!idle && createPortal(
        <div className="ra-player" role="group" aria-label="Audio player">
          <div className="ra-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Reading progress">
            <div className="ra-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="ra-row">
            <button type="button" className="ra-btn" onClick={() => skip(-1)} title="Previous section" aria-label="Previous section"><PrevIcon /></button>
            <button
              type="button"
              className="ra-btn ra-play"
              onClick={state === 'playing' ? pause : resume}
              title={state === 'playing' ? 'Pause' : 'Play'}
              aria-label={state === 'playing' ? 'Pause' : 'Play'}
            >
              {state === 'playing' ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button type="button" className="ra-btn" onClick={() => skip(1)} title="Next section" aria-label="Next section"><NextIcon /></button>
            <span className="ra-count">{percent}%</span>
            <button
              type="button"
              className="ra-rate"
              onClick={() => setRate(nextRate)}
              title="Reading speed"
              aria-label={`Reading speed ${rate}x, change to ${nextRate}x`}
            >
              {rate}×
            </button>
            <button type="button" className="ra-btn" onClick={stop} title="Stop and close" aria-label="Stop and close"><CloseIcon /></button>
          </div>
        </div>,
        document.body,
      )}
    </>
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
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="4" y="3" width="2.8" height="10" rx="0.8" /><rect x="9.2" y="3" width="2.8" height="10" rx="0.8" />
    </svg>
  )
}
function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" />
    </svg>
  )
}
function PrevIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="3" width="1.8" height="10" rx="0.7" /><path d="M13 3.2v9.6a.5.5 0 0 1-.8.4L5.6 8.4a.5.5 0 0 1 0-.8l6.6-4.8a.5.5 0 0 1 .8.4Z" />
    </svg>
  )
}
function NextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="11.7" y="3" width="1.8" height="10" rx="0.7" /><path d="M3 3.2v9.6a.5.5 0 0 0 .8.4l6.6-4.8a.5.5 0 0 0 0-.8L3.8 2.8a.5.5 0 0 0-.8.4Z" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}
