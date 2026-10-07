# OpenVision logo v4: steel gates with quarter-arch tops (closed, the two leaves make the gateway's semicircle),
# swung open toward the viewer; hazel eye in the lit gateway.
import math
METAL, HI, BG = '#c9d3df', '#ffffff', '#0e2240'
IRIS, IRIS_DARK, RING = '#6e8a3a', '#3d5222', '#c08a2e'

def leaf(hx, ox, ht, hb, ot, ob, bars, w_frame=7, tips=False):
    # Top edge: quadratic from hinge top (hx,ht) to outer top (ox,ot), vertical at the hinge, level at the outer
    # edge, like a quarter of the arch.
    def top_at(x):
        t = math.sqrt(max(0.0, (x - hx) / (ox - hx)))
        return (1 - t) ** 2 * ht + (1 - (1 - t) ** 2) * ot
    s = [f'<path d="M{hx} {hb} L{hx} {ht} Q{hx} {ot} {ox} {ot} L{ox} {ob} Z" fill="none" stroke="{METAL}" '
         f'stroke-width="{w_frame}" stroke-linejoin="round"/>']
    for i in range(1, bars + 1):
        f = i / (bars + 1)
        x = hx + (ox - hx) * f
        top = top_at(x); bot = hb + (ob - hb) * f
        s.append(f'<line x1="{x:.1f}" y1="{top:.1f}" x2="{x:.1f}" y2="{bot:.1f}" stroke="{METAL}" '
                 f'stroke-width="{4 + 1.5 * f:.1f}" stroke-linecap="round"/>')
    for r in (0.52, 0.84):
        y1 = ht + (hb - ht) * r; y2 = ot + (ob - ot) * r
        s.append(f'<line x1="{hx}" y1="{y1:.1f}" x2="{ox}" y2="{y2:.1f}" stroke="{METAL}" stroke-width="5" stroke-linecap="round"/>')
    d = 2 if ox < hx else -2
    s.append(f'<line x1="{ox + d}" y1="{ot + 8}" x2="{ox + d}" y2="{ob - 6}" stroke="{HI}" stroke-opacity=".6" stroke-width="2"/>')
    return '\n  '.join(s)

def logo(bars=4, bg=True, small=False):
    w = 9 if small else 7
    L = leaf(78, 37, 100, 212, 44, 222, bars, w)
    R = leaf(178, 219, 100, 212, 44, 222, bars, w)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="glow" cx="50%" cy="55%" r="65%"><stop offset="0" stop-color="#fff8e6"/><stop offset="1" stop-color="#ffd98a"/></radialGradient>
    <radialGradient id="iris" cx="50%" cy="50%" r="50%"><stop offset="0.42" stop-color="{RING}"/><stop offset="0.7" stop-color="{IRIS}"/><stop offset="1" stop-color="{IRIS_DARK}"/></radialGradient>
  </defs>
  {f'<rect width="256" height="256" rx="56" fill="{BG}"/>' if bg else ''}
  <path d="M78 212 V100 a50 50 0 0 1 100 0 V212 Z" fill="url(#glow)"/>
  <path d="M78 212 V100 a50 50 0 0 1 100 0 V212" fill="none" stroke="{METAL}" stroke-width="{w}" stroke-linejoin="round"/>
  {L}
  {R}
  <path d="M88 152 Q128 108 168 152 Q128 196 88 152 Z" fill="#ffffff" stroke="{BG}" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="128" cy="152" r="21" fill="url(#iris)"/>
  <circle cx="128" cy="152" r="21" fill="none" stroke="{IRIS_DARK}" stroke-width="2"/>
  <circle cx="128" cy="152" r="9" fill="#0b1626"/>
  <circle cx="135" cy="145" r="4.2" fill="#ffffff"/>
</svg>'''

open('v4-logo.svg', 'w').write(logo())
open('v4-logo-nobg.svg', 'w').write(logo(bg=False))
open('v4-favicon.svg', 'w').write(logo(bars=2, small=True))
html = '<html><body style="margin:0;padding:20px;background:#f3f4f6;font:14px sans-serif">'
for f in ['v4-logo.svg', 'v4-logo-nobg.svg', 'v4-favicon.svg']:
    html += f'<div style="display:flex;align-items:end;gap:20px;margin-bottom:18px"><b style="width:120px">{f}</b>'
    for s in [256, 128, 64, 32, 16]:
        html += f'<img src="{f}" width="{s}" height="{s}">'
    html += f'<div style="background:#111;padding:8px"><img src="{f}" width="64"></div></div>'
open('sheet4.html', 'w').write(html + '</body></html>')
