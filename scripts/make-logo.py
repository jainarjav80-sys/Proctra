#!/usr/bin/env python3
# Usage: python3 -m venv .venv-brand && .venv-brand/bin/pip install fonttools
#        .venv-brand/bin/python scripts/make-logo.py public/brand   (needs the Ubuntu font, Ubuntu Font Licence)
# Writes proctra-logo(-dark).svg, proctra-mark(-dark).svg and logo-canvas.svg (copy to public/logo.svg;
# render it at 4x for public/logo.png). Change TEXT below to change the tagline.
"""Rebuilds the Proctra logo as vectors from measurements of public/logo.png (393x120).
Mark: 6x3 grid of 19.5px cells at (53,25). Wordmark: 7 square-geometric letters, caps 37.3-49.0,
stroke ~1.6. Tagline: Ubuntu Light, sized so the original text spans x 205-345."""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
out = sys.argv[1]

# --- mark: exact grid ---------------------------------------------------------
CELLS = [(2, 0), (3, 0), (4, 0), (0, 1), (1, 1), (5, 1), (0, 2), (2, 2), (3, 2), (4, 2)]
def mark_rects(x0, y0, c, fill):
    # merge horizontal runs per row so edges are seamless at any scale
    rows = {}
    for cx, cy in CELLS: rows.setdefault(cy, []).append(cx)
    rects = []
    for cy, xs in rows.items():
        xs.sort(); start = prev = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == prev + 1: prev = x; continue
            rects.append(f'<rect x="{x0 + start * c:.2f}" y="{y0 + cy * c:.2f}" width="{(prev - start + 1) * c:.2f}" height="{c:.2f}" fill="{fill}"/>')
            if x is not None: start = prev = x
    return "".join(rects)

# --- wordmark: thin square-geometric caps (centre-line paths) -----------------
SW = 1.7
TOP, BOT = 37.3 + SW / 2, 49.0 - SW / 2
MID = 43.6
def letter(ch, l, r):
    L, R = l + SW / 2, r - SW / 2
    c = (L + R) / 2
    if ch == "P": return f"M{L},{BOT}V{TOP}H{R}V{MID}H{L}"
    if ch == "R":
        return f"M{L},{BOT}V{TOP}H{R}V{MID}H{L + 3.4} M{L + 8.6},{MID}L{R},{BOT}"
    if ch == "O": return f"M{L},{TOP}H{R}V{BOT}H{L}Z"
    if ch == "C": return f"M{R},{TOP}H{L}V{BOT}H{R}"
    if ch == "T": return f"M{L - SW / 2},{TOP}H{R + SW / 2} M{c},{TOP}V{BOT}"
    if ch == "A":
        yb = TOP + (BOT - TOP) * 0.66
        t = (yb - TOP) / (BOT - TOP)
        xl, xr = c - (c - L) * t, c + (R - c) * t
        return f"M{L},{BOT}L{c},{TOP}L{R},{BOT} M{xl},{yb}H{xr}"
BOXES = [("P", 205, 223), ("R", 227, 244.5), ("O", 249, 266.5), ("C", 271, 288.5), ("T", 293, 310.5), ("R", 314, 332), ("A", 336.5, 353.5)]
def wordmark(ink):
    d = " ".join(letter(ch, l, r) for ch, l, r in BOXES)
    return f'<path d="{d}" fill="none" stroke="{ink}" stroke-width="{SW}" stroke-linejoin="miter" stroke-linecap="butt"/>'

# --- tagline: Ubuntu Light outlines --------------------------------------------
font = TTFont("/usr/share/fonts/truetype/ubuntu/Ubuntu-L.ttf")
gs, cmap, hmtx, upm = font.getGlyphSet(), font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
def advance(text): return sum(hmtx[cmap[ord(ch)]][0] for ch in text)
size = 140.5 / advance("Your Interview Assistent") * upm   # original string spanned x 205-345
scale = size / upm
BASELINE = 69.4
def tagline(text, fill, x0=205.0):
    pen = SVGPathPen(gs, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip(".")); x = 0
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, x0 + x * scale, BASELINE)))
        x += hmtx[g][0]
    return f'<path d="{pen.getCommands()}" fill="{fill}"/>'

TEXT = "Your Interview Assistant"
VB = "45 18 320 72"   # same crop as before: mark + wordmark + tagline
def svg(body, vb=VB, w=None, h=None, title="Proctra"):
    x, y, ww, hh = vb.split()
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w or ww}" height="{h or hh}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')
for tone, ink, sub in [("", "#111111", "#8a8a8a"), ("-dark", "#ffffff", "#a8adb7")]:
    full = mark_rects(53, 25, 19.5, ink) + wordmark(ink) + tagline(TEXT, sub)
    open(f"{out}/proctra-logo{tone}.svg", "w").write(svg(full, title="Proctra: Your Interview Assistant"))
    open(f"{out}/proctra-mark{tone}.svg", "w").write(svg(mark_rects(0, 0, 1, ink), vb="0 0 6 3", w=117, h=58.5))
    if not tone:  # same canvas as the original public/logo.png (393x120, white), for exports
        open(f"{out}/logo-canvas.svg", "w").write(svg('<rect x="0" y="0" width="393" height="120" fill="#ffffff"/>' + full, vb="0 0 393 120", title="Proctra: Your Interview Assistant"))
print("tagline font size %.2fpx, width %.1fpx" % (size, advance(TEXT) * scale))
