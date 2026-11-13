import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { editorConfig } from './editor/EditorConfig'
import { AppLayout } from './components/AppLayout'
import { EditorUIProvider } from './editor/context/EditorUIContext'
import { EditorFormatProvider } from './editor/context/EditorFormatContext'
import { DocumentProvider, useDocument } from './context/DocumentContext'
import './styles/tokens.css'
import './App.css'

// Keyed by activeDocId so switching documents fully remounts the Lexical
// editor (and the node-key-scoped EditorUIContext state alongside it)
// instead of trying to reuse a composer instance across unrelated
// documents' node trees.
function EditorRoot() {
  const { ready, activeDocId } = useDocument()
  // Don't mount the editor (or InitStreamPlugin/AutoSavePlugin inside it)
  // until the Dexie bootstrap — including the one-time migration off the
  // old localStorage scheme, if needed — has resolved and activeDocId is a
  // real document id.
  if (!ready) return null

  return (
    <EditorUIProvider>
      <EditorFormatProvider>
        <LexicalComposer key={activeDocId} initialConfig={editorConfig}>
          <AppLayout />
        </LexicalComposer>
      </EditorFormatProvider>
    </EditorUIProvider>
  )
}

function App() {
  return (
    <DocumentProvider>
      <EditorRoot />
    </DocumentProvider>
  )
}

export default App
