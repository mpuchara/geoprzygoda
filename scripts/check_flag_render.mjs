/**
 * Chromium smoke/regression test for the REAL offline world map.
 * Complements (does not replace) check_flags.py's 238 SVG/ISO checks.
 * Screenshots are saved for human review, not falsely counted as reviewed.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../app/src/main/assets/', import.meta.url)));
const screenshots = resolve(fileURLToPath(new URL('../flag-render-screenshots/', import.meta.url)));
await mkdir(screenshots, { recursive: true });
const type = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json' };
const server = createServer(async (req, res) => {
  const relativePath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const path = resolve(root, '.' + relativePath);
  if (relative(root, path).startsWith('..')) { res.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(path);
    res.setHeader('Content-Type', type[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
let pagesTested = 0;
const problems = [];
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => problems.push('JS error: ' + error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#country-flag-patterns pattern').length > 180,
    { timeout: 30000 }
  );
  await page.locator('#skip-name').click();
  await page.waitForTimeout(1000);

  async function inspect(stage, codes = null) {
    const result = await page.evaluate(codesToCheck => {
      const failures = [];
      let checked = 0;
      let countries = 0;
      const all = COUNTRY_DATA.filter(c => c.mapped && /^[A-Z]{2}$/.test(c.code));
      const chosen = codesToCheck ? all.filter(c => codesToCheck.includes(c.id)) : all;
      for (const c of chosen) {
        const root = document.getElementById('land-' + c.id);
        if (!root) continue; // Microstates with only dots have no SVG land path.
        countries++;
        const pieces = [...root.parentElement.querySelectorAll('path.land')];
        if (!pieces.length) failures.push(c.id + ': no land fragment');
        for (const [i, piece] of pieces.entries()) {
          const fallback = piece.dataset.geoprzygodaFittedFlag;
          if (!fallback) { failures.push(c.id + '/' + i + ': no fitted flag'); continue; }
          const id = /url\(#([^)]+)\)/.exec(fallback)?.[1];
          const pattern = id && document.getElementById(id);
          const image = pattern?.querySelector('image');
          if (!pattern || !image) { failures.push(c.id + '/' + i + ': missing SVG pattern'); continue; }
          if (pattern.getAttribute('patternUnits') !== 'userSpaceOnUse' ||
              pattern.getAttribute('patternContentUnits') !== 'userSpaceOnUse')
            failures.push(c.id + '/' + i + ': objectBoundingBox flag detected');
          const fit = image.getAttribute('preserveAspectRatio');
          const bands = new Set([
            'AUT','NLD','FRA','BEL','DEU','ITA','IRL','POL','UKR','RUS',
            'EST','LTU','LVA','HUN','BGR','ROU','ARM','LUX',
            'NGA','MLI','GIN','GAB','CIV','TCD','SLE','YEM'
          ]);
          if (!bands.has(c.id) && (!fit || fit === 'none'))
            failures.push(c.id + '/' + i + ': emblem stretched (' + fit + ')');
          if (bands.has(c.id) && fit !== 'none')
            failures.push(c.id + '/' + i + ': stripes not aligned');
          const imgSrc = image.getAttribute('href') || '';
          if (imgSrc !== 'flags/' + c.code.toLowerCase() + '.svg')
            failures.push(c.id + '/' + i + ': wrong flag ' + imgSrc);
          const box = piece.getBBox();
          const matching = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 0.015 + Math.abs(b)*0.0001;
          if (box.width > 0 && box.height > 0 &&
              ['x','y','width','height'].some(key => !matching(Number(pattern.getAttribute(key)), box[key])))
            failures.push(c.id + '/' + i + ': flag pattern box not aligned to land');
          // During exploration every flag should be the path's fill, not an
          // un-clipped full-screen <image> that covers nearby countries.
          if (!document.getElementById('world-map').classList.contains('flag-fill'))
            continue;
          const style = piece.style.fill || '';
          if (!style.includes('#' + id))
            failures.push(c.id + '/' + i + ': map is not using fitted flag');
          checked++;
        }
      }
      if ([...document.querySelectorAll('#world-map > image')].length)
        failures.push('Direct SVG image sits outside land clipping paths');
      return { countries, pieces: checked, failures };
    }, codes);
    problems.push(...result.failures.map(e => stage + ' — ' + e));
    console.log(stage + ': ' + result.countries + ' mapped countries, ' + result.pieces + ' SVG paths checked');
    return result;
  }

  const world = await inspect('World overview');
  if (world.countries < 200 || world.pieces < 220)
    problems.push('Too few visible map flags for a world audit');
  await page.screenshot({ path: screenshots + '/00-world.png' });

  // Representative flags and extreme geometry (large, remote islands,
  // small states, vertical flag, cross, crescent, stripes).
  const countries = ['NLD','AUT','FRA','USA','AUS','TUR','SAU','GBR','CHL',
    'NPL','VAT','MCO','NZL','JPN'];
  for (const id of countries) {
    await page.evaluate(country => focusCountry(country), id);
    await page.waitForTimeout(1100);
    await inspect('Zoom '+id, [id]);
    await page.screenshot({ path: screenshots + '/' + id.toLowerCase() + '-zoom.png' });
    pagesTested++;
  }

  // After zoom-out, the detailed 1:10m geometry (and additional islands) must
  // still be correctly matched to the country-specific SVG.
  await page.evaluate(() => resetMap(false));
  await page.waitForTimeout(500);
  await inspect('After zoom-out');

  // OFF/ON, quiz/explore must not leave phantom flags nor break the palette.
  await page.evaluate(() => {
    const input = document.getElementById('setting-flags');
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const off = await page.evaluate(() => !document.getElementById('world-map').classList.contains('flag-fill')
    && !document.getElementById('land-NLD').style.fill);
  if (!off) problems.push('Flag OFF toggle did not remove flag fills');
  await page.evaluate(() => {
    const input = document.getElementById('setting-flags');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    setMode('quiz');
  });
  const quiz = await page.evaluate(() => !document.getElementById('world-map').classList.contains('flag-fill'));
  if (!quiz) problems.push('Quiz retained flag fills');
  await page.evaluate(() => setMode('explore'));
  await inspect('After quiz/explore');

  // Verify flags fitted to a *captured* country (not to the attacker's box).
  await page.evaluate(() => window.GeoPrzygodaBattle.start('TUR','GRC'));
  await page.waitForTimeout(850);
  await page.evaluate(() => document.getElementById('battle-attack').click());
  await page.waitForTimeout(400);
  const battle = await page.evaluate(() => {
    const ink = document.querySelector('.battle-organic-fill');
    const fill = ink?.getAttribute('fill') || '';
    const id = /url\(#([^)]+)\)/.exec(fill)?.[1];
    const pattern = id && document.getElementById(id);
    return { fill, units: pattern?.getAttribute('patternUnits'),
      ratio: pattern?.querySelector('image')?.getAttribute('preserveAspectRatio') };
  });
  if (!battle.fill.includes('flag-fitted-TUR-on-GRC') ||
      battle.units !== 'userSpaceOnUse' || battle.ratio === 'none')
    problems.push('Battle capture: Turkish crescent used an incorrect pattern');
  await page.screenshot({ path: screenshots + '/battle-turkey-greece.png' });
  await page.evaluate(() => window.GeoPrzygodaBattle.stop());
  await inspect('After exiting battle', ['AUT','NLD','TUR','GRC']);
  console.log('Browser screenshots: ' + (pagesTested + 2) + ' + battle');
  if (problems.length) throw new Error(problems.slice(0,40).join('\n'));
  console.log('PASS: no emblem stretching, country-specific patterns, zoom, flags toggle, quiz and battle.');
} finally {
  await browser.close();
  await new Promise(resolveServer => server.close(resolveServer));
}
