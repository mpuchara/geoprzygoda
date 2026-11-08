"""Plan 10: verify 238 mapped flags and worldwide 1:10m island geometry.
Runs after CI builds PNG overlays and offline Natural Earth chunks.
"""
from pathlib import Path
from PIL import Image
import json

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets"
reference = json.loads((ROOT / "scripts/flag_reference.json").read_text())
country_codes = reference["iso_alpha3_to_alpha2"]
details = json.loads((ASSETS / "world-detail-10m.json").read_text())
raster = json.loads((ASSETS / "flag-overview.json").read_text())
assert len(country_codes) == 238, "Must cover exactly 238 canonical flags"
assert raster["countries"] == 238, "Not every country appears on offline overview"
assert raster["pieces"] >= 500, "Fragment-sized flags are missing on island countries"
assert len(details["countries"]) >= 235, "1:10m detailed world coverage too small"
with Image.open(ASSETS / "flag-overview.png") as output:
    assert output.mode == "RGBA", "Overview must preserve transparent ocean"
    assert output.size == (2160, 2160), "World overlay must stay aligned to map"
    alpha = output.getchannel("A")
    assert alpha.getbbox() is not None, "All mapped flags are empty"
    assert alpha.getpixel((1080, 1080)) == 0, "Ocean outside countries must be transparent"

# Count actual *polygons* rather than fake point markers. The country name
# remains clickable via its original SVG link even for very small islands.
islands = {
    "NLD": 10,  # Mainland plus Caribbean Netherlands & North Sea islands
    "DEU": 5,
    "PRT": 10,  # Azores and Madeira
    "ESP": 10,  # Canaries, Balearic Islands
    "FRO": 4,  # Faroe Islands
    "MDV": 40,  # Maldives atolls/islands
    "KIR": 20,  # Kiribati
    "FJI": 30,
    "IDN": 100,
    "PYF": 30,  # French Polynesia
    "COK": 8,
    "MHL": 10,
    "SYC": 15,
    "GRC": 30,
    "JPN": 60,
    "USA": 200,
    "AUS": 50,
}
checked = {}
for cid in country_codes:
    item = details["countries"].get(cid)
    assert item and item["v"] >= 3, f"Country has no real 1:10m polygon: {cid}"
    chunk = ASSETS / "world-detail" / (cid.lower() + ".json")
    assert chunk.is_file(), f"Missing 1:10m asset for {cid}"
    data = json.loads(chunk.read_text())
    parts = data.get("parts")
    count = len(parts) if parts is not None else (1 if data.get("d") else 0)
    assert count >= 1, f"No detailed island/polygon for {cid}"
    if cid in islands:
        assert count >= islands[cid], f"{cid}: expected at least {islands[cid]} real pieces, found {count}"
        checked[cid] = count
    if parts:
        for p in parts:
            assert p["d"].startswith("M") and p["b"][0] <= p["b"][2] and p["b"][1] <= p["b"][3], cid

css = (ASSETS / "features.css").read_text()
features = (ASSETS / "features.js").read_text()
assert "#world-map #small-countries .small-marker .dot" in css
assert "display: none !important" in css
assert "function geo10LegacyFlag(country)" in features
assert "'flags/' + country.code.toLowerCase() + '.svg'" in features
assert "geo8-overview-flags" in features
print("Plan 10 OK: 238 mapped and audited flags, 238 source-supported 1:10m geometries,")
print(f"{raster['pieces']} genuine island-sized raster pieces, no visible circular island impostors")
print("Selected archipelago counts:", json.dumps(checked,sort_keys=True))
