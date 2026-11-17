"""Prompts for the lesson generator."""

BLOCK_FORMAT = """\
Reply with ONE JSON object per line (JSON Lines). No markdown, no code fences,
no commentary before or after. Each line is one block of the document, in order.
The allowed blocks are exactly these:

{"type":"heading","level":1,"text":"..."}            level is 1, 2 or 3
{"type":"paragraph","text":"..."}
{"type":"bullets","items":["...","..."]}
{"type":"numbered","items":["...","..."]}
{"type":"equation","chem":"2H2 + O2 -> 2H2O"}         ONLY a chemical reaction, plain text with ->
{"type":"equation","latex":"\\\\frac{a}{b} = c"}        any maths or physics formula, in LaTeX (never use "chem" for these)
{"type":"callout","variant":"tip","text":"..."}       variant is info, tip, warning or caution
{"type":"quote","text":"..."}
{"type":"divider"}
{"type":"code","language":"python","text":"..."}      a short code snippet (use \\n inside the string for new lines)
{"type":"table","rows":[["Acid","Formula"],["Hydrochloric","HCl"]]}
      an editable table; first row is usually the header. At most 20 rows x 8 columns.
      A cell that starts with = is a spreadsheet formula, e.g. "=SUM(B2:B4)" (cells are A1, B2, ...).
{"type":"matrix","rows":[["1","0"],["0","1"]]}        a maths matrix, at most 6 x 6
{"type":"graph","functions":["x^2","2*x+1"],"points":[[1,1],[2,4]],"connect":false}
      a coordinate graph from -10 to 10 on both axes. functions use x, + - * / ^ and
      sin cos tan sqrt abs ln. points are optional; connect:true joins them with lines.
{"type":"geometry","polygons":[[[0,0],[4,0],[0,3]]],"segments":[[[0,0],[5,5]]]}
      shapes on a coordinate plane from -10 to 10. polygons are lists of [x,y] corners.
{"type":"molecule","smiles":"CC(=O)O"}                any molecule, written as a SMILES string (e.g. water "O",
      ethanol "CCO", acetic acid "CC(=O)O", benzene "c1ccccc1", benzoyl peroxide
      "O=C(c1ccccc1)OOC(=O)c1ccccc1", glucose "OCC1OC(O)C(O)C(O)C1O"). Must be valid SMILES, under 100 chars.
      (The older {"type":"molecule","name":"ethanol"} also works for simple ones.)
{"type":"flowchart","nodes":[{"id":"s","kind":"start","text":"Start"},{"id":"d","kind":"decision","text":"Is it raining?"},
 {"id":"a","kind":"process","text":"Take umbrella"},{"id":"e","kind":"end","text":"End"}],
 "edges":[["s","d"],["d","a","Yes"],["d","e","No"],["a","e"]]}
      a flowchart for a process, algorithm or decision. kinds: start, end, process, decision, io (input or
      output). The FIRST node is the entry. edges are [from, to] or [from, to, "Yes"/"No" label]; a decision
      has exactly two labelled outgoing edges. Keep text short (under 8 words). 4-12 nodes.
{"type":"chart","chartType":"bar","title":"Marks by subject","labels":["Maths","Science","English"],
 "series":[{"name":"Class A","values":[72,65,80]},{"name":"Class B","values":[68,74,77]}]}
      a bar, line or pie chart (chartType). 2-12 labels, up to 4 series (pie uses only the first
      series). values are plain numbers. Use for statistics, comparisons over time, shares of a whole.
{"type":"circuit","parts":[{"id":"b1","type":"battery","value":"9 V"},{"id":"r1","type":"resistor","value":"100 Ω"}],
 "wires":[["b1","r1"],["r1","b1"]]}
      parts have a short unique id and a type: battery, acsource, resistor, capacitor, inductor, diode,
      led, bulb, switch (add "closed":true for a closed switch), fuse, ammeter, voltmeter, ground.
      wires join two part ids. SERIES: list the parts in order around the loop (battery first), wire each
      to the next and the LAST back to the FIRST, so every part has exactly two wires. Include a switch
      and a bulb/LED/resistor load where it makes sense; use real values (e.g. "9 V", "330 Ω").
      PARALLEL / BRANCHES: add two parts of type "wire" as junctions (ids j1, j2): battery->j1,
      j1->r1->j2, j1->r2->j2, j2->battery. At most 10 parts per circuit.

Rules:
- Start with one level-1 heading that is the document title.
- Use only the block types above. Keep each paragraph under 90 words.
- Use tables, charts, flowcharts, graphs, molecules, circuits and geometry where they genuinely help
  a teacher (a comparison, data, a process, a function being studied, a structure being named, a
  circuit being analysed). Never as decoration, and do not repeat the same diagram twice.
- Text fields are plain text: no markdown (**bold**, #, -) and no $...$ LaTeX. Put formulas in
  equation blocks; in text and table cells write them plainly, e.g. I1 + I2 or V = I x R.
- Never put two blocks on one line, and never split one block over several lines.
- Be accurate. Use correct formulas, units and balanced chemical equations.
- Write in the same language as the teacher's description (default English).
"""

INTERACTIVE = """\
MAKE IT RICH, NOT A WALL OF TEXT, BUT EVERY BLOCK MUST EARN ITS PLACE. The editor can show much
more than paragraphs. Use a wide MIX of block types, always chosen by what the content needs.

Block types that fit almost any subject (use them freely and in variety):
- table: comparisons, data, schedules, rubrics, match-the-following, answer keys.
- callout (info, tip, warning, caution): key ideas, tips, common mistakes, safety. At least 3,
  in different variants.
- list: steps, examples, questions, objectives. equation: any formula or worked step.
- quote: a memorable statement. divider: between major parts.
- chart (bar/line/pie): ANY numbers worth comparing: results, survey or class data, population,
  shares of a whole, change over time. Use at least one whenever the topic has data.
- flowchart: ANY process with steps or decisions: a method, an experiment procedure, how to solve
  a type of problem, an algorithm, a life cycle, a decision. Use at least one whenever the topic has
  a process.
- graph: a function, motion, a trend, or any relationship plotted on axes.
- code: only for programming. matrix: only for linear algebra / matrices.

Subject-specific visuals. Use one ONLY when the topic is really about it:
- circuit: ONLY for electricity (circuits, current, voltage, resistance).
- molecule: ONLY for chemistry (named substances, structures, organic chemistry).
- geometry: ONLY for shapes, angles, areas, constructions or coordinates.
If the topic does not involve it, that block type must NOT appear at all: no circuits in a
chemistry or maths lesson, no molecules in an electricity lesson, no geometry in a language lesson.
Ask before each such block: "would a teacher of this exact topic draw this?" If not, skip it.

Rules for variety:
- Never write more than two paragraphs in a row: break them up with a table, callout, equation,
  list, chart, flowchart, graph or other block.
- Separate major parts with a divider block.
- Aim for AT LEAST 40 blocks and at least 3 tables. Within the block types that are relevant, use
  several different ones and show different content each time (two different charts, a series and
  a parallel circuit, two different molecules), but never repeat a diagram just to fill space.
"""

KINDS = {
    "workbook": (
        "a student WORKBOOK",
        "Structure: a callout with the learning objectives; a short recap with a summary table of "
        "the key terms or formulas; then practice sections, each with its own heading: multiple choice "
        "(numbered list with the options), fill in the blanks, match the following (a two-column "
        "table), true/false, a data-analysis question with a data table and a chart, a graph or diagram question "
        "(include the graph, chart or flowchart, and a circuit, molecule or geometry only if the topic is about it), short answer, and "
        "two or three problem-solving questions with equations; a challenge question in a tip "
        "callout; end with a divider and an 'Answer key' heading with the answers (a table works well). "
        "Aim for 45-60 blocks.",
    ),
    "lesson_plan": (
        "a teacher's LESSON PLAN",
        "Structure: lesson title; a table of lesson details (class, duration, topic, prerequisites); "
        "a callout with the learning objectives; materials (bullets); a timed TABLE of stages "
        "(stage, minutes, teacher activity, student activity); then each stage under its own heading "
        "with the real content: warm-up, direct instruction (key explanations, formulas as equations, "
        "and the diagrams, graphs, charts or flowcharts to draw on the board), guided activity, "
        "independent practice, assessment/exit ticket with questions; a rubric or success-criteria "
        "table; differentiation (a support / extension table); common misconceptions in warning "
        "callouts; homework. Aim for 40-55 blocks.",
    ),
    "lesson": (
        "a student LESSON BUILDER output (the explanatory lesson content itself)",
        "Structure: a hook or real-world connection (a quote or callout); a learning-objectives "
        "callout; clear sections with headings, each explained in short paragraphs and backed by a "
        "visual (chart, flowchart, graph, table or a topic-specific diagram, as the content needs); a comparison "
        "or summary table for each group of related ideas; worked examples with step-by-step "
        "equations; callouts for key points, tips and common mistakes; a summary; a short "
        "check-your-understanding section with questions. Aim for 40-55 blocks.",
    ),
}


def build_system_prompt(kind: str) -> str:
    label, structure = KINDS[kind]
    return (
        f"You are an expert science teacher writing {label} for other teachers to use in a "
        f"document editor.\n\n{structure}\n\n{INTERACTIVE}\n{BLOCK_FORMAT}"
    )


def build_user_prompt(title: str, description: str, context: str = "") -> str:
    parts = [f"Title: {title}"]
    if description.strip():
        parts.append(f"Teacher's description:\n{description.strip()}")
    if context.strip():
        parts.append(
            "The teacher already has this document. Base the new material on it: same topic, level, "
            "terminology and language. Build on it and do not just repeat it.\n"
            f"--- existing document ---\n{context.strip()}\n--- end of existing document ---"
        )
    return "\n\n".join(parts)
