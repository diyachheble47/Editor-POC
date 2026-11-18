import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { QuizNode, $createQuizNode } from './QuizNode'

registerNode(QuizNode)

registerBlock({
  key: 'quiz',
  label: 'Quiz',
  icon: '❓',
  description: 'Multiple-choice questions that show right or wrong.',
  category: 'basic',
  status: 'available',
  keywords: ['quiz', 'mcq', 'question', 'test', 'check', 'multiple choice'],
  insert: (editor) => insertDecoratorNode(editor, () => $createQuizNode()),
  inSlash: true,
  inSidebar: true,
})

export { QuizNode, $createQuizNode, $isQuizNode } from './QuizNode'
export type { QuizQuestion } from './QuizNode'
