import type { Klass, LexicalNode } from 'lexical'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { CodeNode, CodeHighlightNode } from '@lexical/code-core'
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'

// Nodes that are always present — not overridable by custom registrations.
export const CORE_NODES: Klass<LexicalNode>[] = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
  HorizontalRuleNode,
]

const _registry: Klass<LexicalNode>[] = []

/**
 * Register a custom Lexical node class. Safe to call multiple times with the
 * same class — duplicate registrations are silently ignored.
 */
export function registerNode(NodeClass: Klass<LexicalNode>): void {
  if (!_registry.includes(NodeClass)) {
    _registry.push(NodeClass)
  }
}

/** Returns all currently registered custom node classes (read-only view). */
export function getRegisteredNodes(): readonly Klass<LexicalNode>[] {
  return _registry
}
