// A header bar on every code block: a language dropdown on the left and a Copy
// button on the right (plus "Insert sample" while the block is still empty, so
// "/code" doesn't leave the user staring at a blank box).
//
// The bars are drawn in an overlay on top of the code blocks' own top padding,
// not inside the editor's content, so they never become part of the document.
// Their positions are re-measured whenever the editor changes or resizes.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, $createTextNode, $createLineBreakNode, $nodesOfType } from 'lexical'
import { $isCodeNode, CodeNode } from '@lexical/code-core'

interface Header {
  key: string
  top: number
  left: number
  width: number
  language: string
  empty: boolean
}

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
  const hostRef = useRef<HTMLDivElement>(null)
  const [headers, setHeaders] = useState<Header[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Measures every code block against the overlay's parent (.editor-shell).
  const measure = useCallback(() => {
    const shell = hostRef.current?.parentElement
    if (!shell) return
    const shellRect = shell.getBoundingClientRect()
    const next: Header[] = []
    editor.getEditorState().read(() => {
      for (const node of $nodesOfType(CodeNode)) {
        const dom = editor.getElementByKey(node.getKey())
        if (!dom) continue
        const rect = dom.getBoundingClientRect()
        next.push({
          key: node.getKey(),
          top: Math.round(rect.top - shellRect.top),
          left: Math.round(rect.left - shellRect.left),
          width: Math.round(rect.width),
          language: node.getLanguage() || 'javascript',
          empty: node.getTextContent().length === 0,
        })
      }
    })
    setHeaders(prev => {
      const same =
        prev.length === next.length &&
        prev.every((h, i) => {
          const n = next[i]
          return h.key === n.key && h.top === n.top && h.left === n.left && h.width === n.width &&
            h.language === n.language && h.empty === n.empty
        })
      return same ? prev : next
    })
  }, [editor])

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    schedule()
    const unregister = editor.registerUpdateListener(schedule)
    window.addEventListener('resize', schedule)
    const shell = hostRef.current?.parentElement
    const observer = shell ? new ResizeObserver(schedule) : null
    if (shell) observer?.observe(shell)
    return () => {
      cancelAnimationFrame(frame)
      unregister()
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
  }, [editor, measure])

  const setLanguage = (key: string, language: string) => {
    editor.update(() => {
      const node = $getNodeByKey(key)
      if ($isCodeNode(node)) node.setLanguage(language)
    })
  }

  const insertSample = (key: string, language: string) => {
    editor.update(() => {
      const node = $getNodeByKey(key)
      if (!$isCodeNode(node)) return
      node.setLanguage(language)
      node.splice(0, node.getChildrenSize(), [])
      ;(SAMPLES[language] ?? '').split('\n').forEach((line, i) => {
        if (i > 0) node.append($createLineBreakNode())
        if (line.length) node.append($createTextNode(line))
      })
      node.selectEnd()
    })
  }

  const copy = (key: string) => {
    const text = editor.getEditorState().read(() => $getNodeByKey(key)?.getTextContent() ?? '')
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopiedKey(key)
        setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500)
      },
      () => { /* clipboard blocked: nothing to do */ },
    )
  }

  return (
    <div className="code-headers" ref={hostRef} contentEditable={false}>
      {headers.map(h => (
        <div key={h.key} className="code-header" style={{ top: h.top, left: h.left, width: h.width }}>
          <select
            className="code-header-lang"
            value={LANGUAGES.some(([v]) => v === h.language) ? h.language : 'javascript'}
            onChange={e => setLanguage(h.key, e.target.value)}
            aria-label="Code language"
          >
            {LANGUAGES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <span className="code-header-actions">
            {h.empty && (
              <button
                type="button"
                className="code-header-btn"
                onMouseDown={e => e.preventDefault()}
                onClick={() => insertSample(h.key, h.language)}
              >
                Insert sample
              </button>
            )}
            <button
              type="button"
              className="code-header-btn"
              onMouseDown={e => e.preventDefault()}
              onClick={() => copy(h.key)}
              aria-label="Copy code"
              title="Copy code"
            >
              {copiedKey === h.key ? 'Copied' : 'Copy'}
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
