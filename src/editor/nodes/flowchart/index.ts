// Self-registration: wires FlowchartNode into the node list and the slash menu.
import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { FlowchartNode, $createFlowchartNode } from './FlowchartNode'

registerNode(FlowchartNode)

registerBlock({
  key: 'flowchart',
  label: 'Flowchart',
  icon: '🔀',
  description: 'Steps, decisions and arrows for a process or algorithm.',
  category: 'stem',
  status: 'available',
  keywords: ['flowchart', 'flow', 'diagram', 'process', 'algorithm', 'decision', 'steps'],
  insert: (editor) => insertDecoratorNode(editor, () => $createFlowchartNode()),
  inSlash: true,
  inSidebar: true,
})

export { FlowchartNode, $createFlowchartNode, $isFlowchartNode, buildFlowchart } from './FlowchartNode'
export type { FlowStep, FlowArrow, FlowKind } from './FlowchartNode'
