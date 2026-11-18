import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { HtmlNode, $createHtmlNode } from './HtmlNode'

registerNode(HtmlNode)

registerBlock({
  key: 'html',
  label: 'Interactive HTML',
  icon: '⚡',
  description: 'Your own HTML, or AI-made: simulations, games, polls.',
  category: 'layout',
  status: 'available',
  keywords: ['html', 'interactive', 'simulation', 'game', 'poll', 'widget', 'drag', 'slider', 'code', 'activity'],
  insert: (editor) => insertDecoratorNode(editor, () => $createHtmlNode()),
  inSlash: true,
  inSidebar: true,
})

export { HtmlNode, $createHtmlNode, $isHtmlNode } from './HtmlNode'
