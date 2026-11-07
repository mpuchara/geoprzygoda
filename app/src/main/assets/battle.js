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
    '<p class="battle-disclaimer">Fikcyjna gra planszowa: oddziały i wynik są losowe. Każdy teren to całe państwo ze współczesnej mapy.</p>';
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
  // The front line is drawn directly on the offline SVG map, not over a screenshot.
  // All changes remain temporary until the fictional battle is decided.
  function clearAdvance() {
    if (advanceFrame !== null) cancelAnimationFrame(advanceFrame);
    advanceFrame = null;
    if (!advanceScene) return;
    advanceScene.host.classList.remove('battle-attacking');
    advanceScene.ink.remove();
    advanceScene.front.remove();
    advanceScene.wipe.remove();
    advanceScene.outline.remove();
    advanceScene = null;
  }
  // Geography-first, irregular conquest front. This is a fictional visual
  // effect, but it follows the actual country polygon, never a vertical wipe.
  function gapBetween(a, b) {
    const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
    const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
    return dx * dx + dy * dy;
  }
  function pathBox(path) {
    try {
      const box = path.getBBox();
      if (box.width > 0 && box.height > 0) return box;
    } catch { /* tiny map geometry may not have a visible bounding box */ }
    return null;
  }
  function borderPoints(path, maxPoints = 48) {
    let length;
    try { length = path.getTotalLength(); } catch { return []; }
    if (!Number.isFinite(length) || length <= 0) return [];
    const points = [];
    const n = Math.max(20, Math.min(maxPoints, Math.ceil(length / 2)));
    for (let i = 0; i < n; i++) {
      const pt = path.getPointAtLength(length * i / n);
      if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) points.push({ x: pt.x, y: pt.y });
    }
    return points;
  }
  function ownedBorderPaths(targetBox) {
    const target = byId.get(selectedTarget);
    // A newly captured neighboring country can be the best starting point.
    const owned = landsOf(game.player)
      .sort((a, b) => {
        const A = { x: a.b[0], y: a.b[1], width: a.b[2] - a.b[0], height: a.b[3] - a.b[1] };
        const B = { x: b.b[0], y: b.b[1], width: b.b[2] - b.b[0], height: b.b[3] - b.b[1] };
        return gapBetween(targetBox, A) - gapBetween(targetBox, B);
      }).slice(0, 7);
    const pieces = [];
    for (const c of owned) {
      for (const path of countryPieces(c.id)) {
        const box = pathBox(path);
        if (box) pieces.push({ path, box });
        if (pieces.length >= 110) break;
      }
      if (pieces.length >= 110) break;
    }
    return pieces.sort((a, b) => gapBetween(targetBox, a.box) - gapBetween(targetBox, b.box)).slice(0, 10);
  }
  function startingPoint(targetPath, targetBox, sources) {
    const points = borderPoints(targetPath, 68);
    let closest = null, minDistance = Infinity;
    for (const source of sources.slice().sort((a, b) =>
      gapBetween(targetBox, a.box) - gapBetween(targetBox, b.box)).slice(0, 4)) {
      const ownPoints = borderPoints(source.path, 55);
      for (const a of points) {
        for (const b of ownPoints) {
          const distance = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
          if (distance < minDistance) { minDistance = distance; closest = a; }
        }
      }
    }
    if (closest) return closest;
    // No available border: start from the side nearest our home country.
    const home = byId.get(game.player);
    if (home) {
      const hx = home.x, hy = home.y;
      const fallback = points.reduce((best, point) => {
        const d = (point.x - hx) ** 2 + (point.y - hy) ** 2;
        return d < best.distance ? { point, distance: d } : best;
      }, { point: null, distance: Infinity });
      if (fallback.point) return fallback.point;
    }
    return { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
  }
  function jaggedFront(origin, radius, seed) {
    // Several smooth waves produce an uneven frontier, never a straight cut.
    // No randomness per frame: the outline stays coherent during movement.
    const segments = 72;
    const points = [];
    for (let i = 0; i < segments; i++) {
      const angle = Math.PI * 2 * i / segments;
      const bend = 1 + 0.105 * Math.sin(5 * angle + seed * 0.41)
        + 0.063 * Math.sin(11 * angle + seed * 1.17)
        + 0.028 * Math.sin(19 * angle + seed * 0.73);
      const x = origin.x + Math.cos(angle) * radius * bend;
      const y = origin.y + Math.sin(angle) * radius * bend;
      points.push(x.toFixed(2) + ',' + y.toFixed(2));
    }
    return 'M' + points.join('L') + 'Z';
  }
  function setAdvanceProgress(fraction) {
    const progress = Math.max(0, Math.min(1, fraction));
    const percent = Math.round(progress * 100);
    $('battle-conquest-fill').style.width = percent + '%';
    $('battle-progress-label').textContent = percent + '%';
    $('battle-progress').setAttribute('aria-valuenow', String(percent));
    if (!advanceScene) return;
    for (const wave of advanceScene.waves) {
      // Radius grows from the nearest shared border, not from the west edge.
      // The sqrt curve makes early gains easy to see on small screens.
      const radius = Math.max(0.025, wave.maxRadius * 1.36 * Math.sqrt(progress));
      const contour = jaggedFront(wave.origin, radius, wave.seed);
      wave.mask.setAttribute('d', contour);
      wave.edge.setAttribute('d', contour);
      wave.edge.style.display = progress > 0.002 && progress < 0.998 ? '' : 'none';
    }
  }
  function createAdvance(targetId) {
    clearAdvance();
    const primary = $('land-' + targetId);
    if (!primary || !primary.ownerSVGElement) return;
    const host = primary.parentElement;
    const paths = [...countryPieces(targetId)];
    if (!paths.length) return;
    const boxes = paths.map(path => ({ path, box: pathBox(path) })).filter(item => item.box);
    if (!boxes.length) return;
    const svg = primary.ownerSVGElement;
    const ns = 'http://www.w3.org/2000/svg';
    const make = tag => document.createElementNS(ns, tag);
    let defs = svg.querySelector('defs');
    if (!defs) { defs = make('defs'); svg.insertBefore(defs, svg.firstChild); }
    const wipe = make('clipPath');
    wipe.id = 'battle-advance-wipe';
    wipe.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const outline = make('clipPath');
    outline.id = 'battle-advance-outline';
    outline.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const ink = make('g');
    ink.classList.add('battle-advance-overlay');
    ink.setAttribute('clip-path', 'url(#battle-advance-wipe)');
    const front = make('g');
    front.classList.add('battle-advance-front');
    front.setAttribute('clip-path', 'url(#battle-advance-outline)');
    front.style.pointerEvents = 'none';
    const attackerShape = $('land-' + game.player);
    const fill = map.classList.contains('flag-fill')
      ? 'url(#flag-pattern-' + game.player + ')'
      : (attackerShape && attackerShape.getAttribute('fill')) || '#77cfa3';
    for (const path of paths) {
      const stencil = path.cloneNode(false);
      stencil.removeAttribute('id'); stencil.removeAttribute('class'); stencil.removeAttribute('style');
      outline.append(stencil);
      const colored = path.cloneNode(false);
      colored.removeAttribute('id'); colored.removeAttribute('class'); colored.removeAttribute('style');
      colored.setAttribute('fill', fill); colored.setAttribute('stroke', 'none');
      ink.append(colored);
    }
    const main = boxes.slice().sort((a, b) =>
      b.box.width * b.box.height - a.box.width * a.box.height);
    const sources = ownedBorderPaths(main[0].box);
    const waves = [];
    // Major land pieces advance separately. Tiny islets are recolored when
    // the battle ends without asking the phone to animate hundreds of paths.
    for (const item of main.slice(0, 24)) {
      const box = item.box;
      const origin = startingPoint(item.path, box, sources);
      const corners = [
        [box.x, box.y], [box.x + box.width, box.y],
        [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]
      ];
      const maxRadius = Math.max(...corners.map(([x, y]) => Math.hypot(x - origin.x, y - origin.y)));
      const mask = make('path');
      wipe.append(mask);
      const edge = make('path');
      edge.classList.add('battle-front-line');
      front.append(edge);
      const seed = targetId.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
        + waves.length * 23;
      waves.push({ mask, edge, origin, maxRadius, seed });
    }
    defs.append(wipe, outline);
    host.append(ink, front);
    host.classList.add('battle-attacking');
    advanceScene = { host, ink, front, wipe, outline, waves };
    setAdvanceProgress(0);
  }
  function playAdvance(targetId, won, duration) {
    createAdvance(targetId);
    const startAt = performance.now();
    const stage = $('battle-stage');
    stage.textContent = '⚡ Linia frontu';
    if (reduced) {
      setAdvanceProgress(won ? 1 : 0);
      return;
    }
    function frame(now) {
      const t = Math.max(0, Math.min(1, (now - startAt) / duration));
      const progress = won ? t : (t < 0.60 ? (t / 0.60) * 0.72 : 0.72 * (1 - (t - 0.60) / 0.40));
      setAdvanceProgress(progress);
      stage.textContent = won ? '🏳️ Zdobywanie terenu' :
        (t < 0.60 ? '⚔️ Trwa natarcie' : '🛡️ Obrona odpycha atak');
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
    panel.classList.remove('battle-animating');
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
    panel.classList.add('battle-animating');
    const field = $('battlefield');
    field.classList.remove('hidden');
    field.classList.remove('running');
    void field.offsetWidth;
    field.classList.add('running');
    $('battle-balance').textContent = attacker.flag + ' ' + attackerRoll +
      ' pkt ⚔️ ' + defenderRoll + ' pkt ' + defender.flag;
    $('battle-message').textContent = 'Trwa bitwa o ' + defender.n + '...';
    focusCountry(defenderId);
    const duration = reduced ? 250 : 3200;
    playAdvance(defenderId, won, duration);
    battleTimer = setTimeout(() => {
      if (!game) return;
      battleTimer = null;
      setAdvanceProgress(won ? 1 : 0);
      clearAdvance();
      fighting = false;
      panel.classList.remove('battle-animating');
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
