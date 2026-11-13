import { useState, useEffect } from 'react'
import { TopBar } from './TopBar'
import { LeftSidebar } from './LeftSidebar'
import { RightPanel } from './RightPanel'
import { EditorArea } from '../editor/EditorArea'
import { useEditorUI } from '../editor/context/EditorUIContext'
import { useDocument } from '../context/DocumentContext'

export function AppLayout() {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const { activeMath, activeModel3d } = useEditorUI()
  const { restoreWarning, setRestoreWarning } = useDocument()

  useEffect(() => {
    if (window.innerWidth < 1100) setLeftOpen(false)
    if (window.innerWidth < 768) setRightOpen(false)
  }, [])

  // Open the right panel when a math or 3D model block's properties are focused,
  // so its editor is visible without the user having to open the panel manually.
  useEffect(() => {
    if (activeMath || activeModel3d) setRightOpen(true)
  }, [activeMath, activeModel3d])

  const anyOpen = leftOpen || rightOpen

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
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen(v => !v)}
        onToggleRight={() => setRightOpen(v => !v)}
      />
      <div className="app-body">
        <LeftSidebar isOpen={leftOpen} />
        <main className="app-center">
          <EditorArea />
        </main>
        <RightPanel isOpen={rightOpen} />
        {/* Mobile overlay — closes whichever sidebar is open */}
        {anyOpen && (
          <div
            className="app-mobile-overlay"
            aria-hidden="true"
            onClick={() => {
              if (leftOpen) setLeftOpen(false)
              else if (rightOpen) setRightOpen(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
