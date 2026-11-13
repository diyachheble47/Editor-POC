// Shows a small floating toolbar above the active code block: a language
// dropdown and (only while the block is still empty) a button that drops in
// a short sample snippet for that language, so "/code" doesn't just leave
// the user staring at a blank box.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, $getNodeByKey, $createTextNode, $createLineBreakNode } from 'lexical'
import type { NodeKey } from 'lexical'
import { $isCodeNode } from '@lexical/code-core'

interface ToolbarPos { top: number; left: number }

const LANGUAGES: [string, string][] = [
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['python', 'Python'],
  ['java', 'Java'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['php', 'PHP'],
  ['ruby', 'Ruby'],
  ['markup', 'HTML'],
  ['css', 'CSS'],
  ['sql', 'SQL'],
  ['bash', 'Shell'],
  ['json', 'JSON'],
]

const SAMPLES: Record<string, string> = {
  javascript: 'function greet(name) {\n  return `Hello, ${name}!`\n}\n\nconsole.log(greet("world"))',
  typescript: 'function greet(name: string): string {\n  return `Hello, ${name}!`\n}\n\nconsole.log(greet("world"))',
  python: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("world"))',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}',
  c: '#include <stdio.h>\n\nint main() {\n    printf("Hello, world!\\n");\n    return 0;\n}',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, world!" << std::endl;\n    return 0;\n}',
  csharp: 'class Program {\n    static void Main() {\n        System.Console.WriteLine("Hello, world!");\n    }\n}',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, world!")\n}',
  rust: 'fn main() {\n    println!("Hello, world!");\n}',
  php: '<?php\n\nfunction greet($name) {\n    return "Hello, $name!";\n}\n\necho greet("world");',
  ruby: 'def greet(name)\n  "Hello, #{name}!"\nend\n\nputs greet("world")',
  markup: '<!doctype html>\n<html>\n  <body>\n    <h1>Hello, world!</h1>\n  </body>\n</html>',
  css: '.button {\n  padding: 8px 16px;\n  border-radius: 6px;\n  background: #4f46e5;\n}',
  sql: 'SELECT id, name\nFROM users\nWHERE active = true\nORDER BY name;',
  bash: '#!/usr/bin/env bash\necho "Hello, world!"',
  json: '{\n  "name": "example",\n  "version": "1.0.0"\n}',
}

export function CodeLanguagePlugin() {
  const [editor] = useLexicalComposerContext()
  const [pos, setPos] = useState<ToolbarPos | null>(null)
  const [nodeKey, setNodeKey] = useState<NodeKey | null>(null)
  const [language, setLanguage] = useState('javascript')
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          setPos(null)
          setNodeKey(null)
          return
        }
        const anchorNode = selection.anchor.getNode()
        if (anchorNode.getKey() === 'root') { setPos(null); setNodeKey(null); return }
        const topLevel = anchorNode.getTopLevelElementOrThrow()
        if (!$isCodeNode(topLevel)) { setPos(null); setNodeKey(null); return }

        // Only show for a still-empty block. Once there's real code in it,
        // a floating toolbar anchored inside the block's own top padding
        // would sit on top of the first line of code — and anchoring it
        // *above* the block instead risks covering whatever block precedes
        // it (a short paragraph, another code block, ...), which is what
        // made a perfectly intact paragraph look "deleted" underneath it.
        if (topLevel.getTextContent().length > 0) {
          setPos(null); setNodeKey(null); return
        }

        const dom = editor.getElementByKey(topLevel.getKey())
        if (!dom) { setPos(null); setNodeKey(null); return }

        const rect = dom.getBoundingClientRect()
        setPos({ top: rect.top + 6, left: rect.left + 8 })
        setNodeKey(topLevel.getKey())
        setLanguage(topLevel.getLanguage() || 'javascript')
        setIsEmpty(true)
      })
    })
  }, [editor])

  if (!pos || !nodeKey) return null

  const applyLanguage = (lang: string) => {
    setLanguage(lang)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isCodeNode(node)) node.setLanguage(lang)
    })
  }

  const insertSample = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!$isCodeNode(node)) return
      node.setLanguage(language)
      node.splice(0, node.getChildrenSize(), [])
      const sample = SAMPLES[language] ?? ''
      sample.split('\n').forEach((line, i) => {
        if (i > 0) node.append($createLineBreakNode())
        if (line.length) node.append($createTextNode(line))
      })
      node.selectEnd()
    })
  }

  return createPortal(
    <div className="code-lang-toolbar" style={{ top: pos.top, left: pos.left }}>
      <select
        className="code-lang-select"
        value={language}
        onChange={e => applyLanguage(e.target.value)}
      >
        {LANGUAGES.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      {isEmpty && (
        <button className="code-lang-sample-btn" onMouseDown={e => e.preventDefault()} onClick={insertSample}>
          Insert sample
        </button>
      )}
    </div>,
    document.body,
  )
}
