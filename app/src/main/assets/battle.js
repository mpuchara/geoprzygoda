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
    '<div id="battle-balance" class="battle-balance"></div></div>' +
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
  function restoreOriginalColors() {
    for (const c of regions) {
      const shape = $('land-' + c.id);
      if (!shape) continue;
      const showFlag = map.classList.contains('flag-fill') && c.code;
      if (showFlag) shape.style.fill = 'url(#flag-pattern-' + c.id + ')';
      else shape.style.removeProperty('fill');
      shape.classList.remove('battle-owned');
    }
    map.querySelectorAll('.battle-target-country').forEach(n => n.classList.remove('battle-target-country'));
  }
  function refreshOwnership() {
    if (!game) return;
    for (const c of regions) {
      const shape = $('land-' + c.id);
      if (!shape) continue;
      const holder = ownerOf(c.id);
      const holderCountry = playable.get(holder);
      const showFlag = map.classList.contains('flag-fill') && holderCountry && holderCountry.code;
      if (showFlag) shape.style.fill = 'url(#flag-pattern-' + holder + ')';
      else if (holder !== c.id) {
        const parent = $('land-' + holder);
        shape.style.fill = parent ? parent.getAttribute('fill') : '#b7d8a8';
      } else shape.style.removeProperty('fill');
      shape.classList.toggle('battle-owned', holder !== c.id);
    }
    for (const node of map.querySelectorAll('.battle-target-country')) node.classList.remove('battle-target-country');
    if (selectedTarget) {
      const targetShape = $('land-' + selectedTarget);
      if (targetShape && targetShape.parentNode) targetShape.parentNode.classList.add('battle-target-country');
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
    fighting = false;
    if (game) save();
    game = null;
    selectedTarget = null;
    panel.classList.add('hidden');
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
    const field = $('battlefield');
    field.classList.remove('hidden');
    field.classList.remove('running');
    void field.offsetWidth;
    field.classList.add('running');
    $('battle-balance').textContent = attacker.flag + ' ' + attackerRoll +
      ' pkt ⚔️ ' + defenderRoll + ' pkt ' + defender.flag;
    $('battle-message').textContent = 'Trwa bitwa o ' + defender.n + '...';
    focusCountry(defenderId);
    battleTimer = setTimeout(() => {
      if (!game) return;
      battleTimer = null;
      fighting = false;
      field.classList.remove('running');
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
    }, reduced ? 250 : 2100);
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
