// Starter diagrams for the picker chips: one click and the teacher edits from
// a working example instead of a blank box. These are shortcuts, not the
// whole menu — any Mermaid syntax (mermaid.js.org) can be typed directly,
// including diagram types with no chip here.
export const MERMAID_TEMPLATES: { label: string; code: string }[] = [
  { label: 'Flowchart', code: 'flowchart TD\n  A[Start] --> B{Is it raining?}\n  B -- Yes --> C[Take umbrella]\n  B -- No --> D[Go outside]\n  C --> E[Done]\n  D --> E' },
  { label: 'Sequence', code: 'sequenceDiagram\n  Student->>Teacher: Asks a question\n  Teacher-->>Student: Explains the answer\n  Student->>Teacher: Thanks!' },
  { label: 'Class', code: 'classDiagram\n  class Animal {\n    +String name\n    +eat()\n  }\n  class Dog {\n    +bark()\n  }\n  Animal <|-- Dog' },
  { label: 'State', code: 'stateDiagram-v2\n  [*] --> Solid\n  Solid --> Liquid: heat\n  Liquid --> Gas: heat\n  Gas --> Liquid: cool\n  Liquid --> Solid: cool' },
  { label: 'ER', code: 'erDiagram\n  TEACHER ||--o{ CLASS : teaches\n  CLASS ||--|{ STUDENT : has' },
  { label: 'Gantt', code: 'gantt\n  title Study plan\n  dateFormat YYYY-MM-DD\n  section Unit 1\n  Read chapter :a1, 2025-01-01, 3d\n  Practice     :after a1, 4d' },
  { label: 'Pie', code: 'pie title Time spent\n  "Reading" : 40\n  "Practice" : 45\n  "Revision" : 15' },
  { label: 'Mind map', code: 'mindmap\n  root((Water cycle))\n    Evaporation\n    Condensation\n    Precipitation\n    Collection' },
  { label: 'Timeline', code: 'timeline\n  title History of the internet\n  1969 : ARPANET\n  1989 : World Wide Web\n  1998 : Google\n  2004 : Facebook' },
  { label: 'Journey', code: "journey\n  title A student's morning\n  section Home\n    Wake up: 3: Student\n    Have breakfast: 4: Student\n  section School\n    Attend class: 5: Student\n    Take a test: 2: Student" },
  { label: 'Quadrant', code: 'quadrantChart\n  title Effort vs impact\n  x-axis Low Effort --> High Effort\n  y-axis Low Impact --> High Impact\n  Revision notes: [0.2, 0.7]\n  Group project: [0.8, 0.8]\n  Reread textbook: [0.3, 0.3]' },
  { label: 'Git graph', code: 'gitGraph\n  commit\n  branch feature\n  checkout feature\n  commit\n  checkout main\n  merge feature' },
  { label: 'Kanban', code: 'kanban\n  Todo\n    Read chapter 4\n    Collect data\n  In progress\n    Write report\n  Done\n    Submit homework' },
  { label: 'XY Chart', code: 'xychart-beta\n  title "Marks by subject"\n  x-axis [Maths, Science, English]\n  y-axis "Marks" 0 --> 100\n  bar [72, 65, 80]\n  line [72, 65, 80]' },
  { label: 'Sankey', code: 'sankey-beta\n  Revision,Mock test,20\n  Reading,Mock test,15\n  Mock test,Exam,30' },
]
