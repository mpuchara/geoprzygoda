"""Rebuild the offline SVG and all map coordinates from bundled Natural Earth data."""
import html
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'app/src/main/assets/index.html'
DATABASE = ROOT / 'data/countries.json'
WORLD_SIZE = 1080
MAX_LATITUDE = math.degrees(math.atan(math.sinh(math.pi)))
PALETTE = ['#a8d77e', '#74cdb1', '#edca77', '#9bc9e5', '#bcb1df', '#d8b88b', '#8cc8a3']
# Parts of these countries are too far apart for one SVG flag pattern.
SPLIT_FLAG_COUNTRIES = {'FRA', 'USA', 'AUS'}


def project(lon, lat):
    """Mercator: identical local scale in both axes, including around Poland."""
    lat = max(-MAX_LATITUDE, min(MAX_LATITUDE, lat))
    return ((lon + 180) * WORLD_SIZE / 360,
            WORLD_SIZE / 2 - WORLD_SIZE / (2 * math.pi) * math.asinh(math.tan(math.radians(lat))))


def projected_bounds(west, south, east, north):
    x0, y0 = project(west, north)
    x1, y1 = project(east, south)
    return [round(n, 3) for n in (x0, y0, x1, y1)]


def svg_path(polygons):
    return ''.join('M' + 'L'.join(f'{x:.2f},{y:.2f}' for x, y in ring) + 'Z'
                   for polygon in polygons for ring in polygon)


def rebuild():
    source = json.loads((ROOT / 'data/world-50m.json').read_text())
    database = json.loads(DATABASE.read_text())
    countries = database['countries']
    by_id = {c['id']: c for c in countries}
    by_code = {c['code']: c for c in countries if c['code']}
    # Retain the location of small territories which have no polygon in Natural Earth.
    # Read coordinates in the old projection on the first run, or reuse Mercator later.
    for c in countries:
        if database.get('projection') != 'Mercator':
            lon, lat = c['x'] / 3 - 180, 90 - c['y'] / 3
            c['x'], c['y'] = [round(n, 3) for n in project(lon, lat)]
        c['mapped'] = False
        c['b'] = [c['x'] - 2, c['y'] - 2, c['x'] + 2, c['y'] + 2]

    features = []
    for feature in source['features']:
        if feature['properties']['ADM0_A3'] != 'IOA':
            features.append(feature)
            continue
        # Natural Earth groups Christmas and Cocos as Indian Ocean Territories.
        # Keep them individually selectable, as in the atlas descriptions.
        geometry = feature['geometry']
        polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        for polygon in polygons:
            key = 'CCK' if polygon[0][0][0] < 100 else 'CXR'
            c = by_id[key]
            properties = dict(feature['properties'], ADM0_A3=key, ISO_A3_EH=key, ISO_A2_EH=c['code'],
                              LABEL_X=c['x'] / 3 - 180,
                              LABEL_Y=math.degrees(math.atan(math.sinh((540 - c['y']) * math.pi / 540))))
            features.append({'properties': properties, 'geometry': {'type': 'Polygon', 'coordinates': polygon}})

    shapes, neutral = {}, []
    for feature in features:
        p, geometry = feature['properties'], feature['geometry']
        coordinates = geometry['coordinates']
        if geometry['type'] == 'Polygon':
            coordinates = [coordinates]
        polygons = [[[project(*point[:2]) for point in ring] for ring in polygon]
                    for polygon in coordinates]
        d = svg_path(polygons)
        if p['CONTINENT'] == 'Antarctica':
            neutral.append(f'<path d="{d}" fill="#d5e3ea" opacity=".8" stroke="#effaff" stroke-width=".7" vector-effect="non-scaling-stroke"/>')
            continue
        c = by_id.get(p['ADM0_A3']) or by_id.get(p['ISO_A3_EH']) or by_code.get(p['ISO_A2_EH'])
        if not c:
            # Siachen is an indeterminate area, rather than an extra country.
            neutral.append(f'<path d="{d}" fill="#d5e3ea" class="land"/>')
            continue
        lx, ly = project(p['LABEL_X'], p['LABEL_Y'])
        boxes = [[min(x for x, y in poly[0]), min(y for x, y in poly[0]),
                  max(x for x, y in poly[0]), max(y for x, y in poly[0])] for poly in polygons]
        box = min(boxes, key=lambda b: (not (b[0] <= lx <= b[2] and b[1] <= ly <= b[3]),
                                       (lx - (b[0] + b[2]) / 2) ** 2 + (ly - (b[1] + b[3]) / 2) ** 2))
        old_box = c['b']
        if not c['mapped'] or ((box[2] - box[0]) * (box[3] - box[1]) >
                               (old_box[2] - old_box[0]) * (old_box[3] - old_box[1])):
            c['x'], c['y'] = round(lx, 3), round(ly, 3)
            c['b'] = [round(n, 3) for n in box]
        c['mapped'] = True
        fill = PALETTE[(p['MAPCOLOR7'] - 1) % len(PALETTE)]
        shape = shapes.setdefault(c['id'], {'paths': [], 'parts': [], 'fill': fill})
        shape['paths'].append(d)
        if c['id'] in SPLIT_FLAG_COUNTRIES:
            shape['parts'].extend((svg_path([poly]), box) for poly, box in zip(polygons, boxes))

    paths = []
    for key, shape in shapes.items():
        name, d, fill = html.escape(by_id[key]['n'], quote=True), ''.join(shape['paths']), shape['fill']
        if key not in SPLIT_FLAG_COUNTRIES:
            paths.append(f'<a href="#info-{key}" class="country-link" data-country="{key}" aria-label="{name}"><path class="land" id="land-{key}" d="{d}" fill="{fill}" fill-rule="evenodd"><title>{name}</title></path></a>')
            continue
        parts = shape['parts']
        c = by_id[key]
        def part_rank(part):
            b = part[1]
            return (b[0] <= c['x'] <= b[2] and b[1] <= c['y'] <= b[3],
                    (b[2] - b[0]) * (b[3] - b[1]))
        primary = max(range(len(parts)), key=lambda i: part_rank(parts[i]))
        ordered = [parts[primary]] + [part for i, part in enumerate(parts) if i != primary]
        components = []
        for i, (part_d, _) in enumerate(ordered):
            id_attr = f' id="land-{key}"' if i == 0 else ''
            class_attr = 'land' if i == 0 else 'land flag-fragment'
            components.append(f'<path class="{class_attr}"{id_attr} d="{part_d}" fill="{fill}" fill-rule="evenodd"><title>{name}</title></path>')
        paths.append(f'<a href="#info-{key}" class="country-link" data-country="{key}" aria-label="{name}">{"".join(components)}</a>')

    markers, labels = [], []
    for c in countries:
        key, name, x, y = c['id'], html.escape(c['n'], quote=True), c['x'], c['y']
        b = c['b']
        if not c['mapped'] or (b[2] - b[0]) * (b[3] - b[1]) < 4:
            markers.append(f'<a href="#info-{key}" class="country-link small-marker" data-country="{key}" aria-label="{name}"><circle class="dot-hit" cx="{x}" cy="{y}" r="8"/><circle class="dot" cx="{x}" cy="{y}" r="2.3"><title>{name}</title></circle></a>')
        if c['mapped']:
            labels.append(f'<text x="{x}" y="{y}" data-label="{key}" class="map-label" style="display:none">{name}</text>')

    grid = []
    for lon in range(-180, 181, 30):
        x, _ = project(lon, 0)
        grid.append(f'<path d="M{x:.2f},0V1080"/>')
    for lat in range(-60, 61, 30):
        _, y = project(0, lat)
        grid.append(f'<path d="M0,{y:.2f}H1080"/>')

    svg = ('<g class="graticule">' + ''.join(grid) + '</g><g id="antarctica">' + ''.join(neutral)
           + '</g><g id="countries">' + ''.join(paths) + '</g><g id="small-countries">' + ''.join(markers)
           + '</g><g id="country-labels" aria-hidden="true">' + ''.join(labels) + '</g>')
    asset = ASSET.read_text()
    asset = re.sub(r'(<svg id="world-map"[^>]*>).*?</svg>', lambda m: m[1] + svg + '</svg>', asset, count=1, flags=re.S)
    world_bounds = projected_bounds(-180, -82, 180, 84)
    asset = re.sub(r'(<svg id="world-map"[^>]*viewBox=")[^"]+',
                   lambda m: m[1] + ' '.join(str(n) for n in (world_bounds[0], world_bounds[1], world_bounds[2] - world_bounds[0], world_bounds[3] - world_bounds[1])), asset, count=1)
    region_boxes = {
        'world': world_bounds,
        'eu': projected_bounds(-25, 31, 45, 72),
        'af': projected_bounds(-20, -38, 55, 39),
        'as': projected_bounds(23, -16, 180, 78),
        'na': projected_bounds(-171, 5, -30, 84),
        'sa': projected_bounds(-84, -57, -30, 16),
        'oc': projected_bounds(104, -55, 180, 0),
    }
    asset = re.sub(r'const bounds=\{[^;]+;', 'const bounds=' + json.dumps(region_boxes, separators=(',', ':')) + ';', asset, count=1)
    payload = json.dumps(countries, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    asset = re.sub(r'const COUNTRY_DATA=.*?;\n', lambda m: 'const COUNTRY_DATA=' + payload + ';\n', asset, count=1)
    ASSET.write_text(asset)
    database['projection'] = 'Mercator'
    database['geometry_source'] = source['url']
    DATABASE.write_text(json.dumps(database, ensure_ascii=False, indent=2) + '\n')
    print(f'Rebuilt {len(paths)} country shapes in Mercator; Poland has {sum(len(ring) for f in source["features"] if f["properties"]["ADM0_A3"] == "POL" for ring in f["geometry"]["coordinates"])} boundary points.')


if __name__ == '__main__':
    rebuild()
