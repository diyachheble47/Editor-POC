// Starter diagrams for the picker chips: one click and the teacher edits from
// a working example instead of a blank box.
export const MERMAID_TEMPLATES: { label: string; code: string }[] = [
  { label: 'Flowchart', code: 'flowchart TD\n  A[Start] --> B{Is it raining?}\n  B -- Yes --> C[Take umbrella]\n  B -- No --> D[Go outside]\n  C --> E[Done]\n  D --> E' },
  { label: 'Sequence', code: 'sequenceDiagram\n  Student->>Teacher: Asks a question\n  Teacher-->>Student: Explains the answer\n  Student->>Teacher: Thanks!' },
  { label: 'Class', code: 'classDiagram\n  class Animal {\n    +String name\n    +eat()\n  }\n  class Dog {\n    +bark()\n  }\n  Animal <|-- Dog' },
  { label: 'State', code: 'stateDiagram-v2\n  [*] --> Solid\n  Solid --> Liquid: heat\n  Liquid --> Gas: heat\n  Gas --> Liquid: cool\n  Liquid --> Solid: cool' },
  { label: 'ER', code: 'erDiagram\n  TEACHER ||--o{ CLASS : teaches\n  CLASS ||--|{ STUDENT : has' },
  { label: 'Gantt', code: 'gantt\n  title Study plan\n  dateFormat YYYY-MM-DD\n  section Unit 1\n  Read chapter :a1, 2025-01-01, 3d\n  Practice     :after a1, 4d' },
  { label: 'Pie', code: 'pie title Time spent\n  "Reading" : 40\n  "Practice" : 45\n  "Revision" : 15' },
  { label: 'Mind map', code: 'mindmap\n  root((Water cycle))\n    Evaporation\n    Condensation\n    Precipitation\n    Collection' },
]
