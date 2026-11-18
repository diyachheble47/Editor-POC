import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { editorConfig } from './editor/EditorConfig'
import { AppLayout } from './components/AppLayout'
import { EditorUIProvider } from './editor/context/EditorUIContext'
import { EditorFormatProvider } from './editor/context/EditorFormatContext'
import { DocumentProvider, useDocument } from './context/DocumentContext'
import { ThemeProvider } from './context/ThemeContext'
import './styles/tokens.css'
import './App.css'
import './styles/rich-blocks.css'

// Keyed by activeDocId so switching documents fully remounts the Lexical
// editor (and the node-key-scoped EditorUIContext state alongside it)
// instead of trying to reuse a composer instance across unrelated
// documents' node trees.
function EditorRoot() {
  const { ready, loadError, retryLoad, activeDocId } = useDocument()
  // Don't mount the editor (or the plugins inside it) until the document list
  // has loaded from the server and activeDocId is a real document id.
  if (loadError) {
    return (
      <div role="alert" style={{ padding: 32 }}>
        <p>{loadError}</p>
        <button type="button" onClick={retryLoad}>Retry</button>
      </div>
    )
  }
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
    <ThemeProvider>
      <DocumentProvider>
        <EditorRoot />
      </DocumentProvider>
    </ThemeProvider>
  )
}

export default App
