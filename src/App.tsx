import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { editorConfig } from './editor/EditorConfig'
import { AppLayout } from './components/AppLayout'
import './styles/tokens.css'
import './App.css'

function App() {
  return (
    <LexicalComposer initialConfig={editorConfig}>
      <AppLayout />
    </LexicalComposer>
  )
}

export default App
