"""Build an offline, self-contained HTML gallery for visual spot-checking flags."""
from base64 import b64encode
from html import escape
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'flag-gallery.html'
countries = json.loads((ROOT / 'data/countries.json').read_text(encoding='utf-8'))['countries']
mapped = sorted(
    (c for c in countries if c['mapped'] and len(c.get('code', '')) == 2),
    key=lambda c: c['n'].casefold()
)
cards = []
for country in mapped:
    code = country['code'].lower()
    blob = (ROOT / 'app/src/main/assets/flags' / (code + '.svg')).read_bytes()
    src = 'data:image/svg+xml;base64,' + b64encode(blob).decode('ascii')
    name = escape(country['n'])
    cards.append(
        '<figure data-name="%s %s %s"><img loading="lazy" alt="%s" src="%s">'
        '<figcaption><b>%s</b> · %s / %s</figcaption></figure>' %
        (name.casefold(), code, country['id'].lower(), name, src, name,
         country['id'], country['code'])
    )
page = '''<!doctype html><html lang="pl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GeoPrzygoda — audyt flag</title>
<style>
:root{color-scheme:dark}body{background:#10243a;color:#eff6ff;font-family:system-ui;margin:20px}
h1{font-size:1.5rem}p{line-height:1.6;color:#cbd6e8}
input{box-sizing:border-box;width:100%;max-width:510px;border-radius:12px;
padding:12px;background:#1e3c58;color:white;border:1px solid #769db3}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:13px;margin-top:20px}
figure{margin:0;padding:12px;border:1px solid #355972;border-radius:12px;
background:#1b3550;overflow:hidden}
img{display:block;width:100%;height:95px;object-fit:contain;background:#20394d}
figcaption{font-size:12px;line-height:1.4;padding-top:8px}
</style>
<h1>🌍 GeoPrzygoda — 238 flag do kontroli wizualnej</h1>
<p>Oryginalne flagi ISO 4:3. Użyj wyszukiwarki, by porównać flagi małych wysp
oraz państw o podobnych nazwach, np. Austria i Australia.
Ten widok pokazuje źródłowe pliki SVG, nie ich nakładki na mapę gry.</p>
<input id="search" placeholder="Szukaj kraju lub kodu ISO" aria-label="Szukaj flagi">
<main id="gallery">''' + ''.join(cards) + '''</main>
<script>
const input=document.querySelector('#search');
input.addEventListener('input',()=>{
  const q=input.value.toLocaleLowerCase('pl').trim();
  document.querySelectorAll('#gallery figure').forEach(el=>{
    el.hidden=!el.dataset.name.includes(q);
  });
});
</script></html>'''
out.write_text(page, encoding='utf-8')
print('Created visual flag gallery with %d images: %s' % (len(cards), out))
