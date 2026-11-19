// Self-registration + the "Flowchart" slash entry.
//
// This replaced the old React-Flow-based flowchart block: the slash item is
// still called "Flowchart" (that's what a teacher is looking for), but it now
// inserts a MermaidNode — text-based diagrams (flowchart, sequence, class,
// Gantt, mind map…) picked via template chips, defaulting to a flowchart.
// The AI pipeline builds the same node (see aiStreamBuilder's 'flowchart' case).
import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { MermaidNode, $createMermaidNode } from './MermaidNode'

registerNode(MermaidNode)

registerBlock({
  key: 'flowchart',
  label: 'Flowchart',
  icon: '🔀',
  description: 'Flowchart, sequence, class, Gantt, mind map… drawn from text.',
  category: 'stem',
  status: 'available',
  keywords: ['flowchart', 'flow', 'diagram', 'process', 'algorithm', 'decision', 'steps', 'mermaid', 'sequence', 'uml', 'gantt', 'mindmap'],
  insert: editor => insertDecoratorNode(editor, () => $createMermaidNode()),
  inSlash: true,
  inSidebar: true,
})

export { MermaidNode, $createMermaidNode, $isMermaidNode } from './MermaidNode'
export type { SerializedMermaidNode } from './MermaidNode'
