#!/usr/bin/env python
"""Generate a Chen-notation ER diagram as a native draw.io (.drawio) file.

Chen notation = entities (rectangles), relationships (diamonds), attributes
(ellipses, primary key underlined), 1/N cardinality on the connecting lines.
Only the *major* attributes of each entity are shown to keep it readable.

Output: docs/srs-diagrams/er-data-model.drawio
Open it in https://app.diagrams.net (draw.io) to edit / re-export as PNG.

Run:  python docs/srs-diagrams/make_drawio_er.py
"""
from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent / "er-data-model.drawio"

# ---- sizes -----------------------------------------------------------------
EW, EH = 150, 58     # entity rectangle
DW, DH = 122, 66     # relationship diamond
AW, AH = 104, 46     # attribute ellipse

# ---- styles ----------------------------------------------------------------
S_ENTITY = ("rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;"
            "strokeColor=#2b6cb0;fontStyle=1;fontSize=13;fontColor=#1a365d;")
S_REL = ("rhombus;whiteSpace=wrap;html=1;fillColor=#ffe6a7;"
         "strokeColor=#b7791f;fontSize=12;fontColor=#744210;")
S_ATTR = ("ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;"
          "strokeColor=#666666;fontSize=11;fontColor=#333333;")
S_EDGE_ATTR = ("endArrow=none;html=1;strokeColor=#888888;strokeWidth=1;"
               "edgeStyle=none;rounded=0;")
S_EDGE_REL = ("endArrow=none;html=1;strokeColor=#333333;strokeWidth=1.4;"
              "edgeStyle=none;rounded=0;fontSize=12;fontStyle=1;"
              "fontColor=#111111;labelBackgroundColor=#ffffff;")

# ---- entities: name -> (center x, center y) --------------------------------
ENT = {
    "ProjectMember":     (400, 180),
    "User":              (400, 470),
    "ProjectInvitation": (400, 760),
    "Project":           (840, 470),
    "ApiSpecification":  (1280, 160),
    "Endpoint":          (1280, 470),
    "TestSuite":         (1280, 780),
    "TestCase":          (1760, 320),
    "RequestLog":        (1760, 640),
}

# ---- attributes: entity -> (direction, [labels], pk_index) -----------------
# first label of each list is the primary key (underlined)
ATTR = {
    "User":              ("left",  ["id", "username", "email"]),
    "Project":           ("up",    ["id", "name", "description"]),
    "ProjectMember":     ("left",  ["id", "role", "joinedAt"]),
    "ProjectInvitation": ("left",  ["id", "email", "role", "status"]),
    "ApiSpecification":  ("up",    ["id", "fileName", "generatedByAI"]),
    "Endpoint":          ("up",    ["id", "path", "method"]),
    "TestSuite":         ("down",  ["id", "name", "status", "targetUrl"]),
    "TestCase":          ("right", ["id", "statusCode", "passed"]),
    "RequestLog":        ("right", ["id", "seq", "statusCode"]),
}

# ---- relationships: (label, diamond x, y, entityA, cardA, entityB, cardB) --
REL = [
    ("owns",      620, 470, "User", "1", "Project", "N"),
    ("has",       620, 325, "Project", "1", "ProjectMember", "N"),
    ("is",        400, 325, "ProjectMember", "N", "User", "1"),
    ("has",       620, 615, "Project", "1", "ProjectInvitation", "N"),
    ("sends",     400, 615, "User", "1", "ProjectInvitation", "N"),
    ("has",      1060, 315, "Project", "1", "ApiSpecification", "1"),
    ("contains", 1060, 470, "Project", "1", "Endpoint", "N"),
    ("has",      1060, 625, "Project", "1", "TestSuite", "N"),
    ("triggers",  840, 675, "User", "1", "TestSuite", "N"),
    ("produces", 1560, 540, "TestSuite", "1", "TestCase", "N"),
    ("captures", 1520, 715, "TestSuite", "1", "RequestLog", "N"),
    ("tested by",1520, 395, "Endpoint", "1", "TestCase", "N"),
    ("maps",     1480, 565, "Endpoint", "1", "RequestLog", "N"),
]


def fan(cx, cy, direction, n):
    """Return n (x, y) centres fanned out from an entity in one direction."""
    if direction in ("left", "right"):
        gap = 66
        y0 = cy - (n - 1) * gap / 2
        x = cx - 220 if direction == "left" else cx + 220
        return [(x, y0 + i * gap) for i in range(n)]
    gap = 150
    x0 = cx - (n - 1) * gap / 2
    y = cy - 150 if direction == "up" else cy + 150
    return [(x0 + i * gap, y) for i in range(n)]


def main():
    cells: list[str] = []
    ids: dict[str, str] = {}

    def vertex(cid, label, style, cx, cy, w, h):
        x, y = cx - w / 2, cy - h / 2
        cells.append(
            f'<mxCell id="{cid}" value="{label}" style="{style}" vertex="1" '
            f'parent="1"><mxGeometry x="{x:.0f}" y="{y:.0f}" width="{w}" '
            f'height="{h}" as="geometry"/></mxCell>')

    def edge(cid, style, src, tgt, value=""):
        cells.append(
            f'<mxCell id="{cid}" value="{escape(value)}" style="{style}" '
            f'edge="1" parent="1" source="{src}" target="{tgt}">'
            f'<mxGeometry relative="1" as="geometry"/></mxCell>')

    # entities
    for name, (cx, cy) in ENT.items():
        cid = f"ent_{name}"
        ids[name] = cid
        vertex(cid, name, S_ENTITY, cx, cy, EW, EH)

    # attributes + their connecting lines
    for name, (direction, labels) in ATTR.items():
        cx, cy = ENT[name]
        for i, (ax, ay) in enumerate(fan(cx, cy, direction, len(labels))):
            lab = labels[i]
            disp = f"&lt;u&gt;{lab}&lt;/u&gt;" if i == 0 else lab  # PK underline
            aid = f"attr_{name}_{i}"
            vertex(aid, disp, S_ATTR, ax, ay, AW, AH)
            edge(f"ae_{name}_{i}", S_EDGE_ATTR, ids[name], aid)

    # relationships (diamond + two cardinality-labelled lines)
    for k, (lab, dx, dy, ea, ca, eb, cb) in enumerate(REL):
        did = f"rel_{k}"
        vertex(did, lab, S_REL, dx, dy, DW, DH)
        edge(f"re_{k}_a", S_EDGE_REL, ids[ea], did, ca)
        edge(f"re_{k}_b", S_EDGE_REL, did, ids[eb], cb)

    body = "\n        ".join(cells)
    xml = f'''<mxfile host="app.diagrams.net" type="device">
  <diagram id="er-autoresttest" name="ER Diagram (Chen)">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" \
tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" \
pageWidth="2200" pageHeight="1100" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        {body}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
'''
    OUT.write_text(xml, encoding="utf-8")
    n_attr = sum(len(v[1]) for v in ATTR.values())
    print(f"wrote {OUT}")
    print(f"  {len(ENT)} entities, {len(REL)} relationships, {n_attr} attributes")


if __name__ == "__main__":
    main()
