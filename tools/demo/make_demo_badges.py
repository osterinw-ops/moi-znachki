"""Генерирует демо-значки (оригинальные рисунки) как «сканы» в catalog_src/.

Для настоящего каталога этот скрипт не нужен: кладите фото/сканы значков
в catalog_src/<id>.png и описание в catalog_src/meta.json.
"""
import json
import math
import os
import subprocess
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "catalog_src"
os.makedirs(OUT, exist_ok=True)


def star_points(cx, cy, r1, r2, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(rot + i * 180 / n)
        pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
    return " ".join(pts)


def hexagon(cx, cy, r):
    return " ".join(
        f"{cx + r * math.cos(math.radians(60 * i - 90)):.1f},{cy + r * math.sin(math.radians(60 * i - 90)):.1f}"
        for i in range(6)
    )


RIM = 'stroke="#c9a227" stroke-width="10"'  # «латунный» кант

SHAPES = {
    "circle": lambda fill: f'<circle cx="200" cy="200" r="180" fill="{fill}" {RIM}/>',
    "hex": lambda fill: f'<polygon points="{hexagon(200, 200, 185)}" fill="{fill}" {RIM}/>',
    "shield": lambda fill: f'<path d="M200 20 L360 70 L350 220 Q330 330 200 385 Q70 330 50 220 L40 70 Z" fill="{fill}" {RIM}/>',
    "square": lambda fill: f'<rect x="30" y="30" width="340" height="340" rx="60" fill="{fill}" {RIM}/>',
    "star": lambda fill: f'<polygon points="{star_points(200, 210, 190, 95)}" fill="{fill}" {RIM} stroke-linejoin="round"/>',
}

ROCKET = """
<g transform="translate(200 205) rotate(35)">
  <path d="M0 -120 Q40 -70 38 30 L-38 30 Q-40 -70 0 -120 Z" fill="#eeeeee" stroke="#333" stroke-width="5"/>
  <circle cx="0" cy="-40" r="18" fill="#4fc3f7" stroke="#333" stroke-width="5"/>
  <path d="M-38 0 L-70 55 L-38 40 Z M38 0 L70 55 L38 40 Z" fill="#e53935" stroke="#333" stroke-width="5"/>
  <path d="M-22 32 L0 95 L22 32 Z" fill="#ffb300"/>
</g>"""

PLANET = """
<circle cx="200" cy="200" r="80" fill="#ff8a65" stroke="#4e342e" stroke-width="5"/>
<path d="M130 175 Q200 160 270 180" stroke="#bf360c" stroke-width="10" fill="none"/>
<ellipse cx="200" cy="205" rx="150" ry="38" fill="none" stroke="#ffe082" stroke-width="14" transform="rotate(-18 200 205)"/>
<circle cx="95" cy="95" r="7" fill="#fff"/><circle cx="310" cy="110" r="5" fill="#fff"/><circle cx="300" cy="300" r="6" fill="#fff"/>"""

RED_STAR = f"""<polygon points="{star_points(200, 205, 120, 50)}" fill="#ffd54f" stroke="#7a5c00" stroke-width="6" stroke-linejoin="round"/>
<text x="200" y="350" font-family="DejaVu Sans" font-weight="bold" font-size="36" text-anchor="middle" fill="#ffd54f">1961</text>"""

MOON = """
<circle cx="190" cy="200" r="110" fill="#fff59d"/>
<circle cx="235" cy="175" r="100" fill="#1a237e"/>
<circle cx="140" cy="230" r="14" fill="#fbc02d"/><circle cx="120" cy="170" r="9" fill="#fbc02d"/>
<polygon points="290,250 300,275 325,280 305,295 312,320 290,305 268,320 275,295 255,280 280,275" fill="#fff"/>"""

SATELLITE = """
<g transform="rotate(-25 200 200)">
<rect x="165" y="170" width="70" height="60" rx="8" fill="#b0bec5" stroke="#263238" stroke-width="5"/>
<rect x="55" y="180" width="100" height="40" fill="#1565c0" stroke="#263238" stroke-width="5"/>
<rect x="245" y="180" width="100" height="40" fill="#1565c0" stroke="#263238" stroke-width="5"/>
<path d="M80 180 V220 M105 180 V220 M130 180 V220 M270 180 V220 M295 180 V220 M320 180 V220" stroke="#90caf9" stroke-width="4"/>
<path d="M200 170 V120" stroke="#263238" stroke-width="6"/><circle cx="200" cy="112" r="12" fill="#e53935"/>
</g>"""

BALL = """
<circle cx="200" cy="200" r="115" fill="#fff" stroke="#111" stroke-width="7"/>
<polygon points="200,150 245,182 228,235 172,235 155,182" fill="#111"/>
<path d="M200 150 V88 M245 182 L305 165 M228 235 L262 290 M172 235 L138 290 M155 182 L95 165" stroke="#111" stroke-width="7"/>"""

CUP = """
<path d="M130 90 H270 V150 Q270 240 200 255 Q130 240 130 150 Z" fill="#ffca28" stroke="#6d4c00" stroke-width="6"/>
<path d="M130 110 Q75 110 85 160 Q95 205 140 200 M270 110 Q325 110 315 160 Q305 205 260 200" fill="none" stroke="#6d4c00" stroke-width="10"/>
<rect x="185" y="255" width="30" height="40" fill="#ffca28" stroke="#6d4c00" stroke-width="6"/>
<rect x="140" y="295" width="120" height="30" rx="5" fill="#8d6e63" stroke="#4e342e" stroke-width="6"/>
<text x="200" y="190" font-family="DejaVu Sans" font-weight="bold" font-size="54" text-anchor="middle" fill="#6d4c00">1</text>"""

STICKS = """
<path d="M110 90 L250 290 L300 290 L300 310 L240 310 L95 105 Z" fill="#8d6e63" stroke="#3e2723" stroke-width="5"/>
<path d="M290 90 L150 290 L100 290 L100 310 L160 310 L305 105 Z" fill="#a1887f" stroke="#3e2723" stroke-width="5"/>
<ellipse cx="200" cy="320" rx="38" ry="14" fill="#111"/>"""

BIKE = """
<circle cx="125" cy="245" r="60" fill="none" stroke="#212121" stroke-width="10"/>
<circle cx="285" cy="245" r="60" fill="none" stroke="#212121" stroke-width="10"/>
<path d="M125 245 L180 160 L265 160 L285 245 M180 160 L215 245 L265 160 M215 245 L125 245 M170 140 H205 M265 160 L255 125 H285" fill="none" stroke="#d32f2f" stroke-width="10" stroke-linejoin="round"/>"""

KNIGHT = """
<path d="M140 320 H270 L262 290 H240 Q225 230 255 190 Q285 150 255 110 Q230 85 190 90 L170 75 L165 100 Q120 130 120 175 L150 185 Q170 175 185 180 Q150 230 160 290 H148 Z" fill="#212121" stroke="#fafafa" stroke-width="6" stroke-linejoin="round"/>
<circle cx="200" cy="125" r="8" fill="#fafafa"/>"""

CODE = """
<text x="200" y="235" font-family="DejaVu Sans Mono" font-weight="bold" font-size="110" text-anchor="middle" fill="#69f0ae">&lt;/&gt;</text>
<text x="200" y="310" font-family="DejaVu Sans" font-size="34" text-anchor="middle" fill="#ffffff">DEV 2019</text>"""

GEAR_TEETH = "".join(
    f'<rect x="188" y="70" width="24" height="40" rx="4" fill="#fff" transform="rotate({i * 45} 200 200)"/>' for i in range(8)
)
GEAR = GEAR_TEETH + """
<circle cx="200" cy="200" r="95" fill="#fff"/><circle cx="200" cy="200" r="40" fill="#ef6c00"/>"""

CLOUD = """
<path d="M110 260 Q60 260 65 215 Q70 175 115 178 Q120 120 180 120 Q230 120 245 165 Q300 150 320 200 Q340 260 285 260 Z" fill="#fff" stroke="#0277bd" stroke-width="7"/>
<path d="M200 190 V240 M180 220 L200 242 L220 220" stroke="#0277bd" stroke-width="9" fill="none" stroke-linecap="round"/>"""

BUG = """
<ellipse cx="200" cy="215" rx="65" ry="85" fill="#212121"/>
<circle cx="200" cy="125" r="35" fill="#212121"/>
<path d="M200 140 V295" stroke="#76ff03" stroke-width="6"/>
<path d="M140 180 L90 160 M135 220 L80 220 M140 260 L90 285 M260 180 L310 160 M265 220 L320 220 M260 260 L310 285 M185 95 L170 65 M215 95 L230 65" stroke="#212121" stroke-width="9" stroke-linecap="round"/>"""

BRACES = """
<text x="200" y="245" font-family="DejaVu Sans Mono" font-weight="bold" font-size="110" text-anchor="middle" fill="#ffffff">{ }</text>
<circle cx="200" cy="200" r="14" fill="#ffeb3b"/>"""

BADGES = [
    # id, shape, fill, art, name, series, year
    ("space-rocket", "circle", "#0d47a1", ROCKET, "Ракета «Восток»", "Космос", 1967),
    ("space-planet", "hex", "#4a148c", PLANET, "Сатурн", "Космос", 1975),
    ("space-star", "circle", "#c62828", RED_STAR, "Звезда 1961", "Космос", 1961),
    ("space-moon", "shield", "#1a237e", MOON, "Луна", "Космос", 1970),
    ("space-sat", "square", "#263238", SATELLITE, "Спутник связи", "Космос", 1965),
    ("sport-ball", "circle", "#2e7d32", BALL, "Футбол", "Спорт", 1980),
    ("sport-cup", "shield", "#1565c0", CUP, "Кубок чемпиона", "Спорт", 1984),
    ("sport-hockey", "hex", "#eceff1", STICKS, "Хоккей", "Спорт", 1979),
    ("sport-bike", "circle", "#fff8e1", BIKE, "Велогонка", "Спорт", 1982),
    ("sport-chess", "square", "#d7ccc8", KNIGHT, "Шахматный турнир", "Спорт", 1977),
    ("it-code", "hex", "#212121", CODE, "DevConf 2019", "IT-конференции", 2019),
    ("it-gear", "circle", "#ef6c00", GEAR, "DevOps Day", "IT-конференции", 2021),
    ("it-cloud", "square", "#81d4fa", CLOUD, "Cloud Summit", "IT-конференции", 2022),
    ("it-bug", "shield", "#64dd17", BUG, "Bug Hunt", "IT-конференции", 2020),
    ("it-braces", "star", "#7b1fa2", BRACES, "JS Meetup", "IT-конференции", 2023),
]

meta = []
for bid, shape, fill, art, name, series, year in BADGES:
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="560" viewBox="-80 -80 560 560">'
        '<rect x="-80" y="-80" width="560" height="560" fill="#f3efe6"/>'  # «бумага» скана
        '<ellipse cx="208" cy="215" rx="185" ry="185" fill="#00000022"/>'  # мягкая тень
        f"{SHAPES[shape](fill)}{art}</svg>"
    )
    svg_path = os.path.join(OUT, f"{bid}.svg")
    with open(svg_path, "w") as f:
        f.write(svg)
    subprocess.run(["rsvg-convert", "-w", "560", "-h", "560", svg_path, "-o", os.path.join(OUT, f"{bid}.png")], check=True)
    os.remove(svg_path)
    meta.append({"id": bid, "name": name, "series": series, "year": year})

with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)
print(f"{len(meta)} demo badges -> {OUT}")
