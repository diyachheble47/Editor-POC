Yes. Since you want to build this with **Lexical** and you specifically want Claude to build it **step-by-step without losing the original scope**, I would not give Claude one giant “build everything” prompt.

We should give it a **master context prompt first**, then a sequence of implementation prompts. Each prompt should explicitly tell Claude what is in scope, what is not, what must not be reimplemented unnecessarily, and what architectural decisions must remain stable.

I’d structure the project around this target:

```text
Teacher Notebook / Document Editor
│
├── Left
│   ├── Document history
│   ├── Outline / sections
│   └── Versions
│
├── Center
│   └── Lexical block-based editor
│       ├── Text
│       ├── Headings
│       ├── Lists
│       ├── Callouts
│       ├── Images
│       ├── Video
│       ├── Files
│       ├── Code
│       ├── Math
│       ├── Chemistry
│       ├── 3D Model
│       ├── Diagram
│       ├── Quiz
│       └── AI-generated blocks
│
└── Right
    ├── AI
    ├── Insert
    ├── STEM tools
    ├── Block properties
    └── Contextual actions
```

And the long-term experience is:

```text
Teacher
   ↓
Creates topic
   ↓
Writes / types /
   ↓
Slash menu
   ↓
Insert block
   ↓
AI can generate/modify content
   ↓
Content streams into editor
   ↓
Math / Chemistry / 3D / Media
   ↓
Save + version + history
   ↓
Eventually presentation/viewer integration
```

## Prompt 0 — Give Claude the permanent project context first

Paste this **before anything else** in the Claude project/chat.

```text
You are helping me build a production-quality teacher-focused document editor from scratch.

IMPORTANT: This project has a long-term scope. Do not optimize only for the immediate task. Every implementation decision must preserve the architecture needed for the complete product described below.

==================================================
PRODUCT VISION
==================================================

We are building a modern teacher-first digital notebook / document authoring environment.

The product should feel like a combination of:

- Notion
- a modern notebook
- a STEM authoring tool
- an AI-assisted document editor
- eventually a presentation/content creation system

The primary user is a teacher.

The teacher should be able to create structured educational content in a beautiful, notebook-like workspace.

The editor must be block-based.

Every meaningful piece of content should be represented as a structured block/node rather than treating the entire document as one HTML blob.

==================================================
CORE UX
==================================================

The UI should have three major areas:

1. LEFT SIDEBAR
   - document history
   - document/page navigation
   - outline
   - sections
   - versions
   - recently edited content

2. CENTER EDITOR
   - main Lexical-based editor
   - clean notebook-like visual experience
   - large readable content area
   - block-based editing
   - excellent typography
   - contextual block controls
   - drag/drop where appropriate
   - slash command system

3. RIGHT SIDEBAR
   - AI tools
   - insert tools
   - STEM tools
   - block properties
   - contextual actions
   - media tools
   - selected-block configuration

The UI should feel polished, intentional and product-quality.

Do NOT create a generic developer-looking admin dashboard.

It should feel like a premium educational authoring product.

==================================================
EDITOR FOUNDATION
==================================================

Use Lexical as the core document/editor engine.

Do NOT replace Lexical with another editor framework unless I explicitly ask you to evaluate a replacement.

Lexical is responsible for:

- editor state
- node tree
- document structure
- editor updates
- selections
- commands
- history where appropriate
- serialization
- custom nodes
- plugin architecture
- rich text behavior

The surrounding application is responsible for:

- page/section navigation
- sidebars
- application state
- editor layout
- AI experience
- tool panels
- persistence orchestration
- file management
- 3D runtime
- STEM integrations
- presentation/runtime behavior

==================================================
IMPORTANT ARCHITECTURAL PRINCIPLE
==================================================

Do NOT make Lexical responsible for everything.

Separate these concerns:

A. DOCUMENT MODEL
   Lexical nodes and editor state

B. APPLICATION UI
   React components and application state

C. RUNTIME SYSTEMS
   Three.js, media playback, simulations, etc.

D. AI SYSTEM
   backend communication, streaming, generation, transformation

E. PERSISTENCE
   API/database/document versions/autosave

For example:

A 3D model block should store configuration such as:

- model URL
- position/configuration if needed
- scale
- presentation metadata
- animation configuration

But the actual Three.js scene/runtime should NOT be stored inside Lexical state.

Lexical stores the document representation.
Three.js owns the runtime visualization.

==================================================
BLOCK SYSTEM
==================================================

The architecture must support at minimum these future block categories:

CORE
- paragraph
- heading
- bullet list
- numbered list
- checklist
- quote
- callout
- divider
- code
- table

MEDIA
- image
- video
- audio
- file
- embed

STEM
- math/equation
- chemistry
- diagram
- 3D model
- simulation
- interactive content

EDUCATIONAL
- example
- question
- quiz
- flashcard
- learning objective
- key concept

AI
- AI-generated explanation
- AI-generated example
- AI-generated quiz
- AI-generated summary
- AI-generated diagram
- AI-generated equation/content

Not every block must be implemented immediately.

The architecture must make future addition of these blocks straightforward.

==================================================
SLASH COMMAND SYSTEM
==================================================

A core part of the product is the "/" command experience.

Typing "/" should expose a searchable command menu.

Example categories:

Basic
- Text
- Heading
- List
- Quote
- Callout

Media
- Image
- Video
- Audio
- File
- Embed

STEM
- Equation
- Chemistry
- Diagram
- 3D Model
- Simulation

Education
- Example
- Quiz
- Question
- Flashcard

AI
- Generate
- Explain
- Summarize
- Create Example
- Create Quiz

The system must be extensible.

Do not hardcode the slash menu in a way that makes future block/plugin registration difficult.

==================================================
AI VISION
==================================================

AI is NOT just a chatbot.

AI should work directly with the document.

Eventually the teacher should be able to:

- generate content
- continue writing
- explain selected content
- simplify selected content
- summarize
- create examples
- create questions
- create quizzes
- generate equations
- generate STEM content
- generate diagrams
- transform existing blocks
- suggest missing content

AI responses should eventually support structured output that can become editor blocks.

For example:

AI response:

1 paragraph
1 equation
1 example
1 quiz

should be insertable as multiple document blocks.

AI responses must support streaming.

Do not design the AI architecture around waiting for one giant response before updating the UI.

==================================================
STEM VISION
==================================================

This product is intended for educational/STEM use.

Teachers should eventually be able to create:

- mathematical equations
- LaTeX
- chemistry formulas
- chemical reactions
- molecular visualizations
- diagrams
- 3D models
- interactive simulations
- educational widgets

Prefer established libraries for these capabilities instead of rebuilding mature functionality from scratch.

However, do not add random dependencies without first evaluating whether they fit the architecture.

==================================================
3D VISION
==================================================

3D content will eventually use Three.js or an appropriate Three.js ecosystem library.

3D must be implemented as a custom editor block.

Lexical stores the 3D block's document representation.

Three.js owns the actual 3D runtime.

Future requirements may include:

- model loading
- camera controls
- annotations
- animations
- interactive model behavior
- recorded interactions

Do not tightly couple Lexical internals to Three.js runtime state.

==================================================
PERFORMANCE
==================================================

The editor should be designed to handle large documents.

Do not create unnecessary React re-renders.

Do not put large runtime objects into editor state.

Avoid storing:

- Three.js renderer
- Three.js scene
- WebGL contexts
- media players
- other runtime-heavy objects

inside Lexical serialized state.

Streaming, autosave and heavy runtime content should be designed carefully.

==================================================
PERSISTENCE
==================================================

The document must eventually be serializable into a stable JSON representation.

The architecture should support:

- save
- load
- autosave
- versions
- history
- recovery

Avoid using HTML as the primary source of truth.

The structured document model should remain the source of truth.

==================================================
UI DESIGN PRINCIPLES
==================================================

UI is extremely important.

Do not create a generic CRUD interface.

Visual goals:

- premium
- clean
- modern
- notebook-like
- spacious
- teacher-friendly
- excellent typography
- subtle borders
- restrained visual hierarchy
- minimal clutter
- excellent empty states
- beautiful hover states
- polished selected states
- smooth interactions

The center editor should feel calm and focused.

The sidebars should feel useful rather than overwhelming.

Use responsive design.

Keyboard interactions should feel natural.

==================================================
ENGINEERING PRINCIPLES
==================================================

1. Prefer existing mature libraries for generic editor functionality.
2. Do not rebuild basic editor functionality unnecessarily.
3. Build custom functionality only where it creates product value.
4. Keep modules independent.
5. Avoid premature abstraction.
6. Do not create giant components.
7. Keep block implementations isolated.
8. Keep editor logic separate from UI.
9. Keep runtime systems separate from document state.
10. Keep future extension points obvious.
11. Use TypeScript.
12. Write maintainable production-quality code.
13. Do not leave TODO architecture holes that will block future features.
14. Do not silently change previously agreed architecture.
15. When a decision could significantly affect future scope, stop and explain the tradeoff before proceeding.

==================================================
SCOPE CONTROL
==================================================

This project will be built incrementally.

DO NOT attempt to implement the entire product at once.

At every step:

- implement only the requested phase
- keep future requirements in mind
- do not prematurely implement future features
- do not remove architecture needed for future features
- avoid temporary hacks that will become permanent architecture

When implementing something, explicitly identify:

1. What is being implemented now
2. What is intentionally deferred
3. What future feature this architecture needs to support

==================================================
WORKING STYLE
==================================================

Before coding a significant feature:

1. inspect the existing codebase
2. understand the current architecture
3. identify reusable pieces
4. identify impacted files
5. explain the implementation approach
6. implement
7. test/build
8. review for regressions

Do not blindly rewrite existing code.

When adding a dependency, explain why it is needed.

When there is an established library that already solves a generic problem well, prefer using it.

==================================================
VERY IMPORTANT
==================================================

Never lose the original product vision while implementing small features.

The final system is not merely a rich text editor.

It is a teacher-first, block-based, AI-assisted, STEM-capable document authoring environment built around Lexical.

Everything we build should move toward that product.

For every future task I give you, keep this entire context in mind.
```

---

# Prompt 1 — Start with architecture, NOT coding

Don't tell Claude to immediately start coding.

Give it this next:

```text
We are starting the project.

Do NOT write implementation code yet.

First, inspect the existing repository and produce an architecture proposal for the teacher notebook editor described in the project context.

I want you to analyze:

1. Current repository structure
2. Existing frontend architecture
3. Existing state management
4. Existing styling/component system
5. Current dependencies
6. Whether Lexical is already present
7. Existing reusable editor/UI components
8. Existing API/service architecture
9. Existing 3D-related code
10. Existing AI-related code

Then propose the target architecture.

The target should clearly separate:

- Lexical document/editor layer
- block/node layer
- React application UI
- left sidebar
- center editor
- right tools panel
- application state
- AI integration
- streaming layer
- persistence
- future STEM integrations
- future 3D integration

Also propose the initial folder structure.

Do not introduce unnecessary libraries.

At the end, provide:

A. Current architecture
B. Target architecture
C. Dependency recommendations
D. Folder structure
E. Risks
F. What should NOT be implemented yet
G. Phase-by-phase roadmap

Do not code until this analysis is complete.
```

---

# Prompt 2 — Build the visual shell first

This is important because you explicitly want a **great UI**.

```text
Now implement Phase 1: the visual shell of the teacher notebook.

Do NOT implement complex editor functionality yet.

Build a premium notebook-style interface with:

LEFT SIDEBAR
- document title
- outline/navigation area
- recent/history section
- version/history placeholders
- ability to visually select a section/page

CENTER
- clean document workspace
- large readable editing surface
- generous whitespace
- notebook-like typography
- subtle content boundaries
- beautiful empty state

RIGHT SIDEBAR
- AI
- Insert
- STEM
- Media
- contextual tools placeholders

TOP BAR
- document title
- save status
- undo/redo placeholders
- useful editor actions
- settings/more actions

Design requirements:

- This must NOT look like an admin dashboard.
- It must feel like a premium educational product.
- Use a restrained visual system.
- Use consistent spacing.
- Use good typography.
- Include hover, active and selected states.
- Include subtle transitions.
- Make responsive behavior intentional.

Do not implement fake functionality just for appearance.

Use reusable React components.

Before coding, inspect the existing styling system and reuse it where appropriate.

After implementation:
- run the app
- verify the layout
- verify responsive behavior
- report what was implemented
- report what remains intentionally unimplemented
```

---

# Prompt 3 — Lexical core

Then the actual editor.

```text
Implement Phase 2: the Lexical editor foundation.

Requirements:

1. Integrate Lexical cleanly into the existing application.
2. Create an EditorProvider/editor configuration architecture that can scale.
3. Add the basic editor nodes required for the first milestone:
   - paragraph
   - heading
   - bullet list
   - numbered list
   - quote
   - code
   - divider if appropriate
4. Add basic formatting.
5. Add history/undo/redo.
6. Add keyboard shortcuts where appropriate.
7. Add editor placeholder/empty state.
8. Ensure the editor is visually integrated with the notebook UI.
9. Do not turn the center editor into a generic rich-text demo.
10. Keep the block system extensible for future custom nodes.

Architecture requirement:

Create a clear separation between:

- editor configuration
- plugins
- nodes
- commands
- UI components
- application state

Do not put all Lexical logic into one component.

The final architecture must make it straightforward to add future nodes such as:

MathNode
ChemistryNode
Model3DNode
QuizNode
DiagramNode
AIContentNode

Do not implement those future nodes yet.

Test:
- create text
- format text
- create headings
- lists
- undo/redo
- reload without breaking the editor
```

---

# Prompt 4 — Block UX + slash menu

This is one of the most important prompts.

```text
Implement Phase 3: the block-based authoring experience.

The editor should now start feeling like a Notion/modern notebook-style block editor.

Implement:

1. Slash command system
2. Searchable slash menu
3. Keyboard navigation
4. Block insertion commands
5. Block selection behavior
6. Block hover controls
7. Block side/menu controls where appropriate
8. Delete block
9. Duplicate block
10. Move/reorder block
11. Keyboard-based block movement where appropriate
12. Drag-and-drop block reordering if the architecture supports it cleanly

Slash menu categories:

BASIC
- Text
- Heading
- Bullet List
- Numbered List
- Quote
- Callout

MEDIA
- Image
- Video
- Audio
- File

STEM
- Equation
- Chemistry
- Diagram
- 3D Model

EDUCATION
- Example
- Question
- Quiz
- Flashcard

AI
- Generate
- Explain
- Summarize
- Create Example
- Create Quiz

At this stage, future commands that are not implemented should be disabled or clearly marked rather than pretending to work.

Important:
Do not hardcode this system in a way that makes adding a new custom block painful.

Create an extensible command/block registry architecture.

The goal is that later we can register:

registerBlock(...)
registerSlashCommand(...)
registerTool(...)

rather than editing a giant switch statement.

Maintain the premium notebook UI.
```

---

# Prompt 5 — Custom node architecture

Now make Claude build the foundation for your future STEM stuff.

```text
Implement Phase 4: the custom block/node architecture.

We are NOT yet implementing every STEM feature.

Instead, create the architecture that allows custom Lexical nodes to be registered cleanly.

Create a scalable pattern for custom nodes.

The architecture should support:

- custom serialized properties
- import/export JSON
- rendering
- node selection
- updates
- commands
- node-specific toolbar/properties
- slash-menu registration
- future React-based decorator nodes

Create one simple example custom block to validate the architecture.

For example:
CalloutBlock or ExampleBlock.

Requirements:

1. Node implementation
2. Serialized node representation
3. React rendering
4. block insertion command
5. slash command registration
6. selection support
7. update support
8. delete/duplicate support
9. serialization/deserialization
10. tests

Then document the exact pattern we should follow for future:

MathNode
ChemistryNode
3DModelNode
DiagramNode
QuizNode
AIContentNode

Do not implement those nodes yet.

The important goal is to prove that adding a future custom block does not require modifying unrelated editor code.
```

---

# Prompt 6 — Math/equations

Now STEM starts.

```text
Implement Phase 5: mathematics/equation support.

I do NOT want a hand-built math editor if a mature library can handle rendering/input.

Evaluate appropriate existing libraries first.

Requirements:

1. Support LaTeX-based equations.
2. Support display equations.
3. Support inline equations where appropriate.
4. Create a dedicated Lexical Equation/Math block.
5. Store the equation as structured serializable data.
6. Render it using a mature math rendering library.
7. Add slash command:
   /math
   /equation
8. Add a right-sidebar contextual tool for editing the selected equation.
9. Add a clean equation editing UX.
10. Preserve undo/redo and document serialization.
11. Keep rendering and document state separated.

Do not rebuild KaTeX/MathJax functionality manually.

The block must be designed so future AI-generated equations can be inserted programmatically.

At the end, demonstrate:

Teacher types /math
→ equation block appears
→ equation is editable
→ equation renders beautifully
→ save/load preserves it
→ undo/redo works
```

---

# Prompt 7 — AI architecture BEFORE AI UI

Don't immediately give Claude an OpenAI/Claude API key and tell it to make a chatbot.

```text
Implement Phase 6: AI architecture for the document editor.

Do NOT yet build a large chatbot interface.

First design the AI integration layer.

The AI system must support:

- streaming
- cancellation
- errors
- retries
- structured output
- document-aware requests
- selection-aware requests
- future block generation
- inserting generated content into Lexical

Define a clean abstraction such as:

AIRequest
AIStream
AIResult
AIBlockResult
AICommand

The system should support future operations:

- explain selected content
- rewrite
- summarize
- continue
- generate example
- generate quiz
- generate equation
- generate STEM content

IMPORTANT:

AI must eventually be able to return structured block content, not only plain text.

Example conceptual output:

[
  {
    type: "paragraph",
    content: "..."
  },
  {
    type: "equation",
    latex: "F = ma"
  },
  {
    type: "example",
    content: "..."
  }
]

Create the frontend architecture for consuming streamed AI responses.

Use mock streaming data initially if backend integration is not ready.

Do not hardcode the AI provider into the editor core.

The editor should communicate through an AI service abstraction.
```

---

# Prompt 8 — AI UI + streaming into editor

```text
Implement Phase 7: the AI experience.

Now create the right-side AI panel.

The experience should feel integrated into the document rather than like a separate chatbot.

Support:

- Ask AI
- Explain selection
- Rewrite
- Summarize
- Continue writing
- Generate example
- Generate quiz
- Generate questions

Requirements:

1. AI panel in right sidebar.
2. Context-sensitive actions.
3. Selection-aware AI requests.
4. Streaming response UI.
5. Cancel generation.
6. Loading state.
7. Error state.
8. Retry.
9. Insert result into document.
10. Replace selected content where appropriate.
11. Generate multiple blocks from structured AI output.

The response should visually stream into the interface.

Do not wait for the entire response before rendering.

The architecture must support:

AI stream
→ streamed text / structured chunks
→ temporary AI UI state
→ accepted result
→ Lexical node insertion/update

Do not mutate the permanent document on every raw token unless there is a strong architectural reason.

Keep generated/temporary AI state separate from persisted document state until the user accepts it.

Use mock streaming if backend integration is not yet connected.
```

---

# Prompt 9 — 3D model block

This is where you connect your existing 3D work.

```text
Implement Phase 8: the 3D Model block.

The 3D model must be a custom Lexical block.

Requirements:

1. Add /3d slash command.
2. Add 3D Model under STEM tools.
3. Create Model3DNode.
4. Define serializable node properties:
   - id
   - model URL/source
   - display configuration
   - scale
   - optional animation configuration
5. Render through a React component.
6. Use Three.js for runtime rendering.
7. Keep Three.js runtime objects OUTSIDE Lexical serialized state.
8. Add loading state.
9. Add error state.
10. Add selected-block properties panel.
11. Add model replacement.
12. Add basic camera controls.
13. Preserve document serialization.
14. Ensure the editor remains performant.

Architectural requirement:

Lexical owns:
- the Model3DNode
- model metadata/configuration

Three.js owns:
- scene
- renderer
- camera
- controls
- animation runtime
- WebGL resources

Do not put Three.js objects into Lexical state.

Design this so future functionality can be added without changing the document engine:

- annotations
- animations
- interaction recording
- playback
- AI explanation of model
```

---

# Prompt 10 — Notebook intelligence

Once the editor works, improve the overall experience.

```text
Implement Phase 9: notebook/document intelligence.

Add:

1. Document title
2. Automatic outline extraction from headings
3. Left sidebar outline
4. Click heading → scroll to block
5. Active section highlighting while scrolling
6. Recent document history
7. Document metadata
8. Save status
9. Autosave architecture
10. Versioning architecture placeholder

Important:

The outline must be derived from the document structure rather than manually maintained duplicated data where possible.

The document should remain the source of truth.

Autosave must be debounced and resilient.

Do not send an API request for every editor update.

Design for future:
- versions
- collaboration
- document recovery
- audit/history
```

---

# Prompt 11 — Make the UI actually beautiful

I'd give Claude a dedicated UI pass rather than expecting it to magically become polished while implementing features.

```text
Perform a dedicated product-design/UI refinement pass on the teacher notebook editor.

Do NOT add major new functionality.

Focus entirely on making the existing experience feel like a high-quality production product.

Reference the interaction quality of:

- Notion
- modern notebook applications
- premium educational software

But DO NOT copy their branding.

Improve:

- typography
- spacing
- visual hierarchy
- sidebar design
- editor width
- block hover states
- selection states
- slash menu
- command menu
- right tool panel
- empty states
- loading states
- AI streaming state
- block insertion feedback
- tooltips
- keyboard-focused states
- transitions
- scrolling
- responsive behavior

The center editor should feel calm and distraction-free.

Avoid:
- excessive borders
- excessive colors
- giant buttons
- generic dashboard cards
- unnecessary gradients
- crowded toolbars

Use a consistent design system.

After implementation, inspect the complete UI as a user rather than as a developer and identify 10 UX issues that remain.

Then fix those issues.
```

---

# Prompt 12 — Scope protection prompt

This one is important because you're specifically worried about Claude losing scope.

Whenever you start a new phase, paste this **before the actual task**:

```text
Before implementing this task, re-read the project vision and architecture from the initial project context.

Do not optimize for this task in isolation.

Check that the implementation remains compatible with:

- Lexical as the document engine
- block-based architecture
- slash commands
- custom nodes
- AI-generated structured blocks
- streaming
- math
- chemistry
- 3D models
- future interactive STEM content
- left navigation/history
- right contextual tools
- autosave/versioning
- premium notebook UX

Do not implement unrelated future functionality.

Do not introduce architecture that makes future requirements harder.

At the beginning of your response, state:

CURRENT PHASE:
CURRENT SCOPE:
DEFERRED:
ARCHITECTURAL CONSTRAINTS:

Then implement only the requested phase.
```

---

## And I would keep a `PRODUCT_SCOPE.md` file in the repo

This is **very important** for Claude Code.

Create a file like:

```text
/docs/PRODUCT_SCOPE.md
```

with the master vision.

Then every future Claude session can be told:

```text
Before making changes, read:

docs/PRODUCT_SCOPE.md
```

This is much safer than relying on a 200-message chat history.

I would also keep:

```text
/docs/
    PRODUCT_SCOPE.md
    ARCHITECTURE.md
    BLOCKS.md
    AI_ARCHITECTURE.md
    UI_GUIDELINES.md
    ROADMAP.md
```

That becomes your project's **source of truth**.

---

## Your actual build order

I would **not** jump directly to 3D or AI.

Build in this order:

```text
1. Product architecture
        ↓
2. UI shell
        ↓
3. Lexical core
        ↓
4. Block UX
        ↓
5. Slash menu
        ↓
6. Custom node architecture
        ↓
7. Math
        ↓
8. AI architecture
        ↓
9. AI streaming + insertion
        ↓
10. 3D block
        ↓
11. Chemistry / STEM blocks
        ↓
12. Outline + history
        ↓
13. Autosave + versions
        ↓
14. Advanced interactions
        ↓
15. Presentation/runtime integration
```

That way you're building a **real product foundation**, rather than a collection of impressive demos.

And one more thing: for your use case, I'd make **the block schema and document JSON a first-class design decision before implementing lots of blocks**. That will determine whether the editor remains clean when you eventually have math + chemistry + 3D + AI + interactive content all living in one document.
