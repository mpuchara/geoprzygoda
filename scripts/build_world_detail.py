"""Build an offline, high-detail Natural Earth 1:10m boundary layer.

The world atlas keeps its existing, fast 1:50m overview. During an Android
build, the 1:10m polygon paths are generated into one local JSON file, then
used only when zooming in. No network access is required by the installed app.

Source: Natural Earth public-domain 1:10m admin-0 countries (pinned commit).
"""
import json
import math
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "app/src/main/assets/world-detail-10m.json"
DB = ROOT / "data/countries.json"
SOURCE = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "ca96624a56bd078437bca8184e78163e5039ad19/"
    "geojson/ne_10m_admin_0_countries.geojson"
)
WORLD = 1080
MAX_LAT = math.degrees(math.atan(math.sinh(math.pi)))
# Plan 10: real disconnected land polygons for all countries and archipelagos.
# The Android client loads parts only near the visible viewport.


def project(lon, lat):
    lat = max(-MAX_LAT, min(MAX_LAT, lat))
    x = (lon + 180) * WORLD / 360
    y = WORLD / 2 - WORLD / (2 * math.pi) * math.asinh(math.tan(math.radians(lat)))
    return round(x, 3), round(y, 3)


def process_polygon(polygon):
    paths = []
    coords = []
    vertices = 0
    for ring in polygon:
        points = []
        for lon, lat, *_ in ring:
            xy = project(lon, lat)
            if not points or points[-1] != xy:
                points.append(xy)
        if len(points) >= 2 and points[0] == points[-1]:
            points.pop()
        if len(points) < 3:
            continue
        vertices += len(points)
        coords.extend(points)
        paths.append("M" + "L".join(f"{x:.3f},{y:.3f}" for x, y in points) + "Z")
    if not paths:
        return None
    box = [
        round(min(x for x, y in coords), 3),
        round(min(y for x, y in coords), 3),
        round(max(x for x, y in coords), 3),
        round(max(y for x, y in coords), 3)
    ]
    return {"d": "".join(paths), "b": box, "v": vertices}


def main():
    countries = json.loads(DB.read_text(encoding="utf-8"))["countries"]
    mapped = {c["id"]: c for c in countries if c.get("mapped")}
    by_iso2 = {c["code"]: c["id"] for c in countries if c.get("mapped") and c.get("code")}
    req = Request(SOURCE, headers={"User-Agent": "GeoPrzygoda-offline-map-builder"})
    with urlopen(req, timeout=120) as response:
        source = json.load(response)
    result = {}
    for feature in source["features"]:
        props = feature.get("properties") or {}
        id_ = (props.get("ADM0_A3") or props.get("ISO_A3_EH"))
        if id_ not in mapped:
            id_ = props.get("ISO_A3_EH")
        if id_ not in mapped:
            id_ = by_iso2.get(props.get("ISO_A2_EH"))
        if id_ not in mapped:
            continue
        geometry = feature["geometry"]
        polygons = (geometry["coordinates"] if geometry["type"] == "MultiPolygon"
                    else [geometry["coordinates"]])
        for polygon in polygons:
            part = process_polygon(polygon)
            if part:
                result.setdefault(id_, []).append(part)

    world = {}
    for id_, parts in result.items():
        # Keep main country paths and their detailed island coastlines. Existing
        # separate flag fragments for these three countries remain separate.
        bounds = [
            min(p["b"][0] for p in parts),
            min(p["b"][1] for p in parts),
            max(p["b"][2] for p in parts),
            max(p["b"][3] for p in parts)
        ]
        entry = {"b": bounds, "v": sum(p["v"] for p in parts)}
        if len(parts) > 1:
            entry["parts"] = [{"d": p["d"], "b": p["b"]} for p in parts]
        else:
            entry["d"] = parts[0]["d"]
        world[id_] = entry

    # The 1:50m atlas retains a few special islands/territories absent from the
    # 1:10m source. Those remain on the original map as a safe fallback.
    if len(world) < 220 or "NLD" not in world or "POL" not in world:
        raise RuntimeError(f"Not enough detailed boundaries: {len(world)}")

    # A tiny index exposes bounding boxes; Android loads detailed geometry
    # only for visible countries instead of parsing the entire world at once.
    detail_dir = DEST.parent / "world-detail"
    detail_dir.mkdir(parents=True, exist_ok=True)
    metadata = {}
    total = 0
    for cid, item in sorted(world.items()):
        chunk = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
        (detail_dir / (cid.lower() + ".json")).write_text(chunk, encoding="utf-8")
        total += len(chunk.encode("utf-8"))
        metadata[cid] = {"b": item["b"], "v": item["v"]}
    DEST.write_text(json.dumps({
        "source": "Natural Earth 1:10m Admin-0 countries (public domain)",
        "projection": "Mercator 1080x1080, 3 decimal SVG precision",
        "countries": metadata,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Built {len(world)} indexed high-resolution country outlines; "
          f"total vertices {sum(c['v'] for c in world.values()):,}; "
          f"detail chunks {total:,} bytes, index {DEST.stat().st_size:,} bytes.")



if __name__ == "__main__":
    main()
