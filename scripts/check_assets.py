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

assert 'np. tadzio340' not in text, 'Example username should not be shown'

# Flag patterns must fit mainland France, continental USA and Australia.
for code, minimum in (('FRA', 3), ('USA', 4), ('AUS', 3)):
    match = re.search(r'<a href="#info-' + code + r'" class="country-link" data-country="' +
                      code + r'" aria-label="[^"]+">(.*?)</a>', text, flags=re.S)
    assert match, f'Missing selectable map shape: {code}'
    country_html = match.group(1)
    assert len(re.findall(r'<path class="land(?: flag-fragment)?"', country_html)) >= minimum, (
        f'{code} map fragments were accidentally merged')
    assert country_html.count(f'id="land-{code}"') == 1
features_text = (ROOT / 'app/src/main/assets/features.js').read_text()
battle_text = (ROOT / 'app/src/main/assets/battle.js').read_text()
assert "path.parentElement.querySelectorAll('path.land')" in features_text
assert "function countryPieces(id)" in battle_text


picker_js = (ROOT / 'app/src/main/assets/rival_ui.js').read_text(encoding='utf-8')
assert 'rival_ui.js' in text and 'rival_ui.css' in text, 'Searchable rivalry UI assets missing'
for marker in ("makePicker(rivalSelect, 'rival-country'", "makePicker(battleSelect, 'battle-country'",
               'picker-flat-flag', 'new MutationObserver', "dispatchEvent(new Event"):
    assert marker in picker_js, f'Missing flag search capability: {marker}'
assert "openExtra(rivalry, 'rival-country-search')" in features_text, 'Rivalry search not focusable'
assert 'window.GeoPrzygodaPicker.refreshBattle()' in battle_text, 'Battle search does not refresh'


# All mapped countries with ISO alpha-2 codes must ship their vector flag.
flag_dir = ROOT / 'app/src/main/assets/flags'
flag_codes = {country['code'].lower() for country in data['countries']
              if country['mapped'] and len(country['code']) == 2}
assert len(flag_codes) >= 230, 'Unexpected number of mapped flags'
for code in flag_codes:
    file = flag_dir / f'{code}.svg'
    assert file.is_file(), f'Country flag is missing: {code}'
    svg = ET.parse(file).getroot()
    assert svg.tag.endswith('svg'), f'Invalid flag SVG: {code}'
features = (ROOT / 'app/src/main/assets/features.js').read_text(encoding='utf-8')
assert 'flag-pattern-' in features and 'quick-music' in features, 'New map/audio controls missing'
assert 'flags/' in features, 'Map flags must be loaded from offline assets'
assert 'battle.js' in text and 'battle.css' in text, 'Battle resources missing from HTML'
battle = (ROOT / 'app/src/main/assets/battle.js').read_text(encoding='utf-8')
for token in ('rival-start-map', 'battle-history-overlay', 'battle-commonwealth', 'battle-target', 'geo-territory-battle-v1'):
    assert token in battle, f'Missing battle capability: {token}'
assert (ROOT / 'app/src/main/assets/battle.css').is_file(), 'Missing battle style'
countries_by_id = {c['id']: c for c in data['countries']}
assert {'POL', 'LTU', 'BLR', 'UKR'} <= countries_by_id.keys(), 'Historical game scenario needs four countries'
assert 'LTU' in countries_by_id['POL']['borders'], 'Poland/Lithuania should be neighbors in game atlas'
assert 'BLR' in countries_by_id['LTU']['borders'] or 'BLR' in countries_by_id['POL']['borders'], 'Commonwealth has no Belarus frontier'
assert 'UKR' in countries_by_id['POL']['borders'], 'Commonwealth has no Ukraine frontier'

manifest = ET.parse(ROOT / 'app/src/main/AndroidManifest.xml').getroot()
assert not manifest.findall('uses-permission'), 'Offline game should not request permissions'
for file in (ROOT / 'app/src/main/res').rglob('*.xml'):
    ET.parse(file)

print(f'Offline map verified: {len(parser.country_ids)} entries, matching descriptions, no external assets.')
