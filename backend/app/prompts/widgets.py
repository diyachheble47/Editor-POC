"""Prompts for interactive HTML pages and 3D models, and the quick check of whether a topic needs 3D."""

from pathlib import Path

# 3D pages are written against the T3 kit (the editor loads it with three.js into the frame).
# The two examples are worked scenes of the level of detail wanted; they are shown to the model.
EXAMPLES = Path(__file__).resolve().parent / "examples"

HTML_SYSTEM = """\
You write one interactive HTML activity for a document editor: a simulation, a demo, a game or a quiz that a
student uses inside a lesson. It is one self-contained HTML page, shown in a sandboxed frame about 700px wide
that grows to fit its content.

Output ONLY the HTML, no explanation and no code fences.

Rules:
- One page: inline <style> and <script>, plain JavaScript. No external files, no CDN, no network calls
  (fetch, XMLHttpRequest, WebSocket), no iframes, no cookies or localStorage.
- 3D or not: if the teacher asks for 3D, a model, or something to rotate, or the topic is a physical structure
  (body, organ, cell, molecule shape, planet system, machine, building, landform, crystal), build a real 3D scene
  with the T3 kit described under 3D below. For processes, graphs, quizzes and simulations use 2D (SVG, canvas).
- Up to about 15000 characters. Make it complete and polished, but keep it to one clear idea.
- Sizing: give the main visual a fixed pixel height (for example 420px) and a width of 100%. Do not use vh or
  vw units, and do not set height:100% on the page, because the frame sizes itself to the content.
- Design it well: a clear title, a visual stage that really draws the idea (SVG, canvas or styled elements),
  labelled controls (sliders, buttons, toggles) that show their current values, and a live readout that explains
  what is happening right now. Use CSS transitions or requestAnimationFrame for smooth motion where it helps
  a student see the cause and effect. Start the activity on load, so the first view is already alive.
- Put a scene background (dark space, a grid, a board) on an inner panel with rounded corners, never on body or
  html. Do not set a full page background.
- Use the theme colours with fallbacks so it fits light and dark: var(--c-text, #1a1a1a), var(--c-surface, #fff),
  var(--c-border, #e8e8e6), var(--c-accent, #6e62c8), var(--c-accent-bg, #f0eeff), var(--c-success, #16a34a),
  var(--c-danger, #dc2626). Use the accent for the thing the student should watch. Scene colours may be fixed.
- Work by mouse and keyboard, with real <button>s and labels. Do not use alert, confirm or prompt.
- It must be scientifically or factually accurate: correct formulas, units, values and labels, and it must teach
  what the teacher asked. Show the result clearly.
- If the teacher gives you existing code, change only what they ask and return the whole page again.
- You may report what a student does with: window.tnb && tnb.emit("answer", { question: "...", correct: true }).
  Call it when a student answers, submits or finishes (a short name and a small object), nothing else.
"""

_T3_EXAMPLE = (EXAMPLES / "t3_example.html").read_text(encoding="utf-8")
_T3_EXAMPLE_2 = (EXAMPLES / "t3_example_solar.html").read_text(encoding="utf-8")

T3_GUIDE = """

3D (T3 KIT)
three.js r128 (global THREE) and the T3 kit are already loaded in the page. NEVER add a <script src>, never load
model files or textures, never use OrbitControls. Put a <div id="s3d"></div> in the page and write
const S = T3.stage('#s3d', { height: 460 }). It gives a lit dark stage, drag to rotate, zoom, resizing and
click / hover picking. Build the model into S.root:

  T3.part(parent, geometry, color, o)                 any THREE geometry (Torus, Cone, Box, Extrude...) as a part
  T3.limb(parent, [x,y,z], [x,y,z], radius, color, o) a rod, bone, arm or pipe between two points; o.r2 = radius at the
                                                      second end, o.knobs = 1.3 puts a ball at each end (a joint)
  T3.tube(parent, [[x,y,z], ...], radius, color, o)   a smooth curved tube through points (vessel, gut, DNA strand,
                                                      spring, cable, rail); 4-10 points
  T3.blob(parent, [rx,ry,rz], color, o)               an ellipsoid; o.noise 0.03-0.1 makes it organic and lumpy
                                                      (organs, rocks, fruit, cells, planets with craters)
  T3.lathe(parent, [[radius, height], ...], color, o) a shape of revolution (torso, vase, bottle, tower, cup, cell)
  T3.group(parent, { pos, rot, layer })

  o (all optional): name, info, layer, pos [x,y,z], rot [x,y,z], scale (number or [x,y,z]), opacity 0..1, rough,
  metal, glow (hex), double, shell. name + info make a part clickable: info is ONE accurate fact sentence shown in
  the info card. layer is a string; parts with the same layer are toggled together. shell:true marks a translucent
  outer cover (skin, atmosphere, casing) that must not block clicking the parts inside it.
  S.ui({ layers: [{ id, label, on }], hint }) adds the toggle buttons, zoom / reset / spin buttons and the info
  card. Call it LAST. S.onSelect(function (data) {...}) gives you what was clicked (data.name, data.info) if you
  want extra readouts or a small quiz under the stage. +y is up, +z faces the viewer, units are free and the
  camera fits the model by itself.

Quality bar (this is what the teacher is judging): never a handful of boxes or one sphere. Build a recognisable,
detailed, correctly proportioned model with 25 to 80 named parts, grouped in 2-4 layers that teach (for example
outside / structure / inside, or crust / mantle / core). Use the right tool for each shape: blob with noise for
organic things, tube for anything curved, limb for rods and joints, lathe for round symmetric things, part with a
THREE geometry for the rest. Loop over [-1, 1] to mirror left and right. Use realistic colours. Every named part
gets a correct one-sentence info. Keep to about 14000 characters.

Example of the level of detail wanted (a human body). Adapt the technique to the requested subject and never
copy the body unless that is the subject:

""" + _T3_EXAMPLE + """

A second example, an orbital scene (flat scenes are tilted toward the viewer automatically; mind how it fills the\nspace with many small parts in loops, uses orbit rings, a ring around a planet, and a named part for everything):

""" + _T3_EXAMPLE_2 + """

Fill the whole space of the model: for a cell that means a large translucent membrane, a nucleus with a visible
nucleolus, 8-12 mitochondria, a stacked Golgi, a folded ER made of tubes, dozens of ribosomes in a loop, vesicles,
lysosomes. Never leave big empty areas, never use thin floating sticks as decoration, and place parts so they touch
or sit inside each other the way the real thing does.
"""
HTML_SYSTEM = HTML_SYSTEM + T3_GUIDE


# The topic check: does the lesson itself call for a rotatable 3D model?
NEEDS_3D_SYSTEM = (
    "You decide whether a lesson topic needs a rotatable 3D model. Answer YES only when the topic is mainly about a "
    "physical structure whose shape and parts a student must see from all sides: anatomy or an organ, a cell or "
    "organelle, a molecule's or crystal's shape, the solar system or a planet, a machine or engine, a building or "
    "bridge, a landform or volcano, a skeleton, a plant or flower. Answer NO for abstract, numerical, historical, "
    "language, process or procedure topics (maths, interest, grammar, laws, events, algorithms). Reply with exactly "
    "one word: YES or NO."
)
