"""Offline, dependency-free ISO flag audit for the Android release build.

The manifest is pinned to lipis/flag-icons 4x3 SVG files at the commit
specified in scripts/flag_reference.json. No network access is required.
It protects both the SVG content and every alpha-3 -> alpha-2 mapping.
"""
from hashlib import sha1
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FLAGS = ROOT / 'app/src/main/assets/flags'
reference = json.loads((ROOT / 'scripts/flag_reference.json').read_text(encoding='utf-8'))
countries = json.loads((ROOT / 'data/countries.json').read_text(encoding='utf-8'))['countries']
expected_iso = reference['iso_alpha3_to_alpha2']
expected_hashes = reference['svg_git_blob_sha1']

assert reference['source'] == 'lipis/flag-icons'
assert len(reference['source_commit']) == 40
mapped = [c for c in countries if c['mapped'] and re.fullmatch(r'[A-Z]{2}', c.get('code', ''))]
actual_iso = {c['id']: c['code'] for c in mapped}
assert len(actual_iso) == len(mapped), 'Duplicate country ISO alpha-3 key'
assert actual_iso == expected_iso, 'Country code changed or a country was missed'
codes = [c['code'].lower() for c in mapped]
assert len(codes) == len(set(codes)), 'Two countries assigned the same SVG flag'
assert len(codes) == len(expected_hashes) == 238, 'Incomplete country flag audit'
assert set(codes) == set(expected_hashes), 'Country flags missing from reference'
assert {f.stem for f in FLAGS.glob('*.svg')} == set(codes), 'Unknown or missing SVG flag'

for code in sorted(codes):
    file = FLAGS / (code + '.svg')
    raw = file.read_bytes()
    git_blob = sha1(('blob %d\0' % len(raw)).encode('ascii') + raw).hexdigest()
    assert git_blob == expected_hashes[code], (
        'WRONG FLAG DATA: %s does not match upstream SVG SHA-1' % code
    )
    root = ET.fromstring(raw)
    assert root.tag == '{http://www.w3.org/2000/svg}svg', 'Not an SVG: ' + code
    assert root.get('id') == 'flag-icons-' + code, 'Wrong ISO icon id: ' + code
    viewbox = root.get('viewBox')
    assert viewbox and len(viewbox.split()) == 4, 'No viewBox: ' + code
    assert all(float(v) > 0 for v in viewbox.split()[2:]), 'Invalid geometry: ' + code

# Visually distinct flags that cannot be mixed up by an incorrect ISO mapping.
must_match = {
    'AUT': 'AT', 'AUS': 'AU', 'NLD': 'NL', 'FRA': 'FR',
    'GBR': 'GB', 'USA': 'US', 'TUR': 'TR', 'SAU': 'SA',
    'MCO': 'MC', 'NPL': 'NP', 'VAT': 'VA',
    'LUX': 'LU', 'PLW': 'PW', 'KIR': 'KI'
}
for cid, iso in must_match.items():
    assert actual_iso.get(cid) == iso, 'Wrong flag assigned to %s' % cid

def svg_text(iso):
    return (FLAGS / (iso.lower() + '.svg')).read_text(encoding='utf-8')

nl = svg_text('NL')
assert '#ae1c28' in nl and '#21468b' in nl
assert nl.index('#ae1c28') < nl.index('M0 160') < nl.index('#21468b')
at = svg_text('AT')
assert '#c8102e' in at and 'M0 160h640v160' in at
fr = svg_text('FR')
assert '#000091' in fr and '#e1000f' in fr
assert fr.index('#000091') < fr.index('M213.3') < fr.index('#e1000f')
us = svg_text('US')
assert 'marker-mid="url(#us-a)"' in us and '#192f5d' in us
au = svg_text('AU')
assert '#00008B' in au and 'flag-icons-au' in au
assert 'flag-icons-gb' in svg_text('GB'), 'UK flag is missing'

print('Verified %d ISO mappings and %d upstream-identical SVG flags.' %
      (len(actual_iso), len(codes)))
print('SVG content mismatches: 0. Missing files: 0. Duplicate ISO codes: 0.')
