## Update — Teacher Notebook Editor POC

Sharing what I've been working on in this POC, with some context:

**Research phase:**
I started by exploring some existing platforms — like Stampad and Notion's notebook-style editor — to see how they handle a block-based writing experience and AI integration. After discussing with Yogesh sir and KP sir, we decided what functionality was needed for our POC — things like AI streaming, 3D model support, and equations — and that all of this should be easily accessible via the slash command (`/`), similar to how Notion works.

**What's implemented so far:**

- **Slash command menu** (`/`) — working, with categories (Basic, Media, STEM, Education, AI). Each category shows both available and "coming soon" blocks, so the roadmap stays visible too.
- **Basic blocks** (working) — Text, Heading 1/2/3, Bullet List, Numbered List, Quote, Code, Divider.
- **STEM blocks** (working) — Chemical Equation and 3D Molecule viewer can be inserted directly via the slash command.
- **AI layer** — an `AIService` interface has been built with streaming support (`stream()` method). Right now `MockAIService` is being used for testing, which simulates commands like explain, rewrite, summarize, continue, generate-example, and generate-quiz using canned responses. The structure is ready to plug in a real AI service.
- A few more custom nodes (Callout, Excalidraw drawing, 3D Model) have been scaffolded in the code but are currently marked "coming soon" in the slash menu — their UI/logic isn't complete yet.

**Remaining work:**
- Making the block-based structure more solid — right now the editor is mostly based on Lexical's standard rich-text nodes; turning it into a fully block-based experience (Notion-style drag/reorder/nested blocks) is still pending.
- Media blocks (Image, Video, Audio, File) — currently just placeholders.
- Education blocks (Example, Question, Quiz, Flashcard) and AI-generate blocks (Generate, Explain, Summarize, etc.) — these show up in the slash menu but are "coming soon", actual functionality is pending.
- Real AI service integration (currently mocked).

Overall — the research and foundational architecture (slash command system, block registry, AI service abstraction) is done; the next step is building out the core block-based editing experience and making the remaining blocks functional.
