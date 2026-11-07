/* Browser-level flag regression test against the actual offline game map.
 * Not a substitute for testing Android WebView on a real phone.
 * Run after build_world_detail.py and npm install in scripts/flag-browser.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('./flag-browser/node_modules/playwright-core');

const root = path.resolve(__dirname, '../app/src/main/assets');
const reportDir = path.resolve(__dirname, 'flag-render-evidence');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'flag_reference.json'), 'utf8'));
const iso = manifest.iso_alpha3_to_alpha2;
const fixed = ['NLD','AUT','FRA','USA','AUS','TUR','GBR','JPN','CAN','SAU','NPL','MCO','VAT','KIR'];
const zoomTargets = ['NLD','AUT','FRA','USA','AUS','TUR'];
const stripes = new Set([
  'AUT','NLD','FRA','BEL','DEU','ITA','IRL','POL','UKR','RUS',
  'EST','LTU','LVA','HUN','BGR','ROU','ARM','LUX',
  'NGA','MLI','GIN','GAB','CIV','TCD','SLE','YEM'
]);

function mime(file) {
  return file.endsWith('.svg') ? 'image/svg+xml' :
    file.endsWith('.json') ? 'application/json' :
    file.endsWith('.js') ? 'application/javascript' :
    file.endsWith('.css') ? 'text/css' : 'text/html';
}
function makeServer() {
  return http.createServer((req, res) => {
    let file;
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
      if (file !== root && !file.startsWith(root + path.sep)) throw Error('Bad path');
    } catch {
      res.writeHead(400); res.end(); return;
    }
    fs.readFile(file, (err, contents) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
      res.end(contents);
    });
  });
}
function chromePath() {
  const candidates = [
    process.env.CHROME_BIN, '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p));
}

async function run() {
  const chrome = chromePath();
  if (!chrome) throw Error('No Chromium/Google Chrome binary: cannot verify real map rendering');
  fs.mkdirSync(reportDir, { recursive: true });
  const server = makeServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const pageErrors = [];
  try {
    browser = await chromium.launch({
      headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
      viewport: { width: 440, height: 845 },
      deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'pl-PL'
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!document.getElementById('flag-pattern-NLD'),
      { timeout: 15000 });
    await page.evaluate(() => document.getElementById('skip-name')?.click());
    await page.waitForTimeout(300);

    // The same JavaScript and SVG patterns as the actual Android game.
    // Check actual fills, pattern references and image aspect ratios on every
    // mapped shape; also inspect islands and other fragments.
    const before = await page.evaluate(({ iso, stripes }) => {
      const expectedStripes = new Set(stripes);
      const errors = [];
      let mapShapes = 0, fittedPieces = 0, stripePieces = 0, fragments = 0;
      const fitFromFill = value => /url\(["']?#([^)"']+)/.exec(value || '')?.[1];
      for (const [id, code] of Object.entries(iso)) {
        const main = document.getElementById('land-' + id);
        if (!main) continue; // Several microstates have markers, not polygons.
        mapShapes++;
        const paths = [...main.parentElement.querySelectorAll('path.land')];
        for (const piece of paths) {
          fragments++;
          const box = piece.getBBox();
          const actual = fitFromFill(piece.style.fill);
          if (!actual) {
            errors.push(id + ': missing flag fill');
            continue;
          }
          const pattern = document.getElementById(actual);
          const image = pattern?.querySelector('image');
          if (!pattern || !image) {
            errors.push(id + ': missing SVG pattern/image ' + actual);
            continue;
          }
          if (image.getAttribute('href') !== 'flags/' + code.toLowerCase() + '.svg')
            errors.push(id + ': wrong country flag URL: ' + image.getAttribute('href'));
          const aspect = image.getAttribute('preserveAspectRatio');
          if (expectedStripes.has(id)) {
            stripePieces++;
            if (actual !== 'flag-pattern-' + id)
              errors.push(id + ': simple stripes unexpectedly use a fitted pattern');
          } else if (box.width > 0 && box.height > 0) {
            fittedPieces++;
            if (!actual.startsWith('flag-fitted-' + id + '-'))
              errors.push(id + ': emblem or complex flag is stretched instead of fitted');
            if (!['xMidYMid meet', 'xMidYMid slice'].includes(aspect))
              errors.push(id + ': stretched or missing aspect ratio: ' + aspect);
            if (pattern.getAttribute('patternUnits') !== 'userSpaceOnUse')
              errors.push(id + ': wrong units on fitted pattern');
            const value = attr => Number(pattern.getAttribute(attr));
            if (Math.abs(value('x') - box.x) > .04 ||
                Math.abs(value('y') - box.y) > .04 ||
                Math.abs(value('width') - box.width) > .04 ||
                Math.abs(value('height') - box.height) > .04)
              errors.push(id + ': stale fitted geometry');
          }
        }
      }
      return { mapShapes, fragments, fittedPieces, stripePieces, errors };
    }, { iso, stripes: [...stripes] });
    if (before.mapShapes < 190) throw Error('Too few renderable country polygons: ' + before.mapShapes);
    if (before.errors.length) throw Error('Flag pattern problems:\n' + before.errors.slice(0, 30).join('\n'));
    await page.screenshot({ path: path.join(reportDir, 'world.png') });

    let zoomed = 0;
    for (const id of zoomTargets) {
      const result = await page.evaluate(id => {
        const svg = document.getElementById('world-map');
        const shape = document.getElementById('land-' + id);
        if (!svg || !shape) return { ok: false };
        const b = shape.getBBox();
        const size = Math.max(b.width, b.height, 4);
        const square = Math.max(size * 1.6, 5);
        svg.setAttribute('viewBox',
          [b.x + b.width/2 - square/2,b.y + b.height/2 - square/2,square,square].join(' '));
        return { ok: true };
      }, id);
      if (!result.ok) throw Error('Could not zoom to ' + id);
      // The production MutationObserver reloads precise 1:10m contours.
      await page.waitForTimeout(850);
      const after = await page.evaluate(({ id, code, stripe }) => {
        const shape = document.getElementById('land-' + id);
        const pieces = [...shape.parentElement.querySelectorAll('path.land')];
        const problems = [];
        for (const piece of pieces) {
          const value = /url\(["']?#([^)"']+)/.exec(piece.style.fill || '')?.[1];
          const pattern = value && document.getElementById(value);
          const image = pattern?.querySelector('image');
          if (!image || image.getAttribute('href') !== 'flags/' + code.toLowerCase() + '.svg')
            problems.push('missing/mismatched image after zoom');
          if (!stripe && piece.getBBox().width > 0 && image &&
              image.getAttribute('preserveAspectRatio') === 'none')
            problems.push('stretched image after zoom');
          if (!stripe && piece.getBBox().width > 0 && pattern) {
            const box = piece.getBBox();
            if (Math.abs(Number(pattern.getAttribute('width')) - box.width) > .04)
              problems.push('stale fitted width after zoom');
          }
        }
        return { pieces: pieces.length, problems };
      }, { id, code: iso[id], stripe: stripes.has(id) });
      if (after.problems.length) throw Error(id + ': ' + after.problems.join(', '));
      zoomed++;
      await page.screenshot({ path: path.join(reportDir, id.toLowerCase() + '-zoom.png') });
    }

    // Any map zoom should be reversible, without flag mappings changing.
    await page.evaluate(() => {
      document.getElementById('world-map').setAttribute('viewBox', '0 0 1080 1080');
    });
    await page.waitForTimeout(150);
    const toggled = await page.evaluate(() => {
      const checkbox = document.getElementById('setting-flags');
      const map = document.getElementById('world-map');
      const primary = document.getElementById('land-NLD');
      const initial = map.classList.contains('flag-fill');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      const disabled = !map.classList.contains('flag-fill') && !primary.style.fill;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      const restored = map.classList.contains('flag-fill') &&
        /flag-pattern-NLD/.test(primary.style.fill);
      return { initial, disabled, restored };
    });
    if (!toggled.initial || !toggled.disabled || !toggled.restored)
      throw Error('Flag toggle failed: ' + JSON.stringify(toggled));

    const conquest = await page.evaluate(() => {
      const foreign = document.getElementById('land-BLR');
      const fit = window.GeoPrzygodaFitFlag('USA', 'BLR', foreign, 0);
      const id = /url\(#([^)]+)\)/.exec(fit)?.[1];
      const pattern = id && document.getElementById(id);
      return {
        id, aspect: pattern?.querySelector('image')?.getAttribute('preserveAspectRatio'),
        flag: pattern?.querySelector('image')?.getAttribute('href')
      };
    });
    if (conquest.flag !== 'flags/us.svg' ||
        !['xMidYMid meet','xMidYMid slice'].includes(conquest.aspect))
      throw Error('Battle conquest stretched USA flag: ' + JSON.stringify(conquest));

    const summary = {
      chromium: chrome,
      checkedSvgFiles: Object.keys(iso).length,
      renderedCountries: before.mapShapes,
      renderedFragments: before.fragments,
      fittedPieces: before.fittedPieces,
      stripePieces: before.stripePieces,
      zoomedCountries: zoomed,
      flagsToggle: toggled,
      battleForeignFlag: conquest,
      screenshotFiles: ['world.png', ...zoomTargets.map(x => x.toLowerCase() + '-zoom.png')],
      browserErrors: pageErrors
    };
    fs.writeFileSync(path.join(reportDir,'report.json'), JSON.stringify(summary,null,2));
    console.log(JSON.stringify(summary,null,2));
    // Any error on the browser console is not necessarily a rendering error:
    // only actual JavaScript exceptions and failed mapping assertions fail.
    if (pageErrors.length) throw Error('Browser JS exceptions: ' + pageErrors.join(' | '));
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
