import { useState, useEffect } from 'react'
import { TopBar } from './TopBar'
import { LeftSidebar } from './LeftSidebar'
import { RightPanel } from './RightPanel'
import type { RightTab } from './RightPanel'
import { EditorArea } from '../editor/EditorArea'
import { EditorUIProvider } from '../editor/context/EditorUIContext'

export function AppLayout() {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [rightTab, setRightTab] = useState<RightTab>('insert')

  useEffect(() => {
    if (window.innerWidth < 1100) setLeftOpen(false)
    if (window.innerWidth < 768) setRightOpen(false)
  }, [])

  return (
    <EditorUIProvider>
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
            onTabChange={setRightTab}
          />
        </div>
      </div>
    </EditorUIProvider>
  )
}
