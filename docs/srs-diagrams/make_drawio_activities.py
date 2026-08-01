#!/usr/bin/env python
"""Generate the 7 SRS activity diagrams as native draw.io (.drawio) files.

Each diagram is a UML-style activity flowchart: start/end terminators (ellipses),
actions (rounded rectangles), decisions (diamonds), and labelled arrows. The
flows mirror the PlantUML sources in src/puml/act-*.puml, refined to match the
implementation. Open the files in https://app.diagrams.net to edit / re-export.

Run:  python docs/srs-diagrams/make_drawio_activities.py
"""
from __future__ import annotations

import math
from pathlib import Path
from xml.sax.saxutils import escape

OUT_DIR = Path(__file__).resolve().parent

# ---- node styles -----------------------------------------------------------
S_TERM = ("ellipse;whiteSpace=wrap;html=1;fillColor=#2B6CB0;strokeColor=#2B6CB0;"
          "fontColor=#ffffff;fontSize=12;fontStyle=1;")
S_ACTION = ("rounded=1;whiteSpace=wrap;html=1;fillColor=#EAF2FB;strokeColor=#2B6CB0;"
            "fontColor=#14181F;fontSize=12;arcSize=12;")
S_DECISION = ("rhombus;whiteSpace=wrap;html=1;fillColor=#EAF2FB;strokeColor=#2B6CB0;"
              "fontColor=#14181F;fontSize=12;")
S_TITLE = ("text;html=1;align=left;verticalAlign=middle;fontSize=16;fontStyle=1;"
           "fontColor=#1a365d;")

AW = 200      # action width
TERM = (74, 42)
DEC = (156, 92)

# ---- edge port helpers -----------------------------------------------------
def _p(ex, ey, nx, ny):
    return (f"exitX={ex};exitY={ey};exitDx=0;exitDy=0;"
            f"entryX={nx};entryY={ny};entryDx=0;entryDy=0;")

DOWN = _p(0.5, 1, 0.5, 0)
R_SAME = _p(1, 0.5, 0, 0.5)     # exit right -> enter left (same row)
L_SAME = _p(0, 0.5, 1, 0.5)     # exit left  -> enter right (same row)
B2R = _p(0.5, 1, 1, 0.5)        # exit bottom -> enter right face (merge to spine)
B2L = _p(0.5, 1, 0, 0.5)        # exit bottom -> enter left face
LOOP = _p(0.5, 0, 1, 0.5)       # exit top -> enter right face (loop back)
T2T = _p(0.5, 1, 0.5, 0)        # plain down


def act_h(label: str) -> int:
    lines = max(1, math.ceil(len(label) / 26))
    return max(48, 20 + 20 * lines)


def build(title, nodes, edges) -> str:
    cells = []
    dims = {}

    cells.append(
        f'<mxCell id="title" value="{escape(title)}" style="{S_TITLE}" '
        f'vertex="1" parent="1"><mxGeometry x="40" y="8" width="900" '
        f'height="30" as="geometry"/></mxCell>')

    for nid, kind, label, cx, cy in nodes:
        if kind == "term":
            w, h, style = TERM[0], TERM[1], S_TERM
        elif kind == "decision":
            w, h, style = DEC[0], DEC[1], S_DECISION
        else:
            w, h, style = AW, act_h(label), S_ACTION
        dims[nid] = (cx, cy, w, h)
        x, y = cx - w / 2, cy - h / 2
        cells.append(
            f'<mxCell id="{nid}" value="{escape(label)}" style="{style}" '
            f'vertex="1" parent="1"><mxGeometry x="{x:.0f}" y="{y:.0f}" '
            f'width="{w}" height="{h}" as="geometry"/></mxCell>')

    for k, (src, dst, label, ports) in enumerate(edges):
        style = ("edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;"
                 "jettySize=auto;html=1;endArrow=block;endFill=1;"
                 "strokeColor=#33475b;fontSize=11;fontColor=#111111;"
                 "labelBackgroundColor=#ffffff;") + (ports or "")
        cells.append(
            f'<mxCell id="e{k}" value="{escape(label)}" style="{style}" '
            f'edge="1" parent="1" source="{src}" target="{dst}">'
            f'<mxGeometry relative="1" as="geometry"/></mxCell>')

    body = "\n        ".join(cells)
    return f'''<mxfile host="app.diagrams.net" type="device">
  <diagram id="{escape(title)}" name="Activity Diagram">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" \
tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" \
pageWidth="1400" pageHeight="1300" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        {body}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
'''


# ===========================================================================
DIAGRAMS = {}

# ---- 1.1 Authentication ----------------------------------------------------
M, L, R, FR = 400, 140, 700, 1000
DIAGRAMS["act-1.1-authentication"] = (
    "Activity Diagram — 1.1: Authentication",
    [
        ("start", "term", "Start", M, 50),
        ("d_reg", "decision", "Registered user?", M, 180),
        ("a_l1", "action", "Enter email and password", M, 330),
        ("a_l2", "action", "Submit login", M, 440),
        ("d_valid", "decision", "Credentials valid?", M, 590),
        ("a_err1", "action", "Show error message", L, 590),
        ("end1", "term", "End", L, 720),
        ("a_s1", "action", "Open sign-up form", R, 180),
        ("a_s2", "action", "Enter username, email, password", R, 310),
        ("a_s3", "action", "Submit registration", R, 440),
        ("d_uniq", "decision", "Valid and unique?", R, 590),
        ("a_err2", "action", "Show validation error", FR, 590),
        ("end2", "term", "End", FR, 720),
        ("a_create", "action", "Create account (hash password)", R, 750),
        ("a_token", "action", "Issue JWT token", M, 750),
        ("a_redir", "action", "Redirect to dashboard", M, 870),
        ("end", "term", "End", M, 980),
    ],
    [
        ("start", "d_reg", "", DOWN),
        ("d_reg", "a_l1", "yes", DOWN),
        ("a_l1", "a_l2", "", DOWN),
        ("a_l2", "d_valid", "", DOWN),
        ("d_valid", "a_token", "yes", DOWN),
        ("d_valid", "a_err1", "no", L_SAME),
        ("a_err1", "end1", "", DOWN),
        ("d_reg", "a_s1", "no", R_SAME),
        ("a_s1", "a_s2", "", DOWN),
        ("a_s2", "a_s3", "", DOWN),
        ("a_s3", "d_uniq", "", DOWN),
        ("d_uniq", "a_create", "yes", DOWN),
        ("d_uniq", "a_err2", "no", R_SAME),
        ("a_err2", "end2", "", DOWN),
        ("a_create", "a_token", "", L_SAME),
        ("a_token", "a_redir", "", DOWN),
        ("a_redir", "end", "", DOWN),
    ],
)

# ---- 1.2 Project & Endpoint Management -------------------------------------
M = 460
DIAGRAMS["act-1.2-project-endpoint"] = (
    "Activity Diagram — 1.2: Project & Endpoint Management",
    [
        ("start", "term", "Start", M, 50),
        ("a_dash", "action", "Open dashboard", M, 160),
        ("a_list", "action", "View projects list", M, 270),
        ("d_act", "decision", "Action?", M, 410),
        # create-project branch (left)
        ("a_pn", "action", "Enter name and description", 170, 410),
        ("a_ps", "action", "Submit", 170, 520),
        ("a_pc", "action", "Create project and assign owner", 170, 630),
        ("a_pw", "action", "Open project workspace", 170, 750),
        ("end_c", "term", "End", 170, 870),
        # manage-existing branch (down)
        ("a_open", "action", "Open a project", M, 560),
        ("d_op", "decision", "Operation?", M, 710),
        ("a_upd", "action", "Update project details", M, 880),
        ("end_u", "term", "End", M, 1130),
        ("a_e1", "action", "Enter path and HTTP method", 760, 880),
        ("a_e2", "action", "Validate uniqueness", 760, 990),
        ("a_e3", "action", "Add endpoint to list", 760, 1100),
        ("end_e", "term", "End", 760, 1210),
        ("a_de", "action", "Remove endpoint", 1010, 880),
        ("end_d", "term", "End", 1010, 1010),
        ("a_dp1", "action", "Confirm deletion", 1250, 880),
        ("a_dp2", "action", "Permanently remove project and all data", 1250, 1000),
        ("end_p", "term", "End", 1250, 1130),
    ],
    [
        ("start", "a_dash", "", DOWN),
        ("a_dash", "a_list", "", DOWN),
        ("a_list", "d_act", "", DOWN),
        ("d_act", "a_pn", "Create project", L_SAME),
        ("a_pn", "a_ps", "", DOWN),
        ("a_ps", "a_pc", "", DOWN),
        ("a_pc", "a_pw", "", DOWN),
        ("a_pw", "end_c", "", DOWN),
        ("d_act", "a_open", "Manage existing", DOWN),
        ("a_open", "d_op", "", DOWN),
        ("d_op", "a_upd", "Rename / update", DOWN),
        ("a_upd", "end_u", "", DOWN),
        ("d_op", "a_e1", "Add endpoint", R_SAME),
        ("a_e1", "a_e2", "", DOWN),
        ("a_e2", "a_e3", "", DOWN),
        ("a_e3", "end_e", "", DOWN),
        ("d_op", "a_de", "Delete endpoint", R_SAME),
        ("a_de", "end_d", "", DOWN),
        ("d_op", "a_dp1", "Delete project", R_SAME),
        ("a_dp1", "a_dp2", "", DOWN),
        ("a_dp2", "end_p", "", DOWN),
    ],
)

# ---- 1.3 API Specification Management --------------------------------------
M, R = 400, 720
DIAGRAMS["act-1.3-api-specification"] = (
    "Activity Diagram — 1.3: API Specification Management",
    [
        ("start", "term", "Start", M, 50),
        ("a_open", "action", "Open API Specification page", M, 160),
        ("d_src", "decision", "Specification source?", M, 300),
        ("a_sel", "action", "Select OpenAPI 3.0 YAML file", M, 460),
        ("a_up", "action", "Upload file", M, 570),
        ("a_src", "action", "Upload API source code", R, 300),
        ("a_llm", "action", "LLM generates specification", R, 420),
        ("a_val", "action", "Validate and parse specification", M, 700),
        ("d_valid", "decision", "Valid specification?", M, 840),
        ("a_ext", "action", "Extract endpoints and operations", M, 1000),
        ("a_disp", "action", "Display detected endpoints", M, 1110),
        ("end", "term", "End", M, 1220),
        ("a_err", "action", "Show error with description", R, 840),
        ("end2", "term", "End", R, 970),
    ],
    [
        ("start", "a_open", "", DOWN),
        ("a_open", "d_src", "", DOWN),
        ("d_src", "a_sel", "Upload file", DOWN),
        ("a_sel", "a_up", "", DOWN),
        ("a_up", "a_val", "", DOWN),
        ("d_src", "a_src", "Generate from code", R_SAME),
        ("a_src", "a_llm", "", DOWN),
        ("a_llm", "a_val", "", B2R),
        ("a_val", "d_valid", "", DOWN),
        ("d_valid", "a_ext", "yes", DOWN),
        ("a_ext", "a_disp", "", DOWN),
        ("a_disp", "end", "", DOWN),
        ("d_valid", "a_err", "no", R_SAME),
        ("a_err", "end2", "", DOWN),
    ],
)

# ---- 1.4 Test Suite Management ---------------------------------------------
M, R = 400, 720
DIAGRAMS["act-1.4-test-suite"] = (
    "Activity Diagram — 1.4: Test Suite Management",
    [
        ("start", "term", "Start", M, 50),
        ("a_open", "action", "Open Test Suites section", M, 160),
        ("d_new", "decision", "New or reuse?", M, 300),
        ("a_cfg", "action", "Configure suite (target URL, time budget, mutation rate)", M, 470),
        ("a_trig", "action", "Trigger generation", M, 590),
        ("a_gen", "action", "Engine generates test cases (LLM-generated values)", M, 710),
        ("a_save", "action", "Save test suite", M, 830),
        ("a_sel", "action", "Select a saved suite", R, 300),
        ("a_disp", "action", "Display test suite", M, 960),
        ("end", "term", "End", M, 1070),
    ],
    [
        ("start", "a_open", "", DOWN),
        ("a_open", "d_new", "", DOWN),
        ("d_new", "a_cfg", "Generate new", DOWN),
        ("a_cfg", "a_trig", "", DOWN),
        ("a_trig", "a_gen", "", DOWN),
        ("a_gen", "a_save", "", DOWN),
        ("a_save", "a_disp", "", DOWN),
        ("d_new", "a_sel", "Reuse saved", R_SAME),
        ("a_sel", "a_disp", "", B2R),
        ("a_disp", "end", "", DOWN),
    ],
)

# ---- 1.5 Test Execution (with loop) ----------------------------------------
M, R = 400, 720
DIAGRAMS["act-1.5-test-execution"] = (
    "Activity Diagram — 1.5: Test Execution",
    [
        ("start", "term", "Start", M, 50),
        ("a_sel", "action", "Select a test suite", M, 160),
        ("a_run", "action", "Click Run (one-click)", M, 270),
        ("a_job", "action", "Backend creates async job (jobId)", M, 380),
        ("a_gen", "action", "Engine generates test cases", M, 490),
        ("d_loop", "decision", "More requests to send?", M, 630),
        ("a_send", "action", "Send request to target API", R, 500),
        ("a_rec", "action", "Record response", R, 610),
        ("a_prog", "action", "Update live progress", R, 720),
        ("d_ok", "decision", "Run completed successfully?", M, 800),
        ("a_comp", "action", "Compile results and analytics", M, 960),
        ("a_al", "action", "Send completion alert", M, 1070),
        ("a_fail", "action", "Send failure alert with reason", R, 900),
        ("a_store", "action", "Store results and report", M, 1200),
        ("end", "term", "End", M, 1310),
    ],
    [
        ("start", "a_sel", "", DOWN),
        ("a_sel", "a_run", "", DOWN),
        ("a_run", "a_job", "", DOWN),
        ("a_job", "a_gen", "", DOWN),
        ("a_gen", "d_loop", "", DOWN),
        ("d_loop", "a_send", "yes", R_SAME),
        ("a_send", "a_rec", "", DOWN),
        ("a_rec", "a_prog", "", DOWN),
        ("a_prog", "d_loop", "", LOOP),
        ("d_loop", "d_ok", "no", DOWN),
        ("d_ok", "a_comp", "yes", DOWN),
        ("a_comp", "a_al", "", DOWN),
        ("a_al", "a_store", "", DOWN),
        ("d_ok", "a_fail", "no", R_SAME),
        ("a_fail", "a_store", "", B2R),
        ("a_store", "end", "", DOWN),
    ],
)

# ---- 1.6 Test Results & Reports (4-way menu) -------------------------------
M = 500
DIAGRAMS["act-1.6-results-reports"] = (
    "Activity Diagram — 1.6: Test Results & Reports",
    [
        ("start", "term", "Start", M, 50),
        ("a_open", "action", "Open a completed test run", M, 160),
        ("a_view", "action", "View results (endpoints, methods, responses, pass/fail)", M, 290),
        ("d_act", "decision", "Next action?", M, 440),
        ("a_filter", "action", "Filter by endpoint / status / response code", 180, 610),
        ("end_f", "term", "End", 180, 820),
        ("a_insp", "action", "View captured requests and responses", M, 610),
        ("end_i", "term", "End", M, 820),
        ("a_an1", "action", "View response-code distribution, coverage, server failures", 800, 610),
        ("a_an2", "action", "View failure explanations (LLM)", 800, 760),
        ("end_a", "term", "End", 800, 890),
        ("a_exp", "action", "Download report as PDF / CSV", 1120, 610),
        ("end_e", "term", "End", 1120, 820),
    ],
    [
        ("start", "a_open", "", DOWN),
        ("a_open", "a_view", "", DOWN),
        ("a_view", "d_act", "", DOWN),
        ("d_act", "a_filter", "Filter", B2L),
        ("a_filter", "end_f", "", DOWN),
        ("d_act", "a_insp", "Inspect", DOWN),
        ("a_insp", "end_i", "", DOWN),
        ("d_act", "a_an1", "Analytics", B2R),
        ("a_an1", "a_an2", "", DOWN),
        ("a_an2", "end_a", "", DOWN),
        ("d_act", "a_exp", "Export", B2R),
        ("a_exp", "end_e", "", DOWN),
    ],
)

# ---- 1.7 Team Collaboration ------------------------------------------------
M, R = 400, 720
DIAGRAMS["act-1.7-collaboration"] = (
    "Activity Diagram — 1.7: Team Collaboration",
    [
        ("start", "term", "Start", M, 50),
        ("a_open", "action", "Owner / Admin opens Members", M, 160),
        ("a_enter", "action", "Enter invitee email and role", M, 270),
        ("a_create", "action", "Create invitation with unique token", M, 380),
        ("a_email", "action", "Send invitation email", M, 490),
        ("a_link", "action", "Invited user opens the link", M, 600),
        ("d_resp", "decision", "Invitation response?", M, 740),
        ("a_add", "action", "Add user as member with assigned role", M, 900),
        ("a_appear", "action", "Project appears on their dashboard", M, 1020),
        ("end", "term", "End", M, 1130),
        ("a_decl", "action", "Mark invitation as declined", R, 740),
        ("end2", "term", "End", R, 870),
    ],
    [
        ("start", "a_open", "", DOWN),
        ("a_open", "a_enter", "", DOWN),
        ("a_enter", "a_create", "", DOWN),
        ("a_create", "a_email", "", DOWN),
        ("a_email", "a_link", "", DOWN),
        ("a_link", "d_resp", "", DOWN),
        ("d_resp", "a_add", "Accept", DOWN),
        ("a_add", "a_appear", "", DOWN),
        ("a_appear", "end", "", DOWN),
        ("d_resp", "a_decl", "Decline", R_SAME),
        ("a_decl", "end2", "", DOWN),
    ],
)


def main():
    for name, (title, nodes, edges) in DIAGRAMS.items():
        xml = build(title, nodes, edges)
        path = OUT_DIR / f"{name}.drawio"
        path.write_text(xml, encoding="utf-8")
        print(f"wrote {path.name}  ({len(nodes)} nodes, {len(edges)} edges)")


if __name__ == "__main__":
    main()
