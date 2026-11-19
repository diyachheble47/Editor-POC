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
import './nodes/columns'
import './nodes/matrix'
import './nodes/graph'
import './nodes/geometry'
import './nodes/molecule'
import './nodes/image'
import './nodes/media'
import './nodes/mermaid'
import './nodes/spreadsheet'
import './nodes/circuit'
import './nodes/chart'
import './nodes/datatable'
import './nodes/section'
import './nodes/toc'
import './nodes/tabs'
import './nodes/quiz'
import './nodes/html'

// Future nodes (uncomment when implemented):
// import './nodes/chemistry'
// import './nodes/diagram'
// import './nodes/quiz'
import './nodes/html'
// import './nodes/ai-content'
