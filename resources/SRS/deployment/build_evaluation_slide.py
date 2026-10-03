import os
from pptx import Presentation
from pptx.util import Emu, Pt, Inches
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn

SRS = r'D:\SPL3\AutoRestTest\resources\SRS'
SRC = os.path.join(SRS, '1433_SPL3_FINAL.pptx')
OUT = os.path.join(SRS, 'evaluation_slide.pptx')

BLUE = RGBColor(0x2F, 0x6F, 0xC6); DBLUE = RGBColor(0x1F, 0x49, 0x7D)
ORANGE = RGBColor(0xD9, 0x6B, 0x13); LIGHT = RGBColor(0xE4, 0xEC, 0xF7)
GREY = RGBColor(0x53, 0x5D, 0x6B); WHITE = RGBColor(255, 255, 255)
GREEN = RGBColor(0x1F, 0xA8, 0x57); RED = RGBColor(0xC0, 0x39, 0x2B)
ROWALT = RGBColor(0xF4, 0xF7, 0xFC); REDBG = RGBColor(0xFD, 0xEC, 0xEA)
FONT = 'Merriweather Sans'

# name, endpoints, coverage %, requests, 2xx, 5xx, faulty endpoints   (report section 8.3)
DATA = [
    ('HomeLogger', 37, 92, 2208, 1134, 94, 4),
    ('ApogeoAPI', 46, 93, 496, 249, 10, 3),
    ('UK Parliament Bills API', 22, 77, 4912, 1857, 2, 2),
    ('UK Parliament Members API', 43, 91, 1306, 590, 35, 1),
    ('Grocy', 44, 82, 1198, 414, 152, 20),
    ('Snipe-IT', 145, 98, 3162, 2104, 6, 5),
    ('RealWorld', 17, 88, 949, 230, 0, 0),
    ('LubeLogger', 76, 62, 1016, 314, 30, 19),
    ('IUCN Red List', 50, 88, 894, 423, 3, 3),
    ('CosmyDay', 17, 94, 414, 249, 0, 0),
    ('VATcomply', 7, 100, 468, 325, 0, 0),
    ('CareerStory', 18, 72, 680, 170, 3, 1),
    ('Laravel Blog', 23, 91, 2250, 1235, 10, 4),
    ('CycleCalcs', 30, 100, 1130, 501, 0, 0),
    ('Holiday', 6, 100, 611, 361, 51, 1),
]
DATA.sort(key=lambda r: (-r[2], -r[1]))

tot_ep = sum(r[1] for r in DATA); avg_cov = sum(r[2] for r in DATA) / len(DATA)
tot_req = sum(r[3] for r in DATA); tot_5 = sum(r[5] for r in DATA); tot_f = sum(r[6] for r in DATA)

prs = Presentation(SRC)
ids = prs.slides._sldIdLst
keep = list(ids)[1]
for sid in list(ids):
    if sid is not keep:
        prs.part.drop_rel(sid.get(qn('r:id'))); ids.remove(sid)
slide = prs.slides[0]
shapes = list(slide.shapes)
for sh in shapes[4:]:
    sh._element.getparent().remove(sh._element)
t = shapes[3].text_frame.paragraphs[0]
t.runs[0].text = 'Real-World Evaluation'
for r in t.runs[1:]:
    r.text = ''


def text(x, y, w, h, s, size, color, bold=False, align=PP_ALIGN.CENTER):
    tb = slide.shapes.add_textbox(Emu(x), Emu(y), Emu(w), Emu(h))
    tf = tb.text_frame; tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    for m in ('margin_left', 'margin_right', 'margin_top', 'margin_bottom'):
        setattr(tf, m, 0)
    p = tf.paragraphs[0]; p.alignment = align
    r = p.add_run(); r.text = s
    r.font.size = Pt(size); r.font.bold = bold; r.font.color.rgb = color; r.font.name = FONT


I = 914400
LM = int(1.0 * I); TW = int(18.0 * I)

# ---- KPI strip -------------------------------------------------------------
kpis = [
    ('15', 'REAL-WORLD APIs', BLUE),
    (f'{tot_ep}', 'TOTAL ENDPOINTS', BLUE),
    (f'{avg_cov:.1f}%', 'AVG. COVERAGE', GREEN),
    (f'{tot_req:,}', 'REQUESTS SENT', BLUE),
    (f'{tot_5}', 'SERVER ERRORS (5xx)', ORANGE),
    (f'{tot_f}', 'FAULTY ENDPOINTS', RED),
]
gap = int(0.22 * I); kw = (TW - gap * 5) // 6; ky = int(1.8 * I); kh = int(1.05 * I)
for i, (v, lab, col) in enumerate(kpis):
    x = LM + i * (kw + gap)
    c = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(x), Emu(ky), Emu(kw), Emu(kh))
    c.adjustments[0] = 0.12
    c.fill.solid(); c.fill.fore_color.rgb = WHITE; c.line.color.rgb = LIGHT; c.line.width = Pt(2)
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(x + int(0.25 * I)), Emu(ky), Emu(kw - int(0.5 * I)), Emu(int(0.06 * I)))
    bar.fill.solid(); bar.fill.fore_color.rgb = col; bar.line.fill.background()
    text(x, ky + int(0.12 * I), kw, int(0.55 * I), v, 28, col, True)
    text(x, ky + int(0.68 * I), kw, int(0.28 * I), lab, 11, GREY, True)

# ---- table -----------------------------------------------------------------
cols = ['#', 'API Project', 'Endpoints', 'Endpoint Coverage', 'Requests', 'Success (2xx)', 'Errors (5xx)', 'Faulty Endpoints']
cw_in = [0.7, 4.0, 1.8, 4.3, 1.7, 1.8, 1.7, 2.0]
cw = [int(w * I) for w in cw_in]
hh = int(0.46 * I); rh = int(0.41 * I)
ty = int(3.2 * I)
gf = slide.shapes.add_table(len(DATA) + 1, len(cols), Emu(LM), Emu(ty), Emu(sum(cw)), Emu(hh + rh * len(DATA)))
tbl = gf.table
tbl._tbl.tblPr.find(qn('a:tableStyleId')).text = '{2D5ABB26-0587-4C30-8999-92F81FD0307C}'
for i, w in enumerate(cw):
    tbl.columns[i].width = Emu(w)
tbl.rows[0].height = Emu(hh)
for i in range(1, len(DATA) + 1):
    tbl.rows[i].height = Emu(rh)


def cell(r, c, s, size=14, color=GREY, bold=False, align=PP_ALIGN.CENTER, fill=None):
    ce = tbl.cell(r, c)
    ce.margin_left = ce.margin_right = Emu(int(0.12 * I)); ce.margin_top = ce.margin_bottom = 0
    ce.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf = ce.text_frame; p = tf.paragraphs[0]; p.alignment = align
    for rr in list(p.runs):
        rr._r.getparent().remove(rr._r)
    run = p.add_run(); run.text = s
    run.font.size = Pt(size); run.font.bold = bold; run.font.color.rgb = color; run.font.name = FONT
    if fill is not None:
        ce.fill.solid(); ce.fill.fore_color.rgb = fill
    else:
        ce.fill.background()


for c, h in enumerate(cols):
    cell(0, c, h, 13, WHITE, True, PP_ALIGN.LEFT if c == 1 else PP_ALIGN.CENTER, DBLUE)

for i, (nm, ep, cov, req, ok, e5, ft) in enumerate(DATA, start=1):
    bg = ROWALT if i % 2 == 0 else WHITE
    cell(i, 0, str(i), 13, GREY, False, PP_ALIGN.CENTER, bg)
    cell(i, 1, nm, 14, DBLUE, True, PP_ALIGN.LEFT, bg)
    cell(i, 2, str(ep), 14, GREY, False, PP_ALIGN.CENTER, bg)
    cell(i, 3, f'{cov}%', 14, DBLUE, True, PP_ALIGN.RIGHT, bg)
    cell(i, 4, f'{req:,}', 14, GREY, False, PP_ALIGN.CENTER, bg)
    cell(i, 5, f'{ok:,}', 14, GREEN, True, PP_ALIGN.CENTER, bg)
    cell(i, 6, str(e5), 14, ORANGE if e5 else GREY, bool(e5), PP_ALIGN.CENTER, bg)
    cell(i, 7, str(ft), 14, RED if ft else GREY, bool(ft), PP_ALIGN.CENTER, REDBG if ft else bg)

# coverage data bars overlaid on the coverage column
cx0 = LM + sum(cw[:3]) + int(0.2 * I)
bar_max = int(2.75 * I); bh = int(0.17 * I)
for i, row in enumerate(DATA):
    cov = row[2]
    by = ty + hh + rh * i + (rh - bh) // 2
    trk = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(cx0), Emu(by), Emu(bar_max), Emu(bh))
    trk.adjustments[0] = 0.5; trk.fill.solid(); trk.fill.fore_color.rgb = LIGHT; trk.line.fill.background()
    col = GREEN if cov >= 90 else (BLUE if cov >= 75 else ORANGE)
    fb = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(cx0), Emu(by), Emu(int(bar_max * cov / 100)), Emu(bh))
    fb.adjustments[0] = 0.5; fb.fill.solid(); fb.fill.fore_color.rgb = col; fb.line.fill.background()

prs.save(OUT)
print('saved', OUT, tot_ep, round(avg_cov, 1), tot_req, tot_5, tot_f)


# legend (added after save is not possible, so re-open and save)
prs2 = Presentation(OUT); s2 = prs2.slides[0]
ly = ty + hh + rh * len(DATA) + int(0.3 * I)
lx = LM
for col, lab in ((GREEN, 'Coverage ≥ 90%'), (BLUE, '75 – 89%'), (ORANGE, '< 75%')):
    d = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(lx), Emu(ly + int(0.06 * I)), Emu(int(0.4 * I)), Emu(int(0.17 * I)))
    d.adjustments[0] = 0.5; d.fill.solid(); d.fill.fore_color.rgb = col; d.line.fill.background()
    tb = s2.shapes.add_textbox(Emu(lx + int(0.5 * I)), Emu(ly), Emu(int(2.2 * I)), Emu(int(0.3 * I)))
    tf = tb.text_frame; tf.margin_left = tf.margin_top = tf.margin_bottom = 0; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    r = tf.paragraphs[0].add_run(); r.text = lab; r.font.size = Pt(12); r.font.color.rgb = GREY; r.font.name = FONT
    lx += int(2.7 * I)
prs2.save(OUT)
