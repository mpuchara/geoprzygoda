"""Precompose the 1:50m world flag map as a transparent PNG.
Android WebView sometimes paints PNGs within SVG patterns or clip paths as blank.
Here we apply exact country masks during the build, not on the phone.
The original selectable SVG paths stay in place for touch and border lines.
"""
from __future__ import annotations
from io import BytesIO
from pathlib import Path
import json
import math
import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

import cairosvg
from PIL import Image, ImageChops, ImageColor, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets"
WORLD_SIZE = 1080
SCALE = 2
COORDS = re.compile(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")
NS = {"svg": "http://www.w3.org/2000/svg"}


def extract_map():
    source = (ASSETS / "index.html").read_text(encoding="utf-8")
    start = source.find('<g id="countries">')
    assert start >= 0, "Missing country SVG group"
    end = source.find("</g>", start) + 4
    assert end > start + 4, "Incomplete country SVG group"
    root = ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' +
                         source[start:end] + "</svg>")
    return root.findall(".//svg:a", NS)


def flag_styles():
    source = (ASSETS / "features.js").read_text(encoding="utf-8")
    striped = re.search(r"const stripeOnlyCountries = new Set\(\[(.*?)\]\);", source, re.S)
    backgrounds = re.search(r"const emblemBackgrounds = new Map\(\[(.*?)\]\);", source, re.S)
    assert striped and backgrounds, "Flag fitting rules missing"
    stripes = set(re.findall(r"'([A-Z]{3})'", striped.group(1)))
    backdrop = dict(re.findall(r"\['([A-Z]{3})',\s*'([^']+)'\]", backgrounds.group(1)))
    return stripes, backdrop


def flag_tile(source, dimensions, stretch, background):
    """Keep every star, maple leaf and emblem visible inside its flag tile.

    ImageOps.fit previously cropped flag edges on irregular geographic pieces.
    Preserve the complete artwork instead, using a matching backing colour.
    Only flags consisting of plain stripes may safely stretch.
    """
    w, h = dimensions
    if stretch:
        return source.resize((w, h), Image.Resampling.LANCZOS)
    if background:
        backing = ImageColor.getrgb(background)
    else:
        # Match the flag's corner rather than showing a transparent gap.
        backing = source.convert("RGB").getpixel((0, 0))
    output = Image.new("RGBA", dimensions, backing + (255,))
    ratio = min(w / source.width, h / source.height)
    new_size = (max(1, round(source.width * ratio)),
                max(1, round(source.height * ratio)))
    icon = source.resize(new_size, Image.Resampling.LANCZOS)
    output.alpha_composite(icon, ((w - icon.width) // 2, (h - icon.height) // 2))
    return output


def individual_islands(d):
    """Split multi-island SVG paths into separate flag-sized geographic pieces.

    A single 1:50m path for NLD, ESP, PRT, KIR or MDV may span an ocean.
    Fitting one flag to that enormous bounding box gives islands one pixel
    of the flag. Group contained inner rings (lake holes) with their outer
    coast so their masks remain topologically valid.
    """
    rings = []
    for path in re.findall(r"M[^Z]+Z", d):
        points = [(float(x), float(y)) for x, y in COORDS.findall(path)]
        if len(points) < 3:
            continue
        bounds = [min(x for x,y in points), min(y for x,y in points),
                  max(x for x,y in points), max(y for x,y in points)]
        rings.append((path, points, bounds))
    if len(rings) < 2:
        return [d]

    def contains(polygon, point):
        x,y = point
        inside=False
        for a,b in zip(polygon, polygon[1:]+polygon[:1]):
            if (a[1]>y)!=(b[1]>y) and x < ((b[0]-a[0])*(y-a[1]) /
                                                  (b[1]-a[1]) + a[0]):
                inside=not inside
        return inside

    parents={}
    for i,(_,points,b) in enumerate(rings):
        area=(b[2]-b[0])*(b[3]-b[1])
        best=None
        best_area=float("inf")
        for j,(_,other,container) in enumerate(rings):
            if i==j: continue
            other_area=(container[2]-container[0])*(container[3]-container[1])
            if other_area <= area + 1e-8 or other_area >= best_area:
                continue
            if (container[0] <= b[0] and container[1] <= b[1] and
                container[2] >= b[2] and container[3] >= b[3] and
                contains(other,points[0])):
                best, best_area = j, other_area
        if best is not None:
            parents[i]=best

    components={}
    for i,(path,_,_) in enumerate(rings):
        root=i
        seen=set()
        while root in parents and root not in seen:
            seen.add(root)
            root=parents[root]
        components.setdefault(root,[]).append(path)
    return ["".join(paths) for paths in components.values()]


def paint_piece(world, source, d, stretch, background, country_id):
    points = [(float(x), float(y)) for x, y in COORDS.findall(d)]
    if not points:
        return False
    left = max(0, math.floor(min(x for x, y in points) * SCALE))
    top = max(0, math.floor(min(y for x, y in points) * SCALE))
    right = min(WORLD_SIZE * SCALE, math.ceil(max(x for x, y in points) * SCALE))
    bottom = min(WORLD_SIZE * SCALE, math.ceil(max(y for x, y in points) * SCALE))
    w, h = right - left, bottom - top
    if w <= 0 or h <= 0:
        return False
    # Crop before drawing the mask instead of allocating a world-size bitmap
    # hundreds of times. CairoSVG's even-odd rule also preserves interior holes.
    view = f"{left / SCALE} {top / SCALE} {w / SCALE} {h / SCALE}"
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" '
           f'width="{w}" height="{h}">'
           f'<path d="{escape(d)}" fill="#fff" fill-rule="evenodd"/></svg>')
    png = cairosvg.svg2png(bytestring=svg.encode("utf-8"),
                          output_width=w, output_height=h)
    mask = Image.open(BytesIO(png)).convert("RGBA").getchannel("A")
    # Small islands must not repeat a tiny, unreadable flag emblem.
    # Keep their actual coastlines and country colour instead.
    # Canada was explicitly approved by the player, so preserve its render.
    if (w < 14 or h < 14) and country_id != "CAN":
        color = ImageColor.getrgb(background) if background else source.convert("RGB").getpixel((0, 0))
        tile = Image.new("RGBA", (w, h), color + (255,))
    else:
        tile = flag_tile(source, (w, h), stretch, background)
    tile.putalpha(ImageChops.multiply(tile.getchannel('A'), mask))
    world.alpha_composite(tile, (left, top))
    return True


def main():
    countries = json.loads((ROOT / "data/countries.json").read_text(encoding="utf-8"))
    country_ids = {c["id"]: c["code"].lower()
                   for c in countries["countries"] if c["mapped"] and
                   re.fullmatch("[A-Z]{2}", c.get("code", ""))}
    stripes, backgrounds = flag_styles()
    world = Image.new("RGBA", (WORLD_SIZE * SCALE, WORLD_SIZE * SCALE), (0, 0, 0, 0))
    rendered_ids = set()
    rendered_shapes = 0
    for anchor in extract_map():
        country_id = anchor.get("data-country")
        code = country_ids.get(country_id)
        if not code:
            continue
        texture = ASSETS / "flag-textures" / (code + ".png")
        if not texture.is_file():
            raise RuntimeError(f"Missing PNG texture {texture}")
        flag = Image.open(texture).convert("RGBA")
        for element in anchor.findall("svg:path", NS):
            for island in individual_islands(element.get("d", "")):
                if paint_piece(world, flag, island, country_id in stripes,
                               backgrounds.get(country_id), country_id):
                    rendered_shapes += 1
                    rendered_ids.add(country_id)
    if len(rendered_ids) < 230:
        raise RuntimeError(f"Incomplete flag raster: {len(rendered_ids)} countries")
    output = ASSETS / "flag-overview.png"
    world.save(output, optimize=True)
    data = {"size": WORLD_SIZE, "scale": SCALE, "countries": len(rendered_ids),
            "pieces": rendered_shapes, "dimensions": [WORLD_SIZE * SCALE] * 2}
    (ASSETS / "flag-overview.json").write_text(json.dumps(data) + "\n", encoding="utf-8")
    print(f"GeoPrzygoda world flags: {data}; PNG bytes {output.stat().st_size:,}")


if __name__ == "__main__":
    main()
