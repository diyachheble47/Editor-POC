"""Safety net for off-topic visuals.

The prompt tells the model to use a circuit, molecule or geometry block only when the
topic needs one, but a small model sometimes adds them anyway (a circuit in an acid
lesson). These three are the ones that are never useful out of context, so a block of
that type is dropped unless the topic (title, description, existing document) or the
text written so far mentions its subject. Everything else (tables, charts, flowcharts,
graphs, callouts...) fits almost any subject and is not filtered.
"""

import re

_SUBJECTS = {
    # Interactive HTML is only added when the teacher asked for something interactive.
    "html": re.compile(
        r"\b(interactive|interactivity|simulat\w*|activit(y|ies)|game\w*|drag\w*|poll\w*|slider\w*|widget\w*|"
        r"demo\w*|animat\w*|puzzle\w*|calculator\w*|explor\w*|html|hands-on|playground)\b",
        re.I,
    ),
    "circuit": re.compile(
        r"\b(electric\w*|circuit\w*|voltage|volt|volts|resistor\w*|ohm\w*|batter(y|ies)|capacitor\w*|"
        r"inductor\w*|ampere\w*|ammeter|voltmeter)\b",
        re.I,
    ),
    "molecule": re.compile(
        r"\b(chem\w*|molecul\w*|atom\w*|compound\w*|acid\w*|organic|hydrocarbon\w*|alkane\w*|alkene\w*|"
        r"alcohol\w*|benzene|ammonia|methane|ethanol|covalent|polymer\w*|periodic|biochem\w*)\b",
        re.I,
    ),
    "geometry": re.compile(
        r"\b(geometr\w*|triangle\w*|circle\w*|angle\w*|polygon\w*|quadrilateral\w*|rectangle\w*|square\w*|"
        r"perimeter|area|parallelogram\w*|trapez\w*|rhombus|congruen\w*|symmetr\w*|pythagor\w*|"
        r"mensuration|coordinate\w*|vertex|vertices|radius|diameter|circumference|polyhedr\w*|shape\w*|"
        r"trigonometr\w*|transformation\w*)\b",
        re.I,
    ),
}


def block_text(block: dict) -> str:
    """The readable text of a block, used to learn what the document is about so far."""
    parts = [block.get("text") or ""]
    for item in block.get("items") or []:
        parts.append(str(item))
    for row in block.get("rows") or []:
        parts.extend(str(cell) for cell in row)
    return " ".join(parts)


def is_relevant(block_type: str, topic_text: str) -> bool:
    pattern = _SUBJECTS.get(block_type)
    return pattern is None or bool(pattern.search(topic_text))
