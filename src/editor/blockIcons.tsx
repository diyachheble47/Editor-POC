// Icons for the slash menu, from lucide-react: one per block, all drawn the same way.
// A block with no icon here gets a plain square.

import type { ComponentType } from 'react'
import {
  Atom, Box, CalendarClock, ClipboardCheck, FileUp, GraduationCap, MonitorPlay, NotebookPen, Shapes, Brackets, ChartLine, CircuitBoard, Code, CodeXml, Columns2, Columns3,
  FileCode, File as FileIcon, FlaskConical, Folders, Heading1, Heading2, Heading3, Image as ImageIcon, Info, List,
  ListOrdered, Minus, Network, PanelTop, PenLine, Pilcrow, Quote, Sheet, Sigma, Sparkles, Square, Table,
  TableOfContents, Video, Volume2, Workflow,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'

type Icon = ComponentType<LucideProps>

/** How a block's icon is drawn: `solid` fills the shape (the "i" or "?" is then cut out of it), `badge` is text like H1. */
interface Look { icon?: Icon; solid?: string; badge?: string; size?: number }

const MUTED = 'var(--c-text-2)'
const PURPLE = 'var(--c-accent)'

const LOOKS: Record<string, Look> = {
  paragraph: { icon: Pilcrow },
  'heading-1': { badge: 'H1' },
  'heading-2': { badge: 'H2' },
  'heading-3': { badge: 'H3' },
  'bullet-list': { icon: List },
  'numbered-list': { icon: ListOrdered },
  quote: { icon: Quote },
  callout: { icon: Info, solid: MUTED },
  code: { icon: Code },
  divider: { icon: Minus },
  file: { icon: FileIcon },
  image: { icon: ImageIcon },
  video: { icon: Video },
  audio: { icon: Volume2 },
  youtube: { icon: MonitorPlay },
  embed: { icon: CodeXml },
  html: { icon: FileCode },
  equation: { icon: FlaskConical },
  math: { icon: Sigma },
  molecule: { icon: Atom },
  circuit: { icon: CircuitBoard },
  graph: { icon: ChartLine },
  geometry: { icon: Shapes },
  excalidraw: { icon: PenLine },
  diagram: { icon: Network },
  flowchart: { icon: Workflow },
  'model-3d': { icon: Box },
  matrix: { icon: Brackets },
  datatable: { icon: Table },
  spreadsheet: { icon: Sheet },
  section: { icon: PanelTop },
  tabs: { icon: Folders },
  'columns-2': { icon: Columns2 },
  'columns-3': { icon: Columns3 },
  quiz: { icon: ClipboardCheck },
  toc: { icon: TableOfContents },
  agent: { icon: Sparkles, solid: PURPLE, size: 18 },
  'ai-generate': { icon: Sparkles, solid: PURPLE, size: 18 },
  // /agent: the three documents, and the same ones written from a file
  workbook: { icon: NotebookPen },
  lesson: { icon: GraduationCap },
  lesson_plan: { icon: CalendarClock },
  from_file: { icon: FileUp },
}

/** Which icon a /generate or /agent list row uses, from its label. */
const ROW_KEYS: Record<string, string> = {
  drawing: 'excalidraw', table: 'datatable', spreadsheet: 'spreadsheet', quiz: 'quiz', 'html activity': 'html',
  'chemical equation': 'equation', 'math formula': 'math', graph: 'graph', geometry: 'geometry', molecule: 'molecule',
  circuit: 'circuit', matrix: 'matrix', flowchart: 'flowchart', chart: 'graph',
  workbook: 'workbook', 'lesson builder': 'lesson', 'lesson plan': 'lesson_plan',
}
export const rowIconKey = (label: string, fromFile = false) => (fromFile ? 'from_file' : ROW_KEYS[label.toLowerCase()] ?? 'paragraph')

/** The icon for a block in the slash menu. */
export function BlockIcon({ blockKey, size = 16 }: { blockKey: string; size?: number }) {
  const look = LOOKS[blockKey] ?? { icon: Square }
  if (look.badge) return <span className="slash-badge" aria-hidden="true">{look.badge}</span>
  const Glyph = look.icon ?? Square
  size = look.size ?? size
  if (look.solid) {
    // Filled with colour; the strokes (the "i", the "?", the play arrow) are drawn in the menu's own colour.
    return <Glyph size={size} strokeWidth={1.9} fill={look.solid} stroke="var(--c-surface)" color={look.solid} aria-hidden="true" />
  }
  return <Glyph size={size} strokeWidth={1.8} aria-hidden="true" />
}
