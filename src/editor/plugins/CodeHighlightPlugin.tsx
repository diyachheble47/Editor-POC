// Real Prism-based syntax highlighting for code blocks, the Lexical-native
// way: @lexical/code-prism already ships a tokenizer + the keyboard/indent
// handling, it just needs registering once. CodeHighlightNode (registered in
// nodeRegistry.ts) is what actually renders each colored token span — the
// token → CSS class mapping lives in EditorConfig.ts's `theme.codeHighlight`.
//
// @lexical/code-prism only statically imports a handful of Prism grammars
// (js/ts/python/java/c/cpp/css/go/sql/markup/...). Without importing the
// rest ourselves, picking an unloaded language (e.g. PHP, JSON, Bash, Ruby,
// C#) wouldn't just render unhighlighted — PrismTokenizer silently falls
// back to the JavaScript grammar, which looks like broken/wrong coloring.
// So every language offered in CodeLanguagePlugin's dropdown needs its
// grammar imported somewhere; this is that somewhere.
// Prism's component files are plain scripts that expect a `Prism` global to
// already exist (set by this core import) — importing 'prismjs' here first
// guarantees that, regardless of whether this module or @lexical/code-prism's
// own facade happens to evaluate first in Vite's module graph.
import 'prismjs'
import 'prismjs/components/prism-markup-templating'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-csharp'

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { registerCodeHighlighting } from '@lexical/code-prism'

export function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return registerCodeHighlighting(editor)
  }, [editor])

  return null
}
