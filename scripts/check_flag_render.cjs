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
const zoomTargets = ['NLD','AUT','FRA','USA','AUS','TUR','GBR','SAU','CHL','NPL','VAT','MCO','JPN','KIR'];
const stripes = new Set([
  'AUT','NLD','FRA','BEL','DEU','ITA','IRL','POL','UKR','RUS',
  'EST','LTU','LVA','HUN','BGR','ROU','ARM','LUX',
  'NGA','MLI','GIN','GAB','CIV','TCD','SLE','YEM'
]);

function mime(file) {
  return file.endsWith('.png') ? 'image/png' :
    file.endsWith('.svg') ? 'image/svg+xml' :
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
    // Flags are intentionally prepared across idle frames rather than blocking
    // the first map paint. Wait for all visible overview flags before auditing.
    await page.waitForFunction(() => window.GeoPrzygodaFlagStatus?.().complete,
      null, { timeout: 30000 });

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
          // The fallback must live in a separate shape, not only *inside*
          // the SVG pattern (which can render completely transparent in
          // Android WebView even when the pattern URL resolves).
          const base = piece.previousElementSibling;
          if (!base?.classList.contains('flag-terrain-underlay') ||
              base.getAttribute('d') !== piece.getAttribute('d') ||
              !base.getAttribute('fill') || base.getAttribute('fill') === 'none' ||
              base.getAttribute('pointer-events') !== 'none') {
            errors.push(id + ': missing independent terrain underlay');
          }
          const actual = fitFromFill(piece.style.fill);
          if (!actual) {
            errors.push(id + ': missing flag fill');
            continue;
          }
          // SVG 1.1 permits a terrain-color fallback after a paint server.
          // This remains visible if Android WebView fails the entire pattern.
          // Chromium serializes #rrggbb as rgb(...); validate the paint
          // fallback after url(...) independently of its CSSOM formatting.
          const trailingPaint = piece.style.fill.replace(/^\s*url\([^)]*\)\s*/, '').trim();
          if (!trailingPaint || trailingPaint === 'none')
            errors.push(id + ': missing fallback color outside pattern');
          const pattern = document.getElementById(actual);
          const image = pattern?.querySelector('image');
          if (!pattern || !image) {
            errors.push(id + ': missing SVG pattern/image ' + actual);
            continue;
          }
          const backing = pattern.querySelector('rect');
          if (!backing || !backing.getAttribute('fill') ||
              backing.getAttribute('fill') === 'none')
            errors.push(id + ': missing fallback terrain background');
          if (image.getAttribute('href') !== 'flag-textures/' + code.toLowerCase() + '.png')
            errors.push(id + ': wrong country flag URL: ' + image.getAttribute('href'));
          const aspect = image.getAttribute('preserveAspectRatio');
          // All 238 mapped flags now use per-fragment userSpaceOnUse patterns.
          // The primary piece keeps the historical flag-pattern-ID alias.
          if (actual !== 'flag-pattern-' + id &&
              !actual.startsWith('flag-fitted-' + id + '-'))
            errors.push(id + ': foreign or unfitted flag reference ' + actual);
          if (pattern.getAttribute('patternUnits') !== 'userSpaceOnUse' ||
              pattern.getAttribute('patternContentUnits') !== 'userSpaceOnUse')
            errors.push(id + ': normalized/stretched flag pattern');
          if (expectedStripes.has(id)) {
            stripePieces++;
            if (aspect !== 'none')
              errors.push(id + ': simple stripes unexpectedly changed ratio');
          } else {
            fittedPieces++;
            if (!['xMidYMid meet', 'xMidYMid slice'].includes(aspect))
              errors.push(id + ': stretched emblem/cross or incorrect ratio: ' + aspect);
          }
          if (box.width > 0 && box.height > 0) {
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

    // Verify map starts with lightweight 1:50m outlines, not eager 1:10m.
    const initialBorders = await page.evaluate(() => ({
      NLD: document.getElementById('land-NLD').getAttribute('d'),
      POL: document.getElementById('land-POL').getAttribute('d'),
      detailCount: document.querySelectorAll('.land.flag-fragment').length
    }));
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
          if (!image || image.getAttribute('href') !== 'flag-textures/' + code.toLowerCase() + '.png')
            problems.push('missing/mismatched image after zoom');
          if (image && (stripe
              ? image.getAttribute('preserveAspectRatio') !== 'none'
              : image.getAttribute('preserveAspectRatio') === 'none'))
            problems.push('wrong SVG image aspect ratio after zoom');
          if (piece.getBBox().width > 0 && pattern) {
            const box = piece.getBBox();
            if (pattern.getAttribute('patternUnits') !== 'userSpaceOnUse')
              problems.push('normalized/old SVG flag pattern after zoom');
            if (Math.abs(Number(pattern.getAttribute('width')) - box.width) > .04 ||
                Math.abs(Number(pattern.getAttribute('height')) - box.height) > .04)
              problems.push('stale fitted size after zoom');
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
    await page.waitForTimeout(500);
    const reset = await page.evaluate(() => ({
      nl: document.getElementById('land-NLD').getAttribute('d'),
      pol: document.getElementById('land-POL').getAttribute('d'),
      zoomed: document.getElementById('world-map').viewBox.baseVal.width
    }));
    if (reset.nl !== initialBorders.NLD || reset.pol !== initialBorders.POL ||
        reset.zoomed !== 1080)
      throw Error('Zoom-out failed to restore light 1:50m map geometry');
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
    if (conquest.flag !== 'flag-textures/us.png' ||
        !['xMidYMid meet','xMidYMid slice'].includes(conquest.aspect))
      throw Error('Battle conquest stretched USA flag: ' + JSON.stringify(conquest));

    // Plan 6: only selected country facts are brought into the DOM.
    await page.waitForFunction(() => !!window.GeoPrzygodaEncyclopedia,
      null, { timeout: 12000 });
    await page.evaluate(() => openCountry('POL', false));
    await page.waitForFunction(() =>
      !!document.querySelector('#info-POL .geo6-fact') &&
      !!document.querySelector('#info-POL .geo6-history-button'),
      null, { timeout: 12000 });
    const plan6 = await page.evaluate(() => ({
      countriesInDom: document.querySelectorAll('.geo6-encyclopedia').length,
      facts: document.querySelectorAll('#info-POL .geo6-fact').length,
      hasBorder: [...document.querySelectorAll('#info-POL .geo6-fact')]
        .some(x => x.textContent.includes('3071')),
      cached: window.GeoPrzygodaEncyclopedia.stats().recordsCached
    }));
    if(plan6.countriesInDom !== 1 || plan6.facts < 7 || !plan6.hasBorder ||
       plan6.cached > 8) throw Error('Plan 6 country details failure: '+JSON.stringify(plan6));
    await page.click('#info-POL .geo6-history-button');
    await page.waitForFunction(() => !!document.querySelector('#info-POL .geo6-slider'),
      null, { timeout: 12000 });
    const historyCheck=await page.evaluate(() => ({
      historyEvents: document.querySelectorAll('#info-POL .geo6-year').length,
      historicalFlags: document.querySelectorAll('#info-POL .geo6-old-flag').length,
      sliderMax: document.querySelector('#info-POL .geo6-slider')?.max
    }));
    if(historyCheck.historyEvents < 5 || historyCheck.historicalFlags < 1)
      throw Error('Plan 6 historical timeline failure: '+JSON.stringify(historyCheck));
    await page.evaluate(() => localStorage.setItem('geo-player-name','tadzio340'));
    await page.reload({waitUntil:'load'});
    await page.waitForFunction(() => document.querySelector('#username-display')?.textContent.includes('tadzio340'),
      null, { timeout: 12000 });
    const remembered=await page.evaluate(() => ({
      greeting: document.querySelector('#username-display').textContent,
      entering: document.querySelector('#welcome').classList.contains('leaving')
    }));
    if (!remembered.greeting.includes('tadzio340'))
      throw Error('Saved username was not restored');
    await page.evaluate(() => localStorage.removeItem('geo-player-name'));

    // Plan 7: test real offline UI interactions in Chromium, not just asset names.
    await page.waitForFunction(() => !!window.GeoPrzygodaPlan7,
      null, { timeout: 12000 });
    await page.click('#open-game-modes');
    const plan7Menu = await page.evaluate(() => ({
      open: !document.getElementById('geo7-overlay').classList.contains('hidden'),
      modes: document.querySelectorAll('#geo7-content .geo7-mode').length,
      currentPoints: window.GeoPrzygodaPlan7.points
    }));
    if(!plan7Menu.open || plan7Menu.modes !== 5 || plan7Menu.currentPoints !== 0)
      throw Error('Plan 7 mode menu failure: '+JSON.stringify(plan7Menu));

    await page.evaluate(() => window.GeoPrzygodaPlan7.open('challenges'));
    const plan7Challenges = await page.evaluate(() => {
      const tasks = document.querySelectorAll('#geo7-content .geo7-task');
      if (tasks.length !== 3 || [...tasks].some(x => x.querySelectorAll('.geo7-answer').length !== 4))
        return { count: tasks.length, error:'Missing daily tasks' };
      const first=tasks[0], heading=first.querySelector('.geo7-task-heading').textContent;
      const name=heading.replace(/^.*Jaka jest stolica państwa /,'').replace(/\?$/, '');
      const country=COUNTRY_DATA.find(c=>c.n===name);
      const correct=[...first.querySelectorAll('.geo7-answer')].find(b=>b.textContent===country?.cap);
      if(!correct) return { count:tasks.length, error:'No correct capital answer: '+heading };
      correct.click();
      const third=document.querySelectorAll('#geo7-content .geo7-task')[2];
      const flag=third.querySelector('img');
      const code=flag?.getAttribute('src')?.match(/flags\/([a-z]{2})\.svg$/)?.[1];
      const target=COUNTRY_DATA.find(c=>c.code?.toLowerCase()===code);
      const targetAnswer=[...third.querySelectorAll('.geo7-answer')].find(b=>b.textContent===target?.n);
      if(!targetAnswer) return { count:tasks.length, error:'No correct flag answer '+code };
      targetAnswer.click();
      return { count:tasks.length, points:window.GeoPrzygodaPlan7.points,
        completed:window.GeoPrzygodaPlan7.completedToday };
    });
    if(plan7Challenges.error || plan7Challenges.points !== 35 || plan7Challenges.completed !== 2)
      throw Error('Plan 7 daily reward failure: '+JSON.stringify(plan7Challenges));
    await page.evaluate(() => window.GeoPrzygodaPlan7.open('shop'));
    const plan7Shop = await page.evaluate(() => {
      const gold=[...document.querySelectorAll('.geo7-shop-item')].find(x=>x.textContent.includes('Złota ramka'));
      gold?.querySelector('button')?.click();
      return { points:window.GeoPrzygodaPlan7.points,
        inventory:window.GeoPrzygodaPlan7.inventory };
    });
    if(plan7Shop.points !== 0 || !plan7Shop.inventory.includes('frame-gold'))
      throw Error('Plan 7 reward shop failure: '+JSON.stringify(plan7Shop));

    await page.evaluate(() => window.GeoPrzygodaPlan7.open('flags'));
    await page.evaluate(() => {
      const color=document.querySelector('.geo7-color');
      color.value='#12aabb';
      color.dispatchEvent(new Event('input',{bubbles:true}));
      [...document.querySelectorAll('.geo7-button')].find(b=>b.textContent.includes('Zapisz flagę')).click();
    });
    const customFlag = await page.evaluate(() => ({
      src:window.GeoPrzygodaPlan7.flagForCountry('POL'),
      visible:!!document.querySelector('#geo7-content .geo7-flag-preview img')
    }));
    if(!customFlag.src.startsWith('data:image/svg+xml;') || !customFlag.visible)
      throw Error('Plan 7 custom flag failure');

    const mapWidthBeforeHistory = await page.evaluate(() => document.getElementById('world-map').viewBox.baseVal.width);
    await page.evaluate(() => window.GeoPrzygodaPlan7.open('time'));
    await page.waitForFunction(() => !!document.querySelector('.geo7-timeline-slider'),
      null, {timeout:12000});
    const plan7History = await page.evaluate(() => ({
      max:document.querySelector('.geo7-timeline-slider').max,
      originalMap:document.getElementById('world-map').viewBox.baseVal.width
    }));
    if(Number(plan7History.max)<3 || plan7History.originalMap !== mapWidthBeforeHistory)
      throw Error('Plan 7 historical mode failure: '+JSON.stringify(plan7History));

    await page.evaluate(() => window.GeoPrzygodaPlan7.open('friends'));
    await page.evaluate(() => [...document.querySelectorAll('#geo7-content button')]
      .find(b=>b.textContent.includes('Rozpocznij pojedynek')).click());
    const plan7Duel = await page.evaluate(() => {
      const answers=[...document.querySelectorAll('#geo7-content .geo7-answer')];
      if(answers.length!==4)return { answers:answers.length };
      answers[0].click();
      return { answers:answers.length, disabled:answers.every(b=>b.disabled),
        next:[...document.querySelectorAll('#geo7-content button')].some(b=>b.textContent.includes('Dalej')) };
    });
    if(plan7Duel.answers!==4 || !plan7Duel.disabled || !plan7Duel.next)
      throw Error('Plan 7 local duel failure: '+JSON.stringify(plan7Duel));
    await page.reload({waitUntil:'load'});
    await page.waitForFunction(() => !!window.GeoPrzygodaPlan7,
      null, {timeout:12000});
    const persistedPlan7 = await page.evaluate(() => ({
      points:window.GeoPrzygodaPlan7.points,
      completed:window.GeoPrzygodaPlan7.completedToday,
      inventory:window.GeoPrzygodaPlan7.inventory,
      savedFlag:!!window.GeoPrzygodaPlan7.flagForCountry('POL'),
      map:!!document.getElementById('world-map')
    }));
    if(persistedPlan7.points!==0 || persistedPlan7.completed!==2 ||
       !persistedPlan7.inventory.includes('frame-gold') ||
       !persistedPlan7.savedFlag || !persistedPlan7.map)
      throw Error('Plan 7 persistence failure: '+JSON.stringify(persistedPlan7));
    // Battle UI shows the player's banner, without replacing the atlas flags.
    const banner=await page.evaluate(()=>{
      window.GeoPrzygodaBattle.start('POL','BLR',0,'free');
      const shown=!!document.querySelector('#battle-title .geo7-campaign-flag');
      window.GeoPrzygodaBattle.stop();
      return shown;
    });
    if(!banner) throw Error('Plan 7 player banner missing in campaign');


    // A Chromium context with an Android WebView UA checks the alternate
    // clipPath branch. This is NOT a real-device WebView certification.
    const androidContext = await browser.newContext({
      viewport:{ width:440, height:845 }, deviceScaleFactor:1,
      reducedMotion:'reduce', locale:'pl-PL',
      userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/TEST) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 wv'
    });
    const androidPage = await androidContext.newPage();
    const androidErrors = [];
    androidPage.on('pageerror', err => androidErrors.push(err.message));
    await androidPage.goto(url, { waitUntil:'load', timeout:60000 });
    await androidPage.evaluate(() => document.getElementById('skip-name')?.click());
    await androidPage.waitForFunction(() => window.GeoPrzygodaFlagStatus?.().complete,
      null, { timeout:30000 });
    const androidClips = await androidPage.evaluate(({ iso, stripes }) => {
      const errors = [], striped = new Set(stripes);
      let mapped = 0, fragments = 0;
      for (const [id, code] of Object.entries(iso)) {
        const primary = document.getElementById('land-' + id);
        if (!primary) continue;
        mapped++;
        for (const piece of primary.parentElement.querySelectorAll('path.land')) {
          fragments++;
          const overlay = piece.nextElementSibling;
          if (!overlay?.classList.contains('geo8-flag-overlay')) {
            errors.push(id + ': no clipped PNG overlay'); continue;
          }
          const ref = /url\(#([^)]+)\)/.exec(overlay.getAttribute('clip-path') || '')?.[1];
          const boundary = ref && document.getElementById(ref)?.querySelector('path');
          if (!boundary || boundary.getAttribute('d') !== piece.getAttribute('d'))
            errors.push(id + ': clipped image extends beyond polygon or wrong geometry');
          if (overlay.getAttribute('pointer-events') !== 'none')
            errors.push(id + ': overlay blocks touches');
          if (/url\(/.test(piece.style.fill))
            errors.push(id + ': Android still depends on faulty SVG pattern painting');
          const image = overlay.querySelector('image');
          if (!image || image.getAttribute('href') !== 'flag-textures/' + code.toLowerCase() + '.png')
            errors.push(id + ': wrong or missing PNG');
          const expectedAspect = striped.has(id) ? ['none'] : ['xMidYMid meet','xMidYMid slice'];
          if (!expectedAspect.includes(image?.getAttribute('preserveAspectRatio')))
            errors.push(id + ': stretched flag emblem');
          if (overlay.style.display === 'none')
            errors.push(id + ': flag invisible when enabled');
          if (!overlay.querySelector('rect[fill]'))
            errors.push(id + ': missing solid backing under PNG');
        }
      }
      const before = document.querySelectorAll('.geo8-flag-overlay').length;
      const checkbox = document.getElementById('setting-flags');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change',{bubbles:true}));
      const hidden = [...document.querySelectorAll('.geo8-flag-overlay')]
        .every(overlay => overlay.style.display === 'none');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change',{bubbles:true}));
      const restored = [...document.querySelectorAll('.geo8-flag-overlay')]
        .every(overlay => overlay.style.display !== 'none');
      const belarus = document.getElementById('land-BLR');
      const original = belarus.nextElementSibling?.querySelector('image')?.getAttribute('href');
      window.GeoPrzygodaFitFlag('USA','BLR',belarus,0,true);
      const unchangedDuringAnimation =
        belarus.nextElementSibling?.querySelector('image')?.getAttribute('href') === original;
      window.GeoPrzygodaFitFlag('USA','BLR',belarus,0);
      const captured = belarus.nextElementSibling?.querySelector('image')?.getAttribute('href') ===
        'flag-textures/us.png';
      window.GeoPrzygodaResetFlagOverlay('BLR',belarus);
      const reset = belarus.nextElementSibling?.querySelector('image')?.getAttribute('href') === original;
      return { mapped, fragments, before, hidden, restored, unchangedDuringAnimation,
        captured, reset, errors };
    }, { iso, stripes:[...stripes] });
    if(androidClips.mapped < 190 || androidClips.fragments < 190 ||
        androidClips.before < 190 || !androidClips.hidden || !androidClips.restored ||
        !androidClips.unchangedDuringAnimation || !androidClips.captured ||
        !androidClips.reset || androidClips.errors.length || androidErrors.length)
      throw Error('Android-UA clipPath regression: ' +
        JSON.stringify({ ...androidClips, errors:androidClips.errors.slice(0,20),
          pageErrors:androidErrors }));
    await androidPage.screenshot({path:path.join(reportDir,'android-ua-clip.png')});
    await androidContext.close();

    const summary = {
      chromium: chrome,
      checkedSvgFiles: Object.keys(iso).length,
      renderedCountries: before.mapShapes,
      renderedFragments: before.fragments,
      fittedPieces: before.fittedPieces,
      stripePieces: before.stripePieces,
      zoomedCountries: zoomed,
      flagsToggle: toggled,
      restoredOverviewGeometry: true,
      battleForeignFlag: conquest,
      screenshotFiles: ['world.png', ...zoomTargets.map(x => x.toLowerCase() + '-zoom.png')],
      plan6Encyclopedia: plan6,
      plan6History: historyCheck,
      plan6RememberedName: remembered,
      plan7Menu, plan7Challenges, plan7Shop, plan7History, plan7Duel, persistedPlan7,
      androidUaClipRender: androidClips,
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
