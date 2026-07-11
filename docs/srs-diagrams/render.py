#!/usr/bin/env python
"""Regenerate all SRS diagram PNGs from their text sources.

Pipeline (all local, no Graphviz/Mermaid install required):
  - src/puml/*.puml  (use-case, activity)  -> png/<name>.png   via PlantUML
  - src/dot/*.puml   (@startdot Chen ER)   -> png/<name>.png   via
        PlantUML (@startdot -> SVG, using its bundled dot) ->
        underline post-process -> reportlab PDF -> pypdfium2 PNG.

Mermaid sources in src/mmd/ are the draw.io-editable copies and are not
rendered here (PlantUML/DOT produce the document figures).

Usage:  python render.py [name-substring ...]
        (no args = render everything; args filter by filename)
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
JAR = ROOT / "tools" / "plantuml.jar"
PNG = ROOT / "png"
PUML_DIR = ROOT / "src" / "puml"
DOT_DIR = ROOT / "src" / "dot"

# DPI-ish scale used when rasterising the ER PDF. Higher = crisper/larger PNG.
ER_SCALE = 2.4


def _filtered(paths, needles):
    if not needles:
        return sorted(paths)
    return sorted(p for p in paths if any(n.lower() in p.name.lower() for n in needles))


def render_plantuml(needles):
    files = _filtered(PUML_DIR.glob("*.puml"), needles)
    if not files:
        return
    print(f"[puml] rendering {len(files)} file(s) -> png/")
    subprocess.run(
        ["java", "-jar", str(JAR), "-tpng", "-o", str(PNG), *map(str, files)],
        check=True,
    )


# Approx Arial advance width (fraction of font-size) so the injected underline
# spans the key text. Slightly generous; keys are short so error is invisible.
_CHAR_W = 0.60


def _inject_underlines(svg: str) -> str:
    """svglib ignores text-decoration:underline; draw the stroke ourselves.

    Graphviz emits keys as:
      <text text-anchor="start|middle" x=".." y=".." ... text-decoration="underline" font-size="..">KEY</text>
    We append a <path> just below each such text baseline, in the same
    coordinate space (inside graphviz's single transformed <g>).
    """
    pat = re.compile(
        r'<text\b[^>]*text-decoration="underline"[^>]*>(?P<txt>[^<]*)</text>'
    )

    def attr(tag, name, default=None):
        m = re.search(rf'{name}="([^"]*)"', tag)
        return m.group(1) if m else default

    out = []
    last = 0
    for m in pat.finditer(svg):
        tag = m.group(0)
        txt = m.group("txt")
        try:
            x = float(attr(tag, "x", "0"))
            y = float(attr(tag, "y", "0"))
            fs = float(attr(tag, "font-size", "11"))
        except ValueError:
            continue
        anchor = attr(tag, "text-anchor", "start")
        w = _CHAR_W * fs * max(len(txt), 1)
        if anchor == "middle":
            x1, x2 = x - w / 2, x + w / 2
        elif anchor == "end":
            x1, x2 = x - w, x
        else:
            x1, x2 = x, x + w
        yb = y + fs * 0.16  # just under the baseline
        line = f'<path fill="none" stroke="black" stroke-width="0.7" d="M{x1:.1f},{yb:.1f} L{x2:.1f},{yb:.1f}"/>'
        out.append(svg[last:m.end()])
        out.append(line)
        last = m.end()
    out.append(svg[last:])
    return "".join(out)


def render_dot(needles):
    files = _filtered(DOT_DIR.glob("*.puml"), needles)
    if not files:
        return
    from reportlab.graphics import renderPDF
    from svglib.svglib import svg2rlg
    import pypdfium2 as pdfium

    print(f"[ dot] rendering {len(files)} Chen-ER file(s) -> png/")
    for src in files:
        name = src.stem
        subprocess.run(
            ["java", "-jar", str(JAR), "-tsvg", "-o", str(PNG), str(src)],
            check=True,
        )
        svg_path = PNG / f"{name}.svg"
        svg_path.write_text(_inject_underlines(svg_path.read_text(encoding="utf-8")), encoding="utf-8")
        drawing = svg2rlg(str(svg_path))
        pdf_path = PNG / f"{name}.pdf"
        renderPDF.drawToFile(drawing, str(pdf_path))
        doc = pdfium.PdfDocument(str(pdf_path))
        img = doc[0].render(scale=ER_SCALE).to_pil()
        img.save(PNG / f"{name}.png")
        doc.close()  # release the handle so the temp PDF can be removed (Windows)
        svg_path.unlink(missing_ok=True)
        pdf_path.unlink(missing_ok=True)
        print(f"       {name}.png  {img.size}")


def main():
    needles = sys.argv[1:]
    PNG.mkdir(exist_ok=True)
    render_plantuml(needles)
    render_dot(needles)
    print("done.")


if __name__ == "__main__":
    main()
