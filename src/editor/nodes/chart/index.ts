// Self-registration: wires ChartNode into the node list and the slash menu.
import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { ChartNode, $createChartNode } from './ChartNode'

registerNode(ChartNode)

registerBlock({
  key: 'chart',
  label: 'Chart',
  icon: '📊',
  description: 'Bar, line or pie chart from a small data table.',
  category: 'stem',
  status: 'available',
  keywords: ['chart', 'bar', 'line', 'pie', 'statistics', 'data', 'plot'],
  insert: (editor) => insertDecoratorNode(editor, () => $createChartNode()),
  inSlash: true,
  inSidebar: true,
})

export { ChartNode, $createChartNode, $isChartNode } from './ChartNode'
export type { ChartData, ChartType, ChartSeries } from './ChartNode'
