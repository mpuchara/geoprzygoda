/* GeoPrzygoda: turn-based, imaginary country-level territory game. Works offline. */
(function () {
  'use strict';
  const key = 'geo-territory-battle-v1';
  const rivalry = $('rivalry-overlay');
  const regions = COUNTRY_DATA.filter(c => c.mapped && c.independent && c.area > 0 && $('land-' + c.id));
  const playable = new Map(regions.map(c => [c.id, c]));
  const neighbors = new Map(regions.map(c => [c.id, new Set()]));
  for (const c of regions) {
    for (const id of c.borders) {
      if (!playable.has(id) || id === c.id) continue;
      neighbors.get(c.id).add(id);
      neighbors.get(id).add(c.id);
    }
  }

  let game = null;
  let fighting = false;
  let selectedTarget = null;
  let battleTimer = null;
  let advanceFrame = null;
  let advanceScene = null;
  let historyFocus = null;
  let lastSaved = null;
  try {
    lastSaved = JSON.parse(localStorage.getItem(key) || 'null');
  } catch { lastSaved = null; }

  const panel = document.createElement('section');
  panel.id = 'territory-game';
  panel.className = 'territory-game hidden';
  panel.setAttribute('aria-label', 'Bitwa o terytoria');
  panel.innerHTML =
    '<div class="battle-head"><strong>⚔️ Bitwa o terytoria</strong><button id="battle-exit" aria-label="Zakończ rywalizację">×</button></div>' +
    '<div id="battle-title" class="battle-title"></div>' +
    '<div id="battle-stats" class="battle-stats"></div>' +
    '<label for="battle-target">Sąsiedni teren do zdobycia</label><select id="battle-target" class="battle-select"></select>' +
    '<div id="battlefield" class="battlefield hidden" role="status" aria-live="polite">' +
    '<div class="battle-soldiers"><span class="army-left">🪖 🛡️ 🪖</span><span class="army-middle">⚔️</span><span class="army-right">🪖 🛡️ 🪖</span></div>' +
    '<div id="battle-balance" class="battle-balance"></div>' +
    '<div class="battle-progress-caption"><span id="battle-stage">Przygotowanie</span><strong id="battle-progress-label">0%</strong></div>' +
    '<div id="battle-progress" class="battle-progress-track" role="progressbar" aria-label="Postęp zdobywania terenu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="battle-conquest-fill"></span></div></div>' +
    '<div id="battle-message" class="battle-message" aria-live="polite">Wybierz sąsiada i rozpocznij bitwę!</div>' +
    '<div class="battle-actions"><button id="battle-attack" class="battle-primary">⚔️ Bitwa żołnierska</button>' +
    '<button id="battle-history" class="battle-secondary">📜 Historia</button></div>' +
    '<p class="battle-disclaimer">Fikcyjna gra planszowa: oddziały i wynik są losowe. Granice małych sektorów są umowne. Na końcu można zdobyć całe państwo.</p>';
  app.append(panel);

  const history = document.createElement('div');
  history.id = 'battle-history-overlay';
  history.className = 'overlay extras-overlay hidden';
  history.setAttribute('role', 'dialog');
  history.setAttribute('aria-modal', 'true');
  history.setAttribute('aria-labelledby', 'battle-history-title');
  history.innerHTML =
    '<div class="extras-panel battle-history-panel"><button id="battle-history-close" class="close-overlay extras-close" aria-label="Zamknij historię">×</button>' +
    '<h2 id="battle-history-title">📜 Historia podbojów</h2>' +
    '<p>Tu zostają zapisane bitwy Twojej rozgrywki.</p><div id="battle-history-list" class="battle-history-list"></div>' +
    '<button id="battle-resume" class="battle-secondary battle-history-action hidden">▶ Wznów zapisaną grę</button>' +
    '<hr class="battle-divider"><h3>🏰 Scenariusz historyczny</h3>' +
    '<p><b>Rzeczpospolita Obojga Narodów</b> – zacznij jako Polska i Litwa, a potem zdobywaj sąsiednie tereny.</p>' +
    '<p class="battle-disclaimer">To swobodna zabawa inspirowana dawną unią Polski i Litwy, a nie dokładna rekonstrukcja granic historycznych.</p>' +
    '<button id="battle-commonwealth" class="battle-primary battle-history-action">🏰 Rozpocznij scenariusz</button></div>';
  document.body.append(history);

  // The existing Rivalry dialog remains usable for peaceful country comparisons.
  const rivalStart = document.createElement('button');
  rivalStart.id = 'rival-start-map';
  rivalStart.className = 'rival-compare rival-start-map';
  rivalStart.textContent = '⚔️ Start: Bitwa o terytoria';
  $('rival-compare').after(rivalStart);
  const rivalHistory = document.createElement('button');
  rivalHistory.id = 'rival-open-history';
  rivalHistory.className = 'rival-history-button';
  rivalHistory.textContent = '📜 Historia i scenariusze';
  rivalStart.after(rivalHistory);

  function ownerOf(id) {
    return game && game.owners[id] && playable.has(game.owners[id]) ? game.owners[id] : id;
  }
  function landsOf(owner) {
    return regions.filter(c => ownerOf(c.id) === owner);
  }
  function frontier() {
    if (!game) return [];
    const adjacent = new Set();
    for (const land of landsOf(game.player)) {
      for (const near of neighbors.get(land.id) || []) {
        if (ownerOf(near) !== game.player) adjacent.add(near);
      }
    }
    return [...adjacent].sort((a, b) => playable.get(a).n.localeCompare(playable.get(b).n, 'pl'));
  }
  function safeGame(raw) {
    if (!raw || raw.v !== 1 || !playable.has(raw.player) || !playable.has(raw.opponent)) return null;
    const owners = {};
    if (raw.owners && typeof raw.owners === 'object' && !Array.isArray(raw.owners)) {
      for (const [place, ruler] of Object.entries(raw.owners)) {
        if (playable.has(place) && playable.has(ruler)) owners[place] = ruler;
      }
    }
    return {
      v: 1,
      player: raw.player,
      opponent: raw.opponent,
      handicap: [0, 0.15, 0.3].includes(raw.handicap) ? raw.handicap : 0,
      scenario: raw.scenario === 'commonwealth' ? 'commonwealth' : 'free',
      round: Math.max(1, Math.min(10000, Number(raw.round) || 1)),
      owners,
      log: Array.isArray(raw.log) ? raw.log.filter(x => typeof x === 'string').slice(-70) : []
    };
  }
  function save() {
    if (!game) return;
    lastSaved = game;
    try { localStorage.setItem(key, JSON.stringify(game)); } catch { /* offline storage optional */ }
  }
  // Color every disconnected piece of a country (including islands).
  function countryPieces(id) {
    const primary = $('land-' + id);
    return primary ? primary.parentElement.querySelectorAll('path.land') : [];
  }
  // Fictional province-like sectors are generated in the existing Natural Earth
  // country geometry. A sector is NOT an administrative province.
  // This yields a locally irregular, branching conquest rather than a
  // rectangular wipe or a straight synthetic international border.
  function clearAdvance() {
    if (advanceFrame !== null) cancelAnimationFrame(advanceFrame);
    advanceFrame = null;
    if (!advanceScene) return;
    advanceScene.host.classList.remove('battle-attacking');
    for (const key of ['ink', 'front', 'markers', 'sectors', 'wipe', 'outline']) {
      advanceScene[key].remove();
    }
    advanceScene = null;
  }

  function sectorPolygon(sites, site, box) {
    let polygon = [
      [box.x, box.y], [box.x + box.width, box.y],
      [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]
    ];
    for (const other of sites) {
      if (site === other || polygon.length < 3) continue;
      const nx = 2 * (other.x - site.x), ny = 2 * (other.y - site.y);
      const limit = other.x * other.x + other.y * other.y -
                    site.x * site.x - site.y * site.y;
      const inside = p => nx * p[0] + ny * p[1] - limit;
      const next = [];
      for (let i = 0; i < polygon.length; i++) {
        const from = polygon[i], to = polygon[(i + 1) % polygon.length];
        const a = inside(from), b = inside(to);
        if (a <= 0) next.push(from);
        if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
          const t = a / (a - b);
          next.push([from[0] + (to[0] - from[0]) * t,
                     from[1] + (to[1] - from[1]) * t]);
        }
      }
      polygon = next;
    }
    return polygon;
  }

  function setAdvanceProgress(fraction) {
    const progress = Math.max(0, Math.min(1, fraction));
    const percent = Math.round(progress * 100);
    $('battle-conquest-fill').style.width = percent + '%';
    $('battle-progress-label').textContent = percent + '%';
    $('battle-progress').setAttribute('aria-valuenow', String(percent));
    if (!advanceScene) return;
    const scene = advanceScene;
    for (const cell of scene.cells) {
      const revealed = progress >= 0.999 || (progress > 0 && cell.threshold <= progress);
      if (revealed !== cell.visible) {
        cell.visible = revealed;
        cell.clip.style.display = revealed ? '' : 'none';
        cell.map.classList.toggle('conquered-sector', revealed);
      }
    }
    // The free-form front is also shown between the discrete sector captures.
    const { axis, box, seed } = scene;
    const waveSize = (axis.maxA - axis.minA) * 0.11 * Math.sin(Math.PI * progress);
    const curve = [];
    const count = 72;
    const toXY = (a, b) => {
      return [axis.cx + a * axis.nx - b * axis.ny,
              axis.cy + a * axis.ny + b * axis.nx];
    };
    for (let j = 0; j <= count; j++) {
      const u = j / count;
      const b = axis.minB + u * (axis.maxB - axis.minB);
      const rough = Math.sin(u * 8.4 + seed) * 0.50 +
                    Math.sin(u * 21.7 + seed * 1.9) * 0.28 +
                    Math.sin(u * 43.1 + seed * 2.3) * 0.14 +
                    Math.sin(u * 75.5 + seed * 0.7) * 0.08;
      const a = axis.minA + (axis.maxA - axis.minA) * progress +
                rough * waveSize;
      curve.push(toXY(a, b));
    }
    scene.front.setAttribute('d', curve.map((p, j) =>
      (j ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(''));
    scene.front.style.display = progress < 0.025 || progress > 0.99 ? 'none' : '';
    scene.markers.style.display = progress < 0.08 || progress > 0.97 ? 'none' : '';
    const step = Math.max(1, Math.floor((count - 8) / scene.troops.length));
    scene.troops.forEach((marker, k) => {
      const p = curve[Math.min(count - 3, 4 + k * step)];
      const size = Math.max(1.2, Math.min(2.8, view.w / 110));
      marker.setAttribute('x', (p[0] - size / 2).toFixed(2));
      marker.setAttribute('y', (p[1] - size / 3).toFixed(2));
      marker.setAttribute('width', String(size * 1.3));
      marker.setAttribute('height', String(size));
    });
  }

  function createAdvance(targetId) {
    clearAdvance();
    const primary = $('land-' + targetId);
    if (!primary || !primary.ownerSVGElement || !game) return;
    const host = primary.parentElement, svg = primary.ownerSVGElement;
    const paths = [...countryPieces(targetId)];
    if (!paths.length) return;
    // The principal region, not an overseas dependency or a detached island,
    // determines the attack direction and the width of the temporary front.
    let box;
    try { box = primary.getBBox(); } catch { return; }
    if (!box || box.width < 0.01 || box.height < 0.01) return;
    const ns = 'http://www.w3.org/2000/svg';
    const make = tag => document.createElementNS(ns, tag);
    let defs = svg.querySelector('defs');
    if (!defs) { defs = make('defs'); svg.insertBefore(defs, svg.firstChild); }
    const outline = make('clipPath');
    outline.id = 'battle-advance-outline';
    outline.setAttribute('clipPathUnits', 'userSpaceOnUse');
    for (const path of paths) {
      const shape = path.cloneNode(false);
      shape.removeAttribute('id');
      shape.removeAttribute('class');
      shape.removeAttribute('style');
      outline.append(shape);
    }
    defs.append(outline);
    const wipe = make('clipPath');
    wipe.id = 'battle-advance-wipe';
    wipe.setAttribute('clipPathUnits', 'userSpaceOnUse');
    defs.append(wipe);

    const sourceBox = owned => {
      const node = $('land-' + owned.id);
      try { return node ? node.getBBox() : null; } catch { return null; }
    };
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    let nearest = null, best = Infinity;
    for (const owned of landsOf(game.player)) {
      const other = sourceBox(owned);
      if (!other) continue;
      const gapX = Math.max(0, box.x - (other.x + other.width),
                           other.x - (box.x + box.width));
      const gapY = Math.max(0, box.y - (other.y + other.height),
                           other.y - (box.y + box.height));
      const distance = Math.hypot(gapX, gapY);
      if (distance < best) {
        best = distance;
        nearest = { x: other.x + other.width / 2,
                    y: other.y + other.height / 2 };
      }
    }
    const dx = cx - (nearest ? nearest.x : cx - 1);
    const dy = cy - (nearest ? nearest.y : cy);
    const magnitude = Math.max(0.001, Math.hypot(dx, dy));
    const nx = dx / magnitude, ny = dy / magnitude;
    const corners = [[box.x, box.y], [box.x + box.width, box.y],
                     [box.x, box.y + box.height],
                     [box.x + box.width, box.y + box.height]];
    const aCoords = corners.map(p => (p[0] - cx) * nx + (p[1] - cy) * ny);
    const bCoords = corners.map(p => -(p[0] - cx) * ny + (p[1] - cy) * nx);
    const axis = {
      cx, cy, nx, ny,
      minA: Math.min(...aCoords), maxA: Math.max(...aCoords),
      minB: Math.min(...bCoords), maxB: Math.max(...bCoords)
    };
    const seed = [...targetId].reduce((v, ch) => v * 1.4 + ch.charCodeAt(0), 1) +
                 game.round * 1.71;
    const random = (i, j) => {
      const raw = Math.sin(i * 127.1 + j * 311.7 + seed * 8.23) * 43758.5453;
      return raw - Math.floor(raw);
    };
    const cols = Math.max(4, Math.min(9, Math.round(box.width / 4)));
    const rows = Math.max(4, Math.min(9, Math.round(box.height / 4)));
    const sites = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      sites.push({
        x: box.x + box.width * (x + 0.22 + random(x, y) * 0.56) / cols,
        y: box.y + box.height * (y + 0.22 + random(y + 13, x) * 0.56) / rows
      });
    }
    const sections = make('g');
    sections.classList.add('battle-sector-grid');
    sections.setAttribute('clip-path', 'url(#battle-advance-outline)');
    const cells = [];
    for (const [index, site] of sites.entries()) {
      const polygon = sectorPolygon(sites, site, box);
      if (polygon.length < 3) continue;
      const d = polygon.map((p, j) =>
        (j ? 'L' : 'M') + p[0].toFixed(3) + ',' + p[1].toFixed(3)).join('') + 'Z';
      const clip = make('path');
      clip.setAttribute('d', d);
      clip.style.display = 'none';
      wipe.append(clip);
      const mapPath = make('path');
      mapPath.classList.add('battle-sector-outline');
      mapPath.setAttribute('d', d);
      sections.append(mapPath);
      const location = ((site.x - cx) * nx + (site.y - cy) * ny -
                        axis.minA) / (axis.maxA - axis.minA);
      const jitter = (random(index, 61) - 0.5) * 0.075;
      cells.push({
        clip, map: mapPath, visible: false,
        threshold: Math.min(0.995, Math.max(0.025, location + jitter))
      });
    }

    const attackerShape = $('land-' + game.player);
    const fill = map.classList.contains('flag-fill')
      ? 'url(#flag-pattern-' + game.player + ')'
      : (attackerShape && attackerShape.getAttribute('fill')) || '#77cfa3';
    const ink = make('g');
    ink.classList.add('battle-advance-overlay');
    ink.setAttribute('clip-path', 'url(#battle-advance-outline)');
    const color = make('rect');
    color.setAttribute('x', String(box.x - 1));
    color.setAttribute('y', String(box.y - 1));
    color.setAttribute('width', String(box.width + 2));
    color.setAttribute('height', String(box.height + 2));
    color.setAttribute('fill', fill);
    color.setAttribute('clip-path', 'url(#battle-advance-wipe)');
    ink.append(color);
    const front = make('path');
    front.classList.add('battle-front-line');
    front.setAttribute('clip-path', 'url(#battle-advance-outline)');
    const markers = make('g');
    markers.classList.add('battle-front-troops');
    markers.setAttribute('clip-path', 'url(#battle-advance-outline)');
    const troops = [];
    for (let i = 0; i < 11; i++) {
      const flag = make('rect');
      flag.classList.add('battle-front-flag');
      flag.setAttribute('fill', fill);
      markers.append(flag);
      troops.push(flag);
    }
    host.append(ink, sections, front, markers);
    host.classList.add('battle-attacking');
    advanceScene = { host, ink, sectors: sections, front, markers, troops,
                     wipe, outline, box, axis, seed, cells };
    setAdvanceProgress(0);
  }

  function playAdvance(targetId, won, duration) {
    createAdvance(targetId);
    const started = performance.now();
    const stage = $('battle-stage');
    stage.textContent = '🗺️ Ruch oddziałów przez sektory';
    if (reduced) { setAdvanceProgress(won ? 1 : 0); return; }
    function frame(now) {
      const t = Math.max(0, Math.min(1, (now - started) / duration));
      const progress = won ? t :
        (t < 0.64 ? t / 0.64 * 0.75 : 0.75 * (1 - (t - 0.64) / 0.36));
      setAdvanceProgress(progress);
      stage.textContent = won ? '🏳️ Zdobywanie kolejnych sektorów' :
        (t < 0.64 ? '⚔️ Natarcie na sąsiednie sektory' : '🛡️ Obrona odzyskuje teren');
      if (t < 1 && fighting && game) advanceFrame = requestAnimationFrame(frame);
      else advanceFrame = null;
    }
    advanceFrame = requestAnimationFrame(frame);
  }
  function restoreOriginalColors() {
    for (const c of regions) {
      for (const shape of countryPieces(c.id)) {
        const showFlag = map.classList.contains('flag-fill') && c.code;
        if (showFlag) shape.style.fill = 'url(#flag-pattern-' + c.id + ')';
        else shape.style.removeProperty('fill');
        shape.classList.remove('battle-owned');
      }
    }
    map.querySelectorAll('.battle-target-country').forEach(n => n.classList.remove('battle-target-country'));
  }
  function refreshOwnership() {
    if (!game) return;
    for (const c of regions) {
      const holder = ownerOf(c.id);
      const owner = playable.get(holder);
      const showFlag = map.classList.contains('flag-fill') && owner && owner.code;
      for (const shape of countryPieces(c.id)) {
        if (showFlag) shape.style.fill = 'url(#flag-pattern-' + holder + ')';
        else if (holder !== c.id) {
          const parent = $('land-' + holder);
          shape.style.fill = parent ? parent.getAttribute('fill') : '#b7d8a8';
        } else shape.style.removeProperty('fill');
        shape.classList.toggle('battle-owned', holder !== c.id);
      }
    }
    map.querySelectorAll('.battle-target-country').forEach(n => n.classList.remove('battle-target-country'));
    if (selectedTarget) {
      const target = $('land-' + selectedTarget);
      if (target && target.parentNode) target.parentNode.classList.add('battle-target-country');
    }
  }
  function countryLabel(id) {
    const c = playable.get(id);
    return c ? (c.flag || '🌍') + ' ' + c.n : id;
  }
  function note(line) {
    if (!game) return;
    game.log.push(line);
    if (game.log.length > 70) game.log.shift();
    save();
  }
  function drawTargets(preferred) {
    if (!game) return;
    const options = frontier();
    const select = $('battle-target');
    select.replaceChildren();
    for (const id of options) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = countryLabel(id) + (ownerOf(id) !== id ? ' (terytorium: ' + playable.get(ownerOf(id)).n + ')' : '');
      select.append(option);
    }
    selectedTarget = options.includes(preferred) ? preferred : options[0] || null;
    if (selectedTarget) select.value = selectedTarget;
    $('battle-attack').disabled = !selectedTarget || fighting;
    if (!selectedTarget) $('battle-message').textContent = 'Nie ma już sąsiednich terenów do zdobycia!';
    refreshOwnership();
    if (window.GeoPrzygodaPicker) window.GeoPrzygodaPicker.refreshBattle();
  }
  function updatePanel(preferred) {
    if (!game) return;
    const leader = playable.get(game.player);
    const lands = landsOf(game.player);
    const size = lands.reduce((total, c) => total + c.area, 0);
    const commonwealth = game.scenario === 'commonwealth';
    $('battle-title').textContent = commonwealth ? '🏰 Rzeczpospolita Obojga Narodów (scenariusz)' :
      leader.flag + ' ' + leader.n + ' – Twoje państwo';
    $('battle-stats').textContent = 'Tereny: ' + lands.length + ' · Powierzchnia (na mapie): ' +
      Math.round(size).toLocaleString('pl-PL') + ' km² · Tura: ' + game.round;
    drawTargets(preferred);
    if (commonwealth && ownerOf('POL') === game.player &&
        ownerOf('LTU') === game.player && ownerOf('BLR') === game.player &&
        ownerOf('UKR') === game.player && !game.log.includes('🏰 Cel scenariusza osiągnięty!')) {
      $('battle-message').textContent = '🏰 Cel scenariusza osiągnięty! Rzeczpospolita Obojga Narodów – w umownej mapie gry.';
      note('🏰 Cel scenariusza osiągnięty!');
    }
  }
  function stop() {
    if (battleTimer !== null) clearTimeout(battleTimer);
    battleTimer = null;
    clearAdvance();
    fighting = false;
    if (game) save();
    game = null;
    selectedTarget = null;
    panel.classList.add('hidden');
    panel.classList.remove('battle-cinematic');
    app.classList.remove('battle-running');
    $('battlefield').classList.add('hidden');
    $('battlefield').classList.remove('running');
    restoreOriginalColors();
    paint();
  }
  function start(player, opponent, handicap = 0, scenario = 'free') {
    if (!playable.has(player) || !playable.has(opponent) || player === opponent) {
      announce('Wybierz dwa różne państwa na mapie.');
      return;
    }
    stop();
    closeCountry();
    if (mode !== 'explore') setMode('explore');
    game = {
      v: 1, player, opponent,
      handicap: [0, 0.15, 0.3].includes(handicap) ? handicap : 0,
      scenario, round: 1, owners: {}, log: []
    };
    if (scenario === 'commonwealth') game.owners.LTU = 'POL';
    note(scenario === 'commonwealth'
      ? '🏰 Start scenariusza: Polska i Litwa jako jedno państwo w uproszczonej grze.'
      : '🏁 Rozpoczyna się rywalizacja: ' + countryLabel(player) + ' kontra ' + countryLabel(opponent) + '.');
    panel.classList.remove('hidden');
    app.classList.add('battle-running');
    $('battle-message').textContent = 'Dotknij sąsiedniego kraju na mapie albo wybierz go z listy.';
    updatePanel(opponent);
    focusCountry(player);
    save();
  }
  function resume() {
    const restored = safeGame(lastSaved);
    if (!restored) {
      announce('Nie znaleziono zapisanej rozgrywki.');
      return;
    }
    stop();
    closeCountry();
    if (mode !== 'explore') setMode('explore');
    game = restored;
    panel.classList.remove('hidden');
    app.classList.add('battle-running');
    $('battle-message').textContent = 'Wznowiono grę. Wybierz teren do ataku.';
    updatePanel(game.opponent);
  }
  function chooseTarget(id) {
    if (!game || fighting) return;
    if (ownerOf(id) === game.player) {
      announce('Ten teren już należy do Ciebie! Wybierz sąsiada.');
      return;
    }
    if (!frontier().includes(id)) {
      announce('Najpierw zdobądź teren graniczący z Twoim państwem.');
      return;
    }
    selectedTarget = id;
    $('battle-target').value = id;
    $('battle-message').textContent = 'Cel: ' + countryLabel(id) + '. Wciśnij „Bitwa żołnierska”.';
    refreshOwnership();
    if (window.GeoPrzygodaPicker) window.GeoPrzygodaPicker.refreshBattle();
  }
  function attack() {
    if (!game || fighting || !selectedTarget || !frontier().includes(selectedTarget)) return;
    fighting = true;
    panel.classList.add('battle-cinematic');
    const defenderId = selectedTarget;
    const defendingOwner = ownerOf(defenderId);
    const attacker = playable.get(game.player);
    const defender = playable.get(defenderId);
    const conquered = landsOf(game.player).length;
    const enemyLands = landsOf(defendingOwner).length;
    // Entirely fictional strength values; independent of real armed forces.
    const attackerRoll = Math.round(36 + Math.min(20, conquered * 3) + Math.random() * 38 -
                                    game.handicap * 35);
    const defenderRoll = Math.round(35 + Math.min(20, enemyLands * 3) + Math.random() * 35);
    const won = attackerRoll >= defenderRoll;
    const turn = game.round;
    $('battle-attack').disabled = true;
    const field = $('battlefield');
    field.classList.remove('hidden');
    field.classList.remove('running');
    void field.offsetWidth;
    field.classList.add('running');
    $('battle-balance').textContent = attacker.flag + ' ' + attackerRoll +
      ' pkt ⚔️ ' + defenderRoll + ' pkt ' + defender.flag;
    $('battle-message').textContent = 'Trwa bitwa o ' + defender.n + '...';
    focusCountry(defenderId);
    const duration = reduced ? 250 : 6500;
    playAdvance(defenderId, won, duration);
    battleTimer = setTimeout(() => {
      if (!game) return;
      battleTimer = null;
      setAdvanceProgress(won ? 1 : 0);
      clearAdvance();
      fighting = false;
      panel.classList.remove('battle-cinematic');
      field.classList.remove('running');
      $('battle-stage').textContent = won ? '🏆 Teren zdobyty!' : '🛡️ Obrona zwyciężyła';
      game.round += 1;
      if (won) {
        game.owners[defenderId] = game.player;
        $('battle-message').textContent = '🏆 Zwycięstwo! ' + defender.n + ' przechodzi pod kontrolę ' + attacker.n + ' w naszej grze!';
        note('Tura ' + turn + ': ' + attacker.n + ' zdobywa ' + defender.n +
             ' (' + attackerRoll + ':' + defenderRoll + ').');
      } else {
        $('battle-message').textContent = '🛡️ ' + defender.n + ' obronił teren. Spróbuj ponownie!';
        note('Tura ' + turn + ': ' + defender.n + ' obronił teren przed ' + attacker.n +
             ' (' + defenderRoll + ':' + attackerRoll + ').');
      }
      updatePanel(won ? null : defenderId);
    }, duration);
  }
  function renderHistory() {
    const list = $('battle-history-list');
    list.replaceChildren();
    const saved = game || safeGame(lastSaved);
    $('battle-resume').classList.toggle('hidden', !!game || !safeGame(lastSaved));
    if (!saved || !saved.log.length) {
      const el = document.createElement('p');
      el.textContent = 'Jeszcze nie było żadnej bitwy. Wybierz kraj i rozpocznij grę!';
      list.append(el);
    } else {
      for (const line of [...saved.log].reverse()) {
        const item = document.createElement('p');
        item.className = 'battle-history-entry';
        item.textContent = line;
        list.append(item);
      }
    }
  }
  function openHistory() {
    if (!$('battle-history-overlay').classList.contains('hidden')) return;
    // The Rivalry modal needs to close before another modal opens.
    const rivalClose = rivalry.querySelector('[data-extra-close="rivalry-overlay"]');
    if (!rivalry.classList.contains('hidden') && rivalClose) rivalClose.click();
    historyFocus = document.activeElement;
    renderHistory();
    history.classList.remove('hidden');
    app.inert = true;
    $('battle-history-close').focus();
  }
  function closeHistory() {
    if (history.classList.contains('hidden')) return;
    history.classList.add('hidden');
    app.inert = false;
    if (historyFocus && historyFocus.isConnected) historyFocus.focus({preventScroll:true});
    historyFocus = null;
  }
  rivalStart.addEventListener('click', () => {
    const first = $('rival-first').dataset.country;
    const other = $('rival-opponent').value;
    const penalty = Number($('rival-disadvantage').value);
    const close = rivalry.querySelector('[data-extra-close="rivalry-overlay"]');
    if (close) close.click();
    start(first, other, penalty);
  });
  rivalHistory.addEventListener('click', openHistory);
  $('battle-history').addEventListener('click', openHistory);
  $('battle-exit').addEventListener('click', stop);
  $('battle-attack').addEventListener('click', attack);
  $('battle-target').addEventListener('change', e => chooseTarget(e.target.value));
  $('battle-history-close').addEventListener('click', closeHistory);
  history.addEventListener('click', e => { if (e.target === history) closeHistory(); });
  $('battle-resume').addEventListener('click', () => { closeHistory(); resume(); });
  $('battle-commonwealth').addEventListener('click', () => {
    closeHistory();
    start('POL', 'BLR', 0, 'commonwealth');
    $('battle-message').textContent = '🏰 Polska i Litwa zaczynają razem. Celem sąsiednie tereny – zdobądź Białoruś i Ukrainę!';
  });

  document.addEventListener('keydown', e => {
    if (history.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeHistory();
    } else if (e.key === 'Tab') {
      const nodes = [...history.querySelectorAll('button,input,select,a')].filter(el => !el.disabled && !el.classList.contains('hidden'));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  const previousOpenCountry = openCountry;
  openCountry = function (id, focus) {
    if (game) { chooseTarget(id); return; }
    return previousOpenCountry(id, focus);
  };
  const previousSetMode = setMode;
  setMode = function (next) {
    if (next === 'quiz' && game) stop();
    return previousSetMode(next);
  };
  const previousNativeBack = window.GeoPrzygodaApp.onBack.bind(window.GeoPrzygodaApp);
  window.GeoPrzygodaApp.onBack = function () {
    if (!history.classList.contains('hidden')) { closeHistory(); return true; }
    if (game) { stop(); return true; }
    return previousNativeBack();
  };
  window.GeoPrzygodaBattle = {
    refresh: refreshOwnership,
    start,
    get active() { return !!game; },
    openHistory,
    stop
  };
})();
