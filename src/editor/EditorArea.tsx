import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { BlockErrorBoundary } from './BlockErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { SlashCommandPlugin } from './SlashCommandPlugin'
import { GenerateLinePlugin } from './plugins/GenerateLinePlugin'
import { EmptyLineHintPlugin } from './plugins/EmptyLineHintPlugin'
import { MatrixPickerPlugin, MatrixControlsPlugin } from './nodes/matrix'
import { DataTablePickerPlugin } from './nodes/datatable'
import { InitStreamPlugin } from './plugins/InitStreamPlugin'
import { SavePlugin } from './plugins/SavePlugin'
import { BlockControlsPlugin } from './plugins/BlockControlsPlugin'
import { BlockMovementPlugin } from './plugins/BlockMovementPlugin'
import { ColumnsPlugin } from './plugins/ColumnsPlugin'
import { CodeLanguagePlugin } from './plugins/CodeLanguagePlugin'
import { CodeHighlightPlugin } from './plugins/CodeHighlightPlugin'
import { EditorStatePlugin } from './plugins/EditorStatePlugin'
import { FloatingFormatPlugin } from './plugins/FloatingFormatPlugin'
import { OutlinePlugin } from './plugins/OutlinePlugin'
import { TrailingParagraphPlugin } from './plugins/TrailingParagraphPlugin'
import { SectionCardsPlugin } from './plugins/SectionCardsPlugin'
import { useDocument } from '../context/DocumentContext'

export function EditorArea() {
  const { title, setTitle } = useDocument()

  return (
    <div className="editor-area-scroll">
      <div className="editor-page">
        <input
          className="page-document-title-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Untitled"
          aria-label="Document title"
          spellCheck={false}
        />

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
                Type "/" to insert, or start writing…
              </div>
            }
            ErrorBoundary={BlockErrorBoundary}
          />

          {/* Core plugins */}
          <HistoryPlugin />
          <TrailingParagraphPlugin />
          <EmptyLineHintPlugin />
          <SectionCardsPlugin />
          <ListPlugin />
          <HorizontalRulePlugin />
          <TablePlugin />

          {/* Matrix: size picker on insert, +/- row/column controls while editing */}
          <MatrixPickerPlugin />
          <MatrixControlsPlugin />

          {/* Table: size picker on insert (same hover-a-grid as Matrix) */}
          <DataTablePickerPlugin />

          {/* Persistence */}
          <SavePlugin />
          <InitStreamPlugin />

          {/* Document intelligence */}
          <OutlinePlugin />

          {/* Editor state bridge → React UI */}
          <EditorStatePlugin />

          {/* Floating format toolbar */}
          <FloatingFormatPlugin />

          {/* Code block: Prism syntax highlighting + language dropdown/sample */}
          <CodeHighlightPlugin />
          <CodeLanguagePlugin />

          {/* Block hover controls (drag handle + action menu) */}
          <BlockControlsPlugin />

          {/* Keyboard block movement: Alt+Shift+↑↓ */}
          <BlockMovementPlugin />

          {/* Columns: safe Backspace/Delete at column edges + Tab/Shift+Tab between columns */}
          <ColumnsPlugin />

          {/* Slash command menu */}
          <SlashCommandPlugin />

          {/* "/generate" prompt line: block-type chips under the line */}
          <GenerateLinePlugin />
        </div>
      </div>
    </div>
  )
}
