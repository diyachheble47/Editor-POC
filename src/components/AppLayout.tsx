import { useState, useEffect } from 'react'
import { TopBar } from './TopBar'
import { LeftSidebar } from './LeftSidebar'
import { RightPanel } from './RightPanel'
import { EditorArea } from '../editor/EditorArea'
import { useEditorUI } from '../editor/context/EditorUIContext'
import { useDocument } from '../context/DocumentContext'

export function AppLayout() {
  const [leftOpen, setLeftOpen] = useState(true)
  const { activeMath, activeModel3d, agent } = useEditorUI()
  const { restoreWarning, setRestoreWarning } = useDocument()

  useEffect(() => {
    if (window.innerWidth < 1100) setLeftOpen(false)
  }, [])

  // The right panel exists only while a math or 3D model block's properties
  // are being edited; there's nothing to show (or toggle) otherwise.
  const rightOpen = Boolean(activeMath || activeModel3d || agent)

  const anyOpen = leftOpen

  return (
    <div className="app-shell">
      {restoreWarning && (
        <div className="restore-warning-banner" role="alert">
          <span className="restore-warning-text">{restoreWarning}</span>
          <button
            type="button"
            className="restore-warning-dismiss"
            onClick={() => setRestoreWarning(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <TopBar
        leftOpen={leftOpen}
        onToggleLeft={() => setLeftOpen(v => !v)}
      />
      <div className="app-body">
        <LeftSidebar isOpen={leftOpen} />
        <main className="app-center">
          <EditorArea />
        </main>
        <RightPanel isOpen={rightOpen} />
        {/* Mobile overlay — closes the navigator */}
        {anyOpen && (
          <div
            className="app-mobile-overlay"
            aria-hidden="true"
            onClick={() => {
              setLeftOpen(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
