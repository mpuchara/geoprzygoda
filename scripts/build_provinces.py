"""Generate real first-order provinces for GeoPrzygoda's offline battle map.

Natural Earth admin-1 geometry is bundled at APK build time, never requested
by the Android app. Its country borders are *still* drawn by the independent
admin-0 layer; province polygons are always clipped to those borders.

The dataset doesn't cover every microstate or island. Such countries retain
the clearly labelled fictional-sector fallback in battle.js.
"""
import json
from collections import defaultdict
from pathlib import Path
from urllib.request import Request, urlopen

from build_world_detail import project, ROOT

SOURCE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19"
SOURCE = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    + SOURCE_COMMIT + "/geojson/ne_10m_admin_1_states_provinces.geojson"
)
DEST = ROOT / "app/src/main/assets/world-provinces-10m.json"


def ring_area(points):
    return sum(
        a[0] * b[1] - b[0] * a[1]
        for a, b in zip(points, points[1:] + points[:1])
    ) / 2


def polygon_geometry(polygon):
    paths, all_points, total_area, edges = [], [], 0.0, []
    for ring_index, ring in enumerate(polygon):
        points = []
        for lon, lat, *_ in ring:
            xy = project(lon, lat)
            if not points or xy != points[-1]:
                points.append(xy)
        if len(points) >= 2 and points[0] == points[-1]:
            points.pop()
        if len(points) < 3:
            continue
        all_points.extend(points)
        signed_area = abs(ring_area(points))
        total_area += signed_area * (1 if ring_index == 0 else -1)
        paths.append("M" + "L".join(f"{x:.3f},{y:.3f}" for x, y in points) + "Z")
        for a, b in zip(points, points[1:] + points[:1]):
            if a != b:
                edges.append(tuple(sorted((a, b))))
    if not paths:
        return None
    return {
        "d": "".join(paths),
        "b": [
            min(p[0] for p in all_points), min(p[1] for p in all_points),
            max(p[0] for p in all_points), max(p[1] for p in all_points),
        ],
        "area": max(.0001, total_area),
        "edges": edges,
    }


def main():
    countries = json.loads((ROOT / "data/countries.json").read_text(encoding="utf-8"))["countries"]
    mapped = {c["id"] for c in countries if c.get("mapped")}
    iso2 = {c["code"]: c["id"] for c in countries if c.get("mapped") and c.get("code")}
    request = Request(SOURCE, headers={"User-Agent": "GeoPrzygoda-provinces-builder"})
    with urlopen(request, timeout=120) as response:
        source = json.load(response)
    province_groups = defaultdict(list)
    edge_groups = defaultdict(list)

    for feature in source["features"]:
        props = feature.get("properties") or {}
        cid = str(props.get("adm0_a3") or props.get("ADM0_A3") or "")
        if cid not in mapped:
            a2 = str(props.get("iso_a2") or props.get("ISO_A2") or "")
            cid = iso2.get(a2, cid)
        if cid not in mapped:
            iso_code = str(props.get("iso_3166_2") or "")
            cid = iso2.get(iso_code.split("-")[0], cid)
        if cid not in mapped:
            continue
        geometry = feature.get("geometry") or {}
        kind = geometry.get("type")
        if kind not in ("Polygon", "MultiPolygon"):
            continue
        polygons = geometry["coordinates"] if kind == "MultiPolygon" else [geometry["coordinates"]]
        parts = [polygon_geometry(poly) for poly in polygons]
        parts = [part for part in parts if part]
        if not parts:
            continue
        box = [
            min(part["b"][0] for part in parts),
            min(part["b"][1] for part in parts),
            max(part["b"][2] for part in parts),
            max(part["b"][3] for part in parts),
        ]
        area = sum(part["area"] for part in parts)
        province = {
            "name": str(props.get("name") or props.get("name_en") or "Region")[:90],
            "d": "".join(part["d"] for part in parts),
            "b": box,
            "area": round(max(.0001, area), 3),
        }
        index = len(province_groups[cid])
        province_groups[cid].append(province)
        edge_groups[cid].append([edge for part in parts for edge in part["edges"]])

    result = {}
    for cid, provinces in province_groups.items():
        if not provinces:
            continue
        # Adjacent provinces share the same sampled Natural Earth boundary
        # segments. Topological neighbours help prevent isolated captures.
        edge_index = {}
        adjacency = [set() for _ in provinces]
        for i, edges in enumerate(edge_groups[cid]):
            for edge in edges:
                j = edge_index.get(edge)
                if j is None:
                    edge_index[edge] = i
                elif j != i:
                    adjacency[i].add(j)
                    adjacency[j].add(i)
        for i, province in enumerate(provinces):
            province["neighbors"] = sorted(adjacency[i])
        result[cid] = provinces

    if len(result.get("POL", [])) < 10 or len(result.get("BLR", [])) < 5:
        raise RuntimeError("Natural Earth admin-1 lacks expected Polish/Belarusian regions")
    DEST.write_text(json.dumps({
        "source": "Natural Earth 1:10m admin-1 states/provinces (public domain)",
        "source_commit": SOURCE_COMMIT,
        "projection": "Mercator 1080x1080, 3 decimal SVG precision",
        "countries": result,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Built {sum(map(len, result.values()))} real admin-1 regions "
          f"across {len(result)} countries; {DEST.stat().st_size:,} bytes.")


if __name__ == "__main__":
    main()
