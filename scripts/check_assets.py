"""Check the actual bundled game and native packaging contract before building."""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'app/src/main/assets/index.html'
text = ASSET.read_text(encoding='utf-8')


class GameParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.country_ids = set()
        self.description_ids = set()
        self.remote_assets = []

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        identity = attr.get('id')
        if identity:
            assert identity not in self.ids, f'Duplicate id: {identity}'
            self.ids.add(identity)
        if attr.get('class', '').split() and 'country-link' in attr['class'].split():
            self.country_ids.add(attr['data-country'])
        if identity and identity.startswith('info-'):
            self.description_ids.add(identity[5:])
        if tag in {'script', 'img', 'link', 'iframe'}:
            for key in ('src', 'href'):
                if attr.get(key, '').startswith(('http:', 'https:', '//')):
                    self.remote_assets.append(attr[key])


parser = GameParser()
parser.feed(text)
assert not parser.remote_assets, f'Offline assets must be bundled: {parser.remote_assets}'
assert len(parser.country_ids) >= 190, 'World map is missing countries'
assert parser.country_ids <= parser.description_ids, 'Some map entries have no description'
for identity in ('welcome', 'username', 'submit-name', 'skip-name', 'world-map'):
    assert identity in parser.ids, f'Missing app flow element: {identity}'
assert 'window.GeoPrzygodaApp' in text, 'Android back handling is missing'
assert '__DATA__' not in text, 'Unexpanded data placeholder'

data = json.loads((ROOT / 'data/countries.json').read_text(encoding='utf-8'))
ids = {country['id'] for country in data['countries']}
assert parser.country_ids <= ids, 'Map and data export disagree'
assert data['license_url'] == 'https://opendatacommons.org/licenses/odbl/1-0/'
assert data['projection'] == 'Mercator', 'Country proportions must use the corrected projection'
assert 'preserveAspectRatio="xMidYMid meet"' in text, 'The map must keep its proportions on all screens'
assert sum(c['mapped'] for c in data['countries']) >= 230, 'Detailed country boundaries are missing'
poland = next(c for c in data['countries'] if c['id'] == 'POL')
west, north, east, south = poland['b']
assert 1.0 < (east - west) / (south - north) < 1.2, 'Poland is stretched sideways again'
poland_path = re.search(r'id="land-POL" d="([^"]+)"', text)[1]
assert poland_path.count('L') >= 250, 'Poland must retain the detailed boundary'

manifest = ET.parse(ROOT / 'app/src/main/AndroidManifest.xml').getroot()
assert not manifest.findall('uses-permission'), 'Offline game should not request permissions'
for file in (ROOT / 'app/src/main/res').rglob('*.xml'):
    ET.parse(file)

print(f'Offline map verified: {len(parser.country_ids)} entries, matching descriptions, no external assets.')
