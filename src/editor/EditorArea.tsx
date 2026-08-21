import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { SlashCommandPlugin } from './SlashCommandPlugin'
import { InitStreamPlugin } from './plugins/InitStreamPlugin'
import { AutoSavePlugin } from './plugins/AutoSavePlugin'
import { BlockControlsPlugin } from './plugins/BlockControlsPlugin'
import { BlockMovementPlugin } from './plugins/BlockMovementPlugin'
import { EditorStatePlugin } from './plugins/EditorStatePlugin'
import { FloatingFormatPlugin } from './plugins/FloatingFormatPlugin'
import { MOCK_DOCUMENT_TITLE } from './mockDocument'

export function EditorArea() {
  return (
    <div className="editor-area-scroll">
      <div className="editor-page">
        <h1 className="page-document-title">{MOCK_DOCUMENT_TITLE}</h1>

        <div className="editor-shell">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="editor-input"
                aria-label="Document editor"
                aria-multiline="true"
              />
            }
            placeholder={
              <div className="editor-placeholder">
                Start writing, or type "/" to insert a block…
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />

          {/* Core plugins */}
          <HistoryPlugin />
          <ListPlugin />
          <HorizontalRulePlugin />

          {/* Persistence */}
          <AutoSavePlugin />
          <InitStreamPlugin />

          {/* Editor state bridge → React UI */}
          <EditorStatePlugin />

          {/* Floating format toolbar */}
          <FloatingFormatPlugin />

          {/* Block hover controls (drag handle + action menu) */}
          <BlockControlsPlugin />

          {/* Keyboard block movement: Alt+Shift+↑↓ */}
          <BlockMovementPlugin />

          {/* Slash command menu */}
          <SlashCommandPlugin />
        </div>
      </div>
    </div>
  )
}
