import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { editorConfig } from './editor/EditorConfig'
import { AppLayout } from './components/AppLayout'
import { EditorUIProvider } from './editor/context/EditorUIContext'
import { AIServiceProvider } from './ai/AIServiceContext'
import { DocumentProvider } from './context/DocumentContext'
import { MockAIService } from './ai/MockAIService'
import './styles/tokens.css'
import './App.css'

const aiService = new MockAIService()

function App() {
  return (
    <AIServiceProvider service={aiService}>
      <DocumentProvider>
        <EditorUIProvider>
          <LexicalComposer initialConfig={editorConfig}>
            <AppLayout />
          </LexicalComposer>
        </EditorUIProvider>
      </DocumentProvider>
    </AIServiceProvider>
  )
}

export default App
