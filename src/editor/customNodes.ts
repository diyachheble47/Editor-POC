// Central manifest of all custom nodes.
//
// Each import line triggers that node's self-registration (registerNode +
// registerBlock). To add a new custom block to the editor, add ONE import here
// and nothing else — EditorConfig and blockRegistry do not need to change.
//
// Order matters only for block registry display; Lexical node registration
// is order-independent.

import './nodes/callout'
import './nodes/math'
import './nodes/model3d'
import './nodes/excalidraw'

// Future nodes (uncomment when implemented):
// import './nodes/chemistry'
// import './nodes/diagram'
// import './nodes/quiz'
// import './nodes/ai-content'
