import { useState, useEffect } from 'react'
import { TopBar } from './TopBar'
import { LeftSidebar } from './LeftSidebar'
import { RightPanel } from './RightPanel'
import { EditorArea } from '../editor/EditorArea'
import { useEditorUI } from '../editor/context/EditorUIContext'

export function AppLayout() {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const { rightTab, update, activeMath, activeModel3d } = useEditorUI()

  useEffect(() => {
    if (window.innerWidth < 1100) setLeftOpen(false)
    if (window.innerWidth < 768) setRightOpen(false)
  }, [])

  // Auto-switch to STEM tab when a math or 3D model block is focused
  useEffect(() => {
    if (activeMath) update({ rightTab: 'stem' })
  }, [activeMath, update])

  useEffect(() => {
    if (activeModel3d) update({ rightTab: 'stem' })
  }, [activeModel3d, update])

  const anyOpen = leftOpen || rightOpen

  return (
    <div className="app-shell">
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
        <RightPanel
          isOpen={rightOpen}
          activeTab={rightTab}
          onTabChange={(tab) => update({ rightTab: tab })}
        />
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
