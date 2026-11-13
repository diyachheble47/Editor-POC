// Self-registration: importing this module wires MoleculeNode into both
// the Lexical node list and the slash/block registry.

import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { MoleculeNode, $createMoleculeNode } from './MoleculeNode'

registerNode(MoleculeNode)

registerBlock({
  key: 'molecule',
  label: 'Molecule',
  icon: '⬡',
  description: 'Skeletal organic chemistry structures — atoms, bonds, benzene rings.',
  category: 'chemistry',
  status: 'available',
  keywords: ['molecule', 'organic', 'chemistry', 'benzene', 'skeletal', 'atom', 'bond', 'carbon'],
  insert: (editor) => insertDecoratorNode(editor, () => $createMoleculeNode()),
  inSlash: true,
  inSidebar: true,
})

export { MoleculeNode, $createMoleculeNode, $isMoleculeNode } from './MoleculeNode'
export type { SerializedMoleculeNode, Atom, Bond } from './MoleculeNode'
