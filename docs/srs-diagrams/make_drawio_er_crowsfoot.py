#!/usr/bin/env python
"""Generate a Crow's-Foot ER diagram as a native draw.io (.drawio) file.

Crow's-Foot notation = each entity is a compact box that lists its attributes
inside (PK / FK markers in the left column), and relationships are drawn as
lines whose end symbols carry the cardinality (bar = one, crow's foot = many).
This is the logical / database-design counterpart to the Chen diagram.

Output: docs/srs-diagrams/er-data-model-crowsfoot.drawio
Open it in https://app.diagrams.net (draw.io) to edit / re-export as PNG.

Run:  python docs/srs-diagrams/make_drawio_er_crowsfoot.py
"""
from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent / "er-data-model-crowsfoot.drawio"

# ---- geometry --------------------------------------------------------------
EW = 200          # entity width
HEADER = 30       # title-band height
ROWH = 24         # attribute-row height
KEYW = 46         # width of the PK/FK key column

# ---- styles ----------------------------------------------------------------
S_TABLE = ("shape=table;startSize=30;container=1;collapsible=0;"
           "childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;"
           "align=center;resizeLast=1;html=1;fillColor=#dae8fc;"
           "strokeColor=#2b6cb0;fontColor=#1a365d;fontSize=13;")
S_ROW = ("shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;"
         "swimlaneBody=0;strokeColor=inherit;top=0;left=0;bottom=0;right=0;"
         "collapsible=0;dropTarget=0;fillColor=none;points=[[0,0.5],[1,0.5]];"
         "portConstraint=eastwest;")
S_KEYCELL = ("shape=partialRectangle;overflow=hidden;connectable=0;"
             "fillColor=none;top=0;left=0;bottom=0;right=1;pointerEvents=1;"
             "html=1;align=center;fontSize=11;fontColor=#744210;")
S_NAMECELL = ("shape=partialRectangle;overflow=hidden;connectable=0;"
              "fillColor=none;top=0;left=0;bottom=0;right=0;pointerEvents=1;"
              "html=1;align=left;spacingLeft=6;fontSize=12;fontColor=#333333;")

# ---- entities: name -> (x, y top-left, [(key, attribute)]) -----------------
ENT = {
    "User": (40, 40, [
        ("PK", "id"), ("", "username"), ("", "email")]),
    "ProjectMember": (40, 300, [
        ("PK", "id"), ("FK", "projectId"), ("FK", "userId"), ("", "role")]),
    "ProjectInvitation": (40, 560, [
        ("PK", "id"), ("FK", "projectId"), ("", "email"), ("", "role"),
        ("", "status"), ("FK", "invitedById")]),
    "Project": (370, 270, [
        ("PK", "id"), ("", "name"), ("", "description"), ("FK", "ownerId")]),
    "ApiSpecification": (700, 40, [
        ("PK", "id"), ("FK", "projectId"), ("", "fileName"),
        ("", "generatedByAI")]),
    "Endpoint": (700, 300, [
        ("PK", "id"), ("FK", "projectId"), ("", "path"), ("", "method")]),
    "TestSuite": (1040, 40, [
        ("PK", "id"), ("FK", "projectId"), ("", "name"), ("", "status"),
        ("", "targetUrl"), ("FK", "triggeredById")]),
    "TestCase": (1040, 360, [
        ("PK", "id"), ("FK", "testSuiteId"), ("FK", "endpointId"),
        ("", "statusCode"), ("", "passed")]),
    "RequestLog": (1040, 620, [
        ("PK", "id"), ("FK", "testSuiteId"), ("FK", "endpointId"),
        ("", "seq"), ("", "statusCode")]),
}

# ---- relationships: (verb, parent, child, kind)  kind in {"1N", "11"} ------
REL = [
    ("owns",      "User", "Project", "1N"),
    ("has",       "Project", "ProjectMember", "1N"),
    ("is",        "User", "ProjectMember", "1N"),
    ("has",       "Project", "ProjectInvitation", "1N"),
    ("sends",     "User", "ProjectInvitation", "1N"),
    ("has",       "Project", "ApiSpecification", "11"),
    ("contains",  "Project", "Endpoint", "1N"),
    ("has",       "Project", "TestSuite", "1N"),
    ("triggers",  "User", "TestSuite", "1N"),
    ("produces",  "TestSuite", "TestCase", "1N"),
    ("tested by", "Endpoint", "TestCase", "1N"),
    ("captures",  "TestSuite", "RequestLog", "1N"),
    ("maps",      "Endpoint", "RequestLog", "1N"),
]


def main():
    cells: list[str] = []

    def raw(cid, value, style, parent, x, y, w, h, kind="vertex"):
        geo = (f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" '
               'as="geometry"/>') if x is not None else \
              (f'<mxGeometry y="{y}" width="{w}" height="{h}" as="geometry"/>')
        cells.append(
            f'<mxCell id="{cid}" value="{value}" style="{style}" '
            f'{kind}="1" parent="{parent}">{geo}</mxCell>')

    # entities as tables with attribute rows
    for name, (x, y, rows) in ENT.items():
        h = HEADER + len(rows) * ROWH
        raw(f"e_{name}", name, S_TABLE, "1", x, y, EW, h)
        for r, (key, attr) in enumerate(rows):
            rid = f"e_{name}_r{r}"
            raw(rid, "", S_ROW, f"e_{name}", None, HEADER + r * ROWH, EW, ROWH)
            kstyle = S_KEYCELL
            if key == "PK":
                kstyle += "fontStyle=5;"   # bold + underline
            elif key == "FK":
                kstyle += "fontStyle=2;"   # italic
            cells.append(
                f'<mxCell id="{rid}_k" value="{key}" style="{kstyle}" '
                f'vertex="1" parent="{rid}"><mxGeometry width="{KEYW}" '
                f'height="{ROWH}" as="geometry"/></mxCell>')
            cells.append(
                f'<mxCell id="{rid}_n" value="{escape(attr)}" '
                f'style="{S_NAMECELL}" vertex="1" parent="{rid}">'
                f'<mxGeometry x="{KEYW}" width="{EW - KEYW}" height="{ROWH}" '
                'as="geometry"/></mxCell>')

    # relationships as crow's-foot edges
    for k, (verb, parent, child, kind) in enumerate(REL):
        style = ("edgeStyle=entityRelationEdgeStyle;fontSize=11;html=1;"
                 "rounded=0;curved=0;startArrow=ERone;startFill=0;"
                 "fontColor=#111111;strokeColor=#333333;strokeWidth=1.3;"
                 "labelBackgroundColor=#ffffff;")
        style += "endArrow=ERone;endFill=0;" if kind == "11" \
            else "endArrow=ERmany;endFill=0;"
        cells.append(
            f'<mxCell id="rel_{k}" value="{escape(verb)}" style="{style}" '
            f'edge="1" parent="1" source="e_{parent}" target="e_{child}">'
            f'<mxGeometry relative="1" as="geometry"/></mxCell>')

    body = "\n        ".join(cells)
    xml = f'''<mxfile host="app.diagrams.net" type="device">
  <diagram id="er-crowsfoot" name="ER Diagram (Crow's Foot)">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" \
tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" \
pageWidth="1500" pageHeight="850" math="0" shadow="0">
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
    print(f"wrote {OUT}")
    print(f"  {len(ENT)} entities, {len(REL)} relationships")


if __name__ == "__main__":
    main()
