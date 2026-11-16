// Self-registration: importing this module wires CircuitNode into both the
// Lexical node list and the slash/block registry.

import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { CircuitNode, $createCircuitNode } from './CircuitNode'

registerNode(CircuitNode)

registerBlock({
  key: 'circuit',
  label: 'Electric Circuit',
  icon: '🔌',
  description: 'Build a circuit: batteries, resistors, capacitors, bulbs, meters and more.',
  category: 'stem',
  status: 'available',
  keywords: ['circuit', 'electric', 'electricity', 'battery', 'resistor', 'capacitor', 'inductor', 'diode', 'bulb', 'led', 'switch', 'ammeter', 'voltmeter', 'wire'],
  insert: (editor) => insertDecoratorNode(editor, () => $createCircuitNode()),
  inSlash: true,
  inSidebar: false,
})

export { CircuitNode, $createCircuitNode, $isCircuitNode } from './CircuitNode'
export type { SerializedCircuitNode, CircuitPart, CircuitWire } from './CircuitNode'
