"""Génère les illustrations du thème « Chat » de la Pointeuse LPF.

Jour : chat roux tigré aux yeux verts. Nuit : chat noir aux yeux dorés.
Usage : python3 scripts/theme-chat.py themes/chat
"""
import os
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

PALETTES = {
    'jour': dict(fur='#E9965A', fur2='#F0AA70', stripe='#C7703A', bib='#FCE9D4', inner='#F6B3A8', nose='#E58C8C',
                 iris='#8CC152', iris2='#5E9E2E', pupil='#2A2522', whisker='#A86E48', line='#8A4A22', rim=None,
                 yarn='#7FC8C2', yarn2='#5AA9A3', z='#C7703A'),
    'nuit': dict(fur='#2B2D3A', fur2='#353849', stripe='#1E2029', bib='#474B60', inner='#7A5C78', nose='#A27590',
                 iris='#F6C445', iris2='#E39B1B', pupil='#141419', whisker='#C9CCE0', line='#0F1017', rim='#6E74A0',
                 yarn='#B48AD6', yarn2='#8E66B3', z='#C9CCE0'),
}


def rim(p, width=2.5):
    return '' if not p['rim'] else f' stroke="{p["rim"]}" stroke-width="{width}" stroke-linejoin="round"'


def head(p):
    """Tête du chat (repère du chat assis : centre x=200, tête de y≈44 à y≈284)."""
    return f'''
  <path d="M112 150 C 104 104 108 66 122 44 C 150 62 172 86 186 116 Z" fill="{p['fur']}"{rim(p)}/>
  <path d="M288 150 C 296 104 292 66 278 44 C 250 62 228 86 214 116 Z" fill="{p['fur']}"{rim(p)}/>
  <path d="M124 136 C 120 106 122 82 130 66 C 148 80 160 96 168 116 Z" fill="{p['inner']}"/>
  <path d="M276 136 C 280 106 278 82 270 66 C 252 80 240 96 232 116 Z" fill="{p['inner']}"/>
  <path d="M128 72 l 7 18 M137 68 l 4 20 M272 72 l -7 18 M263 68 l -4 20" stroke="{p['bib']}" stroke-width="2" stroke-linecap="round" opacity=".85"/>
  <path d="M200 102 C 140 102 98 138 94 188 C 92 214 102 236 118 250 C 108 254 104 262 110 266 C 128 266 132 262 140 264 C 158 278 180 284 200 284 C 220 284 242 278 260 264 C 268 262 272 266 290 266 C 296 262 292 254 282 250 C 298 236 308 214 306 188 C 302 138 260 102 200 102 Z" fill="{p['fur']}"{rim(p)}/>
  <path d="M200 108 L 200 140 M180 112 L 186 140 M220 112 L 214 140" stroke="{p['stripe']}" stroke-width="7" stroke-linecap="round"/>
  <path d="M108 190 L 136 194 M106 210 L 132 208 M292 190 L 264 194 M294 210 L 268 208" stroke="{p['stripe']}" stroke-width="6" stroke-linecap="round" opacity=".85"/>
  <path d="M200 200 C 176 200 158 214 158 234 C 158 254 178 266 200 266 C 222 266 242 254 242 234 C 242 214 224 200 200 200 Z" fill="{p['bib']}"/>
  <ellipse cx="146" cy="226" rx="12" ry="7" fill="{p['inner']}" opacity=".45"/>
  <ellipse cx="254" cy="226" rx="12" ry="7" fill="{p['inner']}" opacity=".45"/>'''


def eyes_open(p):
    return f'''<g class="blink">
  <path d="M140 178 C 150 160 182 158 190 180 C 182 200 150 200 140 178 Z" fill="{p['iris']}"/>
  <path d="M260 178 C 250 160 218 158 210 180 C 218 200 250 200 260 178 Z" fill="{p['iris']}"/>
  <path d="M144 182 C 156 196 180 196 188 184 C 180 198 152 200 144 182 Z" fill="{p['iris2']}" opacity=".7"/>
  <path d="M256 182 C 244 196 220 196 212 184 C 220 198 248 200 256 182 Z" fill="{p['iris2']}" opacity=".7"/>
  <ellipse cx="166" cy="179" rx="6" ry="15" fill="{p['pupil']}"/>
  <ellipse cx="234" cy="179" rx="6" ry="15" fill="{p['pupil']}"/>
  <circle cx="170" cy="172" r="4" fill="#fff"/>
  <circle cx="238" cy="172" r="4" fill="#fff"/>
  <circle cx="162" cy="186" r="1.8" fill="#fff" opacity=".8"/>
  <circle cx="230" cy="186" r="1.8" fill="#fff" opacity=".8"/>
  <path d="M138 176 C 150 156 182 154 192 178" stroke="{p['line']}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M262 176 C 250 156 218 154 208 178" stroke="{p['line']}" stroke-width="3" fill="none" stroke-linecap="round"/></g>'''


def eyes_closed(p):
    return f'''
  <path d="M142 182 C 152 194 178 194 188 182" stroke="{p['line']}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M258 182 C 248 194 222 194 212 182" stroke="{p['line']}" stroke-width="4" fill="none" stroke-linecap="round"/>'''


def face(p):
    return f'''
  <path d="M188 214 C 188 208 212 208 212 214 C 212 222 204 228 200 230 C 196 228 188 222 188 214 Z" fill="{p['nose']}"/>
  <path d="M193 212 C 196 210 200 210 202 212" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6" fill="none"/>
  <path d="M200 230 L 200 238 M200 238 C 196 248 184 248 180 240 M200 238 C 204 248 216 248 220 240" stroke="{p['line']}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <g stroke="{p['whisker']}" stroke-width="2" stroke-linecap="round" opacity=".9" fill="none">
    <path d="M158 232 C 130 224 104 222 76 226"/><path d="M158 240 C 130 240 106 244 80 252"/><path d="M160 248 C 136 254 116 264 96 278"/>
    <path d="M242 232 C 270 224 296 222 324 226"/><path d="M242 240 C 270 240 294 244 320 252"/><path d="M240 248 C 264 254 284 264 304 278"/>
  </g>'''


def sitting_cat(p):
    """Chat assis de face, queue relevée sur le côté. viewBox 0 0 400 480."""
    return f'''
  <ellipse cx="200" cy="462" rx="150" ry="14" fill="#000" opacity=".12"/>
  <g class="tail">
  <path d="M262 440 C 330 438 376 400 372 350 C 370 322 352 302 334 312 C 322 320 330 334 338 344 C 352 366 340 404 300 414 C 280 420 262 422 250 424 Z" fill="{p['fur']}"{rim(p)}/>
  <path d="M352 326 C 360 338 364 350 364 362 L 348 362 C 348 352 345 342 340 334 Z" fill="{p['stripe']}" opacity=".85"/>
  <path d="M362 384 C 356 396 348 405 336 412 L 328 398 C 338 393 344 386 348 378 Z" fill="{p['stripe']}" opacity=".85"/>
  </g>
  <path d="M120 300 C 108 360 112 420 136 452 L 264 452 C 288 420 292 360 280 300 C 268 240 132 240 120 300 Z" fill="{p['fur']}"{rim(p)}/>
  <path d="M128 330 C 116 360 118 400 128 430" stroke="{p['stripe']}" stroke-width="10" stroke-linecap="round" fill="none" opacity=".8"/>
  <path d="M272 330 C 284 360 282 400 272 430" stroke="{p['stripe']}" stroke-width="10" stroke-linecap="round" fill="none" opacity=".8"/>
  <path d="M138 300 C 132 318 132 336 136 352" stroke="{p['stripe']}" stroke-width="8" stroke-linecap="round" fill="none" opacity=".7"/>
  <path d="M262 300 C 268 318 268 336 264 352" stroke="{p['stripe']}" stroke-width="8" stroke-linecap="round" fill="none" opacity=".7"/>
  <path d="M158 262 L 166 276 L 172 262 L 180 278 L 188 262 L 196 280 L 204 262 L 212 280 L 220 262 L 228 278 L 234 262 L 242 276 C 250 310 244 360 228 400 C 214 430 186 430 172 400 C 156 360 150 310 158 262 Z" fill="{p['bib']}"/>
  <path d="M160 360 C 156 400 158 430 162 450 C 164 462 196 462 198 450 C 200 428 198 398 194 364 Z" fill="{p['fur2']}"/>
  <path d="M206 364 C 202 398 200 428 202 450 C 204 462 236 462 238 450 C 242 430 244 400 240 360 Z" fill="{p['fur2']}"/>
  <ellipse cx="180" cy="452" rx="22" ry="11" fill="{p['bib']}"/>
  <ellipse cx="220" cy="452" rx="22" ry="11" fill="{p['bib']}"/>
  <path d="M172 448 v8 M180 447 v9 M188 448 v8 M212 448 v8 M220 447 v9 M228 448 v8" stroke="{p['line']}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
  {head(p)}{eyes_open(p)}{face(p)}'''


def peeking_cat(p):
    """Tête et pattes qui dépassent d'un bord. viewBox 0 0 400 230 (bord en bas)."""
    return f'''
  <g transform="translate(0 -60)">{head(p)}{eyes_open(p)}{face(p)}</g>
  <ellipse cx="120" cy="222" rx="38" ry="22" fill="{p['fur2']}"{rim(p)}/>
  <ellipse cx="280" cy="222" rx="38" ry="22" fill="{p['fur2']}"{rim(p)}/>
  <path d="M104 214 v10 M118 211 v12 M132 213 v10 M268 213 v10 M282 211 v12 M296 214 v10" stroke="{p['line']}" stroke-width="2" stroke-linecap="round" opacity=".45"/>'''


def sleeping_cat(p):
    """Chat roulé en boule qui dort. viewBox 0 0 400 260."""
    return f'''
  <ellipse cx="200" cy="244" rx="160" ry="12" fill="#000" opacity=".1"/>
  <g class="breathe">
  <path d="M70 200 C 60 130 130 80 220 84 C 310 88 352 150 340 200 C 334 230 300 242 200 242 C 110 242 76 230 70 200 Z" fill="{p['fur']}"{rim(p)}/>
  <path d="M150 100 C 160 120 162 140 156 160 M200 88 C 208 112 210 136 204 160 M250 94 C 256 116 256 140 250 162 M298 116 C 300 136 298 154 290 170" stroke="{p['stripe']}" stroke-width="10" stroke-linecap="round" fill="none" opacity=".75"/>
  <path d="M330 206 C 300 236 200 246 132 238 C 108 236 96 226 104 218 C 116 208 160 222 210 220 C 262 218 302 206 318 192 Z" fill="{p['fur2']}"{rim(p)}/>
  <path d="M146 224 l 8 -14 M186 226 l 8 -16 M228 222 l 8 -16 M268 214 l 8 -16" stroke="{p['stripe']}" stroke-width="9" stroke-linecap="round" opacity=".8"/>
  <g transform="translate(36 120) scale(.46)">
    <path d="M112 150 C 104 104 108 66 122 44 C 150 62 172 86 186 116 Z" fill="{p['fur']}"{rim(p, 5)}/>
    <path d="M288 150 C 296 104 292 66 278 44 C 250 62 228 86 214 116 Z" fill="{p['fur']}"{rim(p, 5)}/>
    <path d="M124 136 C 120 106 122 82 130 66 C 148 80 160 96 168 116 Z" fill="{p['inner']}"/>
    <path d="M276 136 C 280 106 278 82 270 66 C 252 80 240 96 232 116 Z" fill="{p['inner']}"/>
    <path d="M200 102 C 140 102 98 138 94 188 C 92 214 102 236 118 250 C 140 272 170 284 200 284 C 230 284 260 272 282 250 C 298 236 308 214 306 188 C 302 138 260 102 200 102 Z" fill="{p['fur']}"{rim(p, 5)}/>
    <path d="M200 108 L 200 140 M180 112 L 186 140 M220 112 L 214 140" stroke="{p['stripe']}" stroke-width="8" stroke-linecap="round"/>
    <path d="M200 200 C 176 200 158 214 158 234 C 158 254 178 266 200 266 C 222 266 242 254 242 234 C 242 214 224 200 200 200 Z" fill="{p['bib']}"/>
    {eyes_closed(p)}
    <path d="M188 214 C 188 208 212 208 212 214 C 212 222 204 228 200 230 C 196 228 188 222 188 214 Z" fill="{p['nose']}"/>
    <ellipse cx="146" cy="226" rx="14" ry="8" fill="{p['inner']}" opacity=".5"/>
    <ellipse cx="254" cy="226" rx="14" ry="8" fill="{p['inner']}" opacity=".5"/>
  </g>
  </g>
  <g class="zzz" fill="{p['z']}" font-family="Inter, Arial, sans-serif" font-weight="800" opacity=".8">
    <text x="150" y="92" font-size="26">z</text><text x="174" y="66" font-size="34">z</text><text x="206" y="38" font-size="42">Z</text>
  </g>'''


def yarn(p):
    """Pelote de laine avec un fil qui part. viewBox 0 0 200 140."""
    return f'''
  <path d="M120 112 C 150 120 168 132 196 128" stroke="{p['yarn']}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="80" cy="76" r="56" fill="{p['yarn']}"/>
  <g stroke="{p['yarn2']}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".9">
    <path d="M36 50 C 66 70 100 74 132 62"/><path d="M28 78 C 62 98 104 100 136 84"/><path d="M40 108 C 70 118 100 118 124 108"/>
    <path d="M70 22 C 54 54 56 98 76 130"/><path d="M100 24 C 88 56 92 100 108 126"/>
  </g>
  <circle cx="62" cy="54" r="10" fill="#fff" opacity=".25"/>'''


PAW = 'M50 58 C 34 58 22 70 22 84 C 22 96 34 100 50 100 C 66 100 78 96 78 84 C 78 70 66 58 50 58 Z M24 52 a 10 13 -20 1 0 0.1 0 Z M76 52 a 10 13 20 1 0 0.1 0 Z M40 34 a 10 13 -5 1 0 0.1 0 Z M60 34 a 10 13 5 1 0 0.1 0 Z'
PAW_SHAPES = '''<ellipse cx="50" cy="80" rx="27" ry="21"/><ellipse cx="22" cy="50" rx="10" ry="13" transform="rotate(-20 22 50)"/>
  <ellipse cx="78" cy="50" rx="10" ry="13" transform="rotate(20 78 50)"/><ellipse cx="38" cy="30" rx="10" ry="13" transform="rotate(-6 38 30)"/>
  <ellipse cx="62" cy="30" rx="10" ry="13" transform="rotate(6 62 30)"/>'''


STYLE = """<style>
  .blink { transform-box: fill-box; transform-origin: center; animation: blink 6s infinite; }
  @keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
  .tail { transform-origin: 262px 432px; animation: tail 3.2s ease-in-out infinite; }
  @keyframes tail { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-7deg); } }
  .breathe { transform-origin: 200px 240px; animation: breathe 3.6s ease-in-out infinite; }
  @keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.025, 1.04); } }
  .zzz text { animation: zzz 3.6s ease-in-out infinite; }
  .zzz text:nth-child(2) { animation-delay: .6s; } .zzz text:nth-child(3) { animation-delay: 1.2s; }
  @keyframes zzz { 0%, 100% { opacity: .25; transform: translateY(4px); } 50% { opacity: 1; transform: translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>"""


def svg(view, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">{STYLE}{body}\n</svg>\n'


for mode, p in PALETTES.items():
    files = {
        f'chat-assis-{mode}.svg': svg('0 0 400 480', sitting_cat(p)),
        f'chat-coucou-{mode}.svg': svg('0 0 400 230', peeking_cat(p)),
        f'chat-dodo-{mode}.svg': svg('0 0 400 260', sleeping_cat(p)),
        f'pelote-{mode}.svg': svg('0 0 200 140', yarn(p)),
    }
    for name, content in files.items():
        with open(os.path.join(OUT, name), 'w') as f:
            f.write(content)

# Empreinte de patte (sert de masque CSS : prend la couleur du thème)
with open(os.path.join(OUT, 'patte.svg'), 'w') as f:
    f.write(svg('0 0 100 100', f'<g fill="#000">{PAW_SHAPES}</g>'))

# Motif de fond : quelques empreintes en diagonale, très discrètes (couleur réglée dans le CSS par mode)
for mode, color in (('jour', '#C7703A'), ('nuit', '#C9CCE0')):
    tile = ''.join(
        f'<g transform="translate({x} {y}) rotate({r}) scale(.22)" fill="{color}">{PAW_SHAPES}</g>'
        for x, y, r in ((20, 30, -18), (62, 70, -10), (118, 26, 14), (160, 96, -24), (40, 132, 8), (104, 150, -14))
    )
    with open(os.path.join(OUT, f'motif-pattes-{mode}.svg'), 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g opacity="{".09" if mode == "jour" else ".07"}">{tile}</g></svg>\n')

stars = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" opacity="{o}"/>' for x, y, r, o in
                ((14, 22, 1.2, .7), (70, 8, .8, .5), (122, 40, 1.4, .8), (180, 18, .9, .5), (40, 90, .7, .4), (150, 120, 1.1, .6),
                 (96, 160, .8, .5), (20, 170, 1.3, .7), (190, 180, .7, .4), (64, 128, .6, .35)))
with open(os.path.join(OUT, 'etoiles.svg'), 'w') as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">{stars}</svg>\n')
print('ok')
