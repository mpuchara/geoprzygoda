/* GeoPrzygoda: optional offline enhancements. No network, tracking or external audio. */
(function () {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  const flagsKey = 'geo-flags', musicKey = 'geo-music', volumeKey = 'geo-volume';
  let flagsEnabled = readStore(flagsKey) !== 'off';
  let audio = null, master = null, priorFocus = null, activeOrigin = null;
  const settings = document.createElement('div');
  settings.className = 'overlay extras-overlay hidden';
  settings.id = 'settings-overlay';
  settings.setAttribute('role', 'dialog');
  settings.setAttribute('aria-modal', 'true');
  settings.setAttribute('aria-labelledby', 'settings-title');
  settings.innerHTML =
    '<div class="extras-panel"><button class="close-overlay extras-close" data-extra-close="settings-overlay" aria-label="Zamknij ustawienia">×</button>' +
    '<h2 id="settings-title">⚙️ Ustawienia</h2><p>Spraw, żeby odkrywanie świata było takie, jak lubisz.</p>' +
    '<label class="extra-setting"><span><strong>🏳️ Flagi na mapie</strong><small>Kolory flag wypełniają kształty państw, tak jak na prawdziwej mapie.</small></span><input id="setting-flags" type="checkbox"></label>' +
    '<label class="extra-setting"><span><strong>🎵 Spokojne dźwięki</strong><small>Delikatna, oryginalna melodia tworzona na telefonie. Działa offline.</small></span><input id="setting-music" type="checkbox"></label>' +
    '<label class="extra-setting extra-volume"><span><strong>🔉 Głośność</strong><small>Wybierz głośność muzyki.</small></span><input id="setting-volume" type="range" min="0" max="100" step="5" value="35" aria-label="Głośność muzyki"></label>' +
    '<p class="extra-note">Ustawienia zapisują się tylko na tym urządzeniu.</p></div>';
  const rivalry = document.createElement('div');
  rivalry.className = 'overlay extras-overlay hidden';
  rivalry.id = 'rivalry-overlay';
  rivalry.setAttribute('role', 'dialog');
  rivalry.setAttribute('aria-modal', 'true');
  rivalry.setAttribute('aria-labelledby', 'rivalry-title');
  rivalry.innerHTML =
    '<div class="extras-panel"><button class="close-overlay extras-close" data-extra-close="rivalry-overlay" aria-label="Zamknij rywalizację">×</button>' +
    '<h2 id="rivalry-title">🏁 Rywalizacja państw</h2>' +
    '<p>Wybierz dwa kraje i sprawdź wynik zabawy geograficznej. To nie jest prawdziwa wojna ani prognoza.</p>' +
    '<div class="rival-first" id="rival-first"></div>' +
    '<label class="rival-label" for="rival-opponent">Wybierz drugie państwo</label><select id="rival-opponent" class="rival-select"></select>' +
    '<label class="rival-label" for="rival-disadvantage">Utrudnienie dla pierwszego kraju</label>' +
    '<select id="rival-disadvantage" class="rival-select"><option value="0">Bez utrudnień</option><option value="0.15">Trudny teren (−15%)</option><option value="0.30">Bez sprzętu (−30%)</option></select>' +
    '<button id="rival-compare" class="rival-compare">🏁 Porównaj państwa</button><div id="rival-result" aria-live="polite"></div>' +
    '<p class="extra-note">Tryb „bez broni”: punkty są liczone wyłącznie z powierzchni i liczby sąsiadów z atlasu. Nie pokazujemy liczebności armii, bo obecna baza nie zawiera sprawdzonych danych wojskowych.</p></div>';
  document.body.append(settings, rivalry);

  const settingsButton = document.createElement('button');
  settingsButton.id = 'open-settings';
  settingsButton.className = 'dock-info';
  settingsButton.textContent = '⚙';
  settingsButton.setAttribute('aria-label', 'Otwórz ustawienia');
  $('open-about').before(settingsButton);

  function openExtra(panel, focusId) {
    priorFocus = document.activeElement;
    panel.classList.remove('hidden');
    app.inert = true;
    (focusId ? $(focusId) : panel.querySelector('button')).focus({ preventScroll: true });
  }
  function closeExtra(id) {
    const panel = $(id);
    if (panel.classList.contains('hidden')) return;
    panel.classList.add('hidden');
    app.inert = false;
    if (priorFocus && priorFocus.isConnected) priorFocus.focus({ preventScroll: true });
    priorFocus = null;
  }
  function openExtraId() {
    for (const id of ['rivalry-overlay', 'settings-overlay']) {
      if (!$(id).classList.contains('hidden')) return id;
    }
    return null;
  }
  settingsButton.addEventListener('click', () => openExtra(settings, 'setting-flags'));
  for (const panel of [settings, rivalry]) {
    panel.addEventListener('click', e => {
      const close = e.target.closest('[data-extra-close]');
      if (close) closeExtra(close.dataset.extraClose);
      else if (e.target === panel) closeExtra(panel.id);
    });
  }
  document.addEventListener('keydown', e => {
    const opened = openExtraId();
    if (!opened) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeExtra(opened);
    } else if (e.key === 'Tab') {
      const buttons = [...$(opened).querySelectorAll('button,input,select')].filter(x => !x.disabled && x.getClientRects().length);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }, true);
  const nativeBack = window.GeoPrzygodaApp.onBack.bind(window.GeoPrzygodaApp);
  window.GeoPrzygodaApp.onBack = function () {
    const opened = openExtraId();
    if (opened) { closeExtra(opened); return true; }
    return nativeBack();
  };

  // Each flag is a bundled SVG, stretched across the country's bounding box and
  // clipped by the original Natural Earth polygon (not an emoji label).
  const flagDefs = document.createElementNS(ns, 'defs');
  flagDefs.id = 'country-flag-patterns';
  map.insertBefore(flagDefs, map.firstChild);
  const flagPaths = [];
  for (const c of COUNTRY_DATA) {
    const path = $('land-' + c.id);
    if (!c.mapped || !path || !/^[A-Z]{2}$/.test(c.code)) continue;
    const pattern = document.createElementNS(ns, 'pattern');
    pattern.id = 'flag-pattern-' + c.id;
    pattern.setAttribute('patternUnits', 'objectBoundingBox');
    pattern.setAttribute('patternContentUnits', 'objectBoundingBox');
    pattern.setAttribute('width', '1');
    pattern.setAttribute('height', '1');
    const image = document.createElementNS(ns, 'image');
    const url = 'flags/' + c.code.toLowerCase() + '.svg';
    image.setAttribute('href', url);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('width', '1');
    image.setAttribute('height', '1');
    image.setAttribute('preserveAspectRatio', 'none');
    pattern.append(image);
    flagDefs.append(pattern);
    // Each disconnected island gets its own flag, scaled to that polygon.
    for (const piece of path.parentElement.querySelectorAll('path.land')) {
      flagPaths.push([piece, 'url(#' + pattern.id + ')']);
    }
  }
  let flagsApplied = null;
  function renderFlags() {
    const enabled = flagsEnabled && mode !== 'quiz';
    if (enabled === flagsApplied) return;
    flagsApplied = enabled;
    map.classList.toggle('flag-fill', enabled);
    for (const [path, fill] of flagPaths) {
      // An inline fill keeps the selected country showing its flag; stroke
      // highlights the selection. In quiz, restore the original palette.
      if (enabled) path.style.fill = fill;
      else path.style.removeProperty('fill');
    }
    if (window.GeoPrzygodaBattle && window.GeoPrzygodaBattle.active) window.GeoPrzygodaBattle.refresh();
  }
  // The bundled 10m outlines improve Dutch coastlines and Wadden/Zeeland
  // islands while keeping Belgium and Germany aligned at the shared borders.
  // Only replace SVG geometry: colors, flag patterns, labels, click targets,
  // quiz and offline rivalry continue to use the original country elements.
  function loadDetailedNorthSeaBorders() {
    fetch('benelux-10m.json')
      .then(response => {
        if (!response.ok) throw new Error('Detailed map unavailable');
        return response.json();
      })
      .then(data => {
        if (!data || !data.countries || data.projection !== 'Mercator 1080x1080, 3 decimal SVG precision') return;
        for (const country of ['NLD', 'BEL', 'DEU']) {
          const shape = $('land-' + country);
          const detail = data.countries[country];
          if (!shape || !detail || typeof detail.d !== 'string' ||
              detail.vertices < 500 || !detail.d.startsWith('M')) continue;
          shape.setAttribute('d', detail.d);
        }
        if (window.GeoPrzygodaBattle && window.GeoPrzygodaBattle.active)
          window.GeoPrzygodaBattle.refresh();
      })
      .catch(() => { /* Keep the bundled 50m boundaries if the detail asset is unavailable. */ });
  }
  loadDetailedNorthSeaBorders();

  // Keep the fast 1:50m overview. The Android build bundles 1:10m outlines
  // for all available mapped countries. Use them only on closer zoom, where
  // coastlines, islands and complicated borders can actually be seen.
  const enhancedCountries = new Set();
  let detailedWorld = null, worldLoading = false, worldFailed = false;
  let detailFrame = null;
  function boxIntersects(b, v) {
    return b[2] >= v.x && b[0] <= v.x + v.width &&
           b[3] >= v.y && b[1] <= v.y + v.height;
  }
  function matchDetailedFragment(nodes, parts) {
    // The 50m atlas has individually fitted flags for France, USA, Australia.
    // Match each old path to a corresponding 10m polygon before creating any
    // additional islands. No country link, label or flag is replaced.
    const assignments = [];
    const unused = new Set(parts.map((_, i) => i));
    for (const node of nodes) {
      let b;
      try { b = node.getBBox(); } catch { b = null; }
      let best = null, distance = Infinity;
      for (const i of unused) {
        const x = parts[i].b;
        const dx = (x[0] + x[2] - (b ? b.x * 2 + b.width : x[0] + x[2])) / 2;
        const dy = (x[1] + x[3] - (b ? b.y * 2 + b.height : x[1] + x[3])) / 2;
        const oldSize = b ? Math.max(0.00001, b.width * b.height) : 1;
        const newSize = Math.max(0.00001, (x[2]-x[0]) * (x[3]-x[1]));
        const score = Math.hypot(dx, dy) +
          Math.abs(Math.log(newSize / oldSize)) * 0.8;
        if (score < distance) { distance = score; best = i; }
      }
      if (best !== null) {
        assignments.push([node, best]);
        unused.delete(best);
      }
    }
    return { assignments, unused };
  }
  function applyDetail(id, detail) {
    const primary = $('land-' + id);
    if (!primary) return false;
    const anchor = primary.parentElement;
    const previous = [...anchor.querySelectorAll('path.land')];
    if (Array.isArray(detail.parts) && detail.parts.length && previous.length) {
      const { assignments, unused } = matchDetailedFragment(previous, detail.parts);
      for (const [old, index] of assignments) {
        old.setAttribute('d', detail.parts[index].d);
      }
      for (const index of unused) {
        const extra = document.createElementNS(ns, 'path');
        extra.setAttribute('d', detail.parts[index].d);
        extra.classList.add('land', 'flag-fragment');
        extra.setAttribute('fill', primary.getAttribute('fill') || '#a8d77e');
        extra.setAttribute('fill-rule', 'evenodd');
        if (map.classList.contains('flag-fill')) {
          extra.style.fill = 'url(#flag-pattern-' + id + ')';
        }
        flagPaths.push([extra, 'url(#flag-pattern-' + id + ')']);
        anchor.append(extra);
      }
    } else if (typeof detail.d === 'string' && detail.d[0] === 'M') {
      primary.setAttribute('d', detail.d);
    } else {
      return false;
    }
    enhancedCountries.add(id);
    return true;
  }
  function updateVisibleDetailedCountries() {
    if (worldFailed || !map.viewBox || !map.viewBox.baseVal) return;
    const vb = map.viewBox.baseVal;
    // Full-world view should remain lightweight and responsive on phones.
    if (!vb.width || vb.width > 400) return;
    if (!detailedWorld) {
      if (worldLoading) return;
      worldLoading = true;
      fetch('world-detail-10m.json')
        .then(response => {
          if (!response.ok) throw new Error('No detailed geometry');
          return response.json();
        })
        .then(data => {
          if (!data || !data.countries ||
              data.projection !== 'Mercator 1080x1080, 3 decimal SVG precision')
            throw new Error('Wrong detail format');
          detailedWorld = data.countries;
          queueVisibleDetails();
        })
        .catch(() => { worldFailed = true; /* The 50m map stays playable. */ })
        .finally(() => { worldLoading = false; });
      return;
    }
    if (document.querySelector('.territory-game.battle-animating')) return;
    const padX = vb.width * .12, padY = vb.height * .12;
    const visible = {
      x: vb.x - padX, y: vb.y - padY,
      width: vb.width + padX * 2, height: vb.height + padY * 2
    };
    let changed = false;
    for (const [id, detail] of Object.entries(detailedWorld)) {
      if (enhancedCountries.has(id) || !detail || !detail.b ||
          !boxIntersects(detail.b, visible)) continue;
      changed = applyDetail(id, detail) || changed;
    }
    if (changed && window.GeoPrzygodaBattle && window.GeoPrzygodaBattle.active)
      window.GeoPrzygodaBattle.refresh();
  }
  function queueVisibleDetails() {
    if (detailFrame !== null) return;
    detailFrame = requestAnimationFrame(() => {
      detailFrame = null;
      updateVisibleDetailedCountries();
    });
  }
  // In addition to redraws, listen for programmatic map focus and gestures.
  const detailObserver = new MutationObserver(queueVisibleDetails);
  detailObserver.observe(map, { attributes:true, attributeFilter:['viewBox'] });
  for (const event of ['pointerup', 'touchend', 'wheel']) {
    map.addEventListener(event, queueVisibleDetails, { passive: true });
  }

  const originalLabelMap = labelMap;
  labelMap = function () {
    originalLabelMap();
    renderFlags();
    queueVisibleDetails();
  };
  queueVisibleDetails();
  $('setting-flags').checked = flagsEnabled;
  $('setting-flags').addEventListener('change', e => {
    flagsEnabled = e.target.checked;
    writeStore(flagsKey, flagsEnabled ? 'on' : 'off');
    renderFlags();
  });

  // A gentle original repeating melody, audible on a phone speaker.
  // Audio starts only after tapping music or the welcome-screen button.
  const musicToggle = $('setting-music');
  const volume = $('setting-volume');
  musicToggle.checked = readStore(musicKey) === 'on';
  volume.value = readStore(volumeKey) || '35';
  const musicButton = document.createElement('button');
  musicButton.type = 'button';
  musicButton.id = 'quick-music';
  musicButton.className = 'dock-info music-quick-toggle';
  settingsButton.before(musicButton);
  const melody = [392, 440, 523.25, 0, 493.88, 440, 392, 329.63,
                  349.23, 392, 440, 0, 392, 329.63, 293.66, 0];
  let sequencer = null, noteIndex = 0, nextNoteTime = 0;
  function updateMusicButton() {
    const on = musicToggle.checked;
    musicButton.textContent = on ? '🎶' : '🎵';
    musicButton.classList.toggle('music-active', on);
    musicButton.setAttribute('aria-pressed', String(on));
    musicButton.setAttribute('aria-label', on ? 'Wyłącz muzykę' : 'Włącz muzykę');
    musicButton.title = on ? 'Muzyka włączona — dotknij, aby wyłączyć' : 'Włącz spokojną muzykę';
  }
  function tone(frequency, when, duration = 0.50, strength = 0.12) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(strength, when + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.05);
  }
  function scheduleMelody() {
    if (!audio || !musicToggle.checked || document.hidden) return;
    while (nextNoteTime < audio.currentTime + 0.7) {
      const frequency = melody[noteIndex % melody.length];
      if (frequency) tone(frequency, nextNoteTime, 0.48, 0.16);
      if (noteIndex % 4 === 0) tone(noteIndex % 8 ? 174.61 : 196, nextNoteTime, 1.8, 0.055);
      noteIndex++;
      nextNoteTime += 0.53;
    }
  }
  function stopMusic() {
    if (sequencer !== null) {
      clearInterval(sequencer);
      sequencer = null;
    }
    if (audio) {
      const result = audio.suspend();
      if (result && result.catch) result.catch(() => {});
    }
  }
  function playMusic() {
    if (!musicToggle.checked || document.hidden) return;
    try {
      if (!audio) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) throw new Error('AudioContext unavailable');
        audio = new Context();
        master = audio.createGain();
        master.connect(audio.destination);
      }
      master.gain.setTargetAtTime(Number(volume.value) / 100 * 0.45, audio.currentTime, 0.12);
      const resumed = audio.resume();
      if (resumed && resumed.catch) {
        resumed.catch(() => announce('Dotknij 🎵, aby uruchomić muzykę.'));
      }
      if (sequencer === null) {
        nextNoteTime = audio.currentTime + 0.07;
        scheduleMelody();
        sequencer = setInterval(scheduleMelody, 180);
      }
    } catch (error) {
      musicToggle.checked = false;
      writeStore(musicKey, 'off');
      updateMusicButton();
      stopMusic();
      announce('Na tym telefonie nie udało się uruchomić dźwięku.');
    }
  }
  function setMusic(on) {
    musicToggle.checked = on;
    writeStore(musicKey, on ? 'on' : 'off');
    updateMusicButton();
    if (on) playMusic();
    else stopMusic();
  }
  musicButton.addEventListener('click', () => setMusic(!musicToggle.checked));
  musicToggle.addEventListener('change', () => setMusic(musicToggle.checked));
  volume.addEventListener('input', () => {
    writeStore(volumeKey, volume.value);
    if (audio && master) {
      master.gain.setTargetAtTime(Number(volume.value) / 100 * 0.45, audio.currentTime, 0.1);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopMusic();
    else if (musicToggle.checked) playMusic();
  });
  for (const id of ['submit-name', 'skip-name']) {
    $(id).addEventListener('click', () => { if (musicToggle.checked) playMusic(); });
  }
  updateMusicButton();

  // The atlas already includes borders, area, independence and region; show them.
  const independentByArea = COUNTRY_DATA.filter(c => c.independent && c.area > 0)
    .sort((a, b) => b.area - a.area);
  const poland = byId.get('POL');
  function addFact(root, title, value) {
    const el = document.createElement('div');
    el.className = 'fact';
    const label = document.createElement('span');
    label.textContent = title;
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    el.append(label, strong);
    root.append(el);
  }
  function enhanceSheet(id) {
    const c = byId.get(id), sheet = $('info-' + id);
    if (!c || !sheet || sheet.dataset.extraReady) return;
    sheet.dataset.extraReady = 'yes';
    const facts = sheet.querySelector('.facts');
    addFact(facts, 'Region świata', regions[c.r] || 'Inny region');
    addFact(facts, 'Kategoria w atlasie', c.independent ? 'Państwo' : 'Terytorium lub obszar');
    if (c.code) addFact(facts, 'Kod kraju (ISO)', c.code);
    addFact(facts, 'Sąsiedzi lądowi w bazie', c.borders.length);
    const more = document.createElement('details');
    more.className = 'country-more';
    const summary = document.createElement('summary');
    summary.textContent = '📚 Więcej ciekawostek';
    const p = document.createElement('p');
    const factsText = [];
    if (c.area > 0 && poland && poland.area > 0) {
      const ratio = c.area / poland.area;
      if (ratio >= 1.2) factsText.push('Powierzchnia jest około ' + ratio.toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + ' razy większa niż powierzchnia Polski.');
      else if (ratio <= 0.8) factsText.push('Polska ma około ' + (1 / ratio).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + ' razy większą powierzchnię.');
      else factsText.push('Powierzchnia jest zbliżona do powierzchni Polski.');
    }
    const rank = independentByArea.findIndex(country => country.id === id);
    if (rank >= 0) factsText.push('Miejsce ' + (rank + 1) + '. według powierzchni wśród państw dostępnych w tej bazie.');
    if (c.borders.length === 0) factsText.push('W atlasie nie podano lądowych sąsiadów tego miejsca.');
    else factsText.push('Na mapie wskazano ' + c.borders.length + ' lądowych sąsiadów.');
    p.textContent = factsText.join(' ');
    more.append(summary, p);
    const focus = sheet.querySelector('.focus-country');
    if (focus) focus.before(more);
    else sheet.append(more);
    const rivalButton = document.createElement('button');
    rivalButton.type = 'button';
    rivalButton.className = 'rival-start';
    rivalButton.textContent = '🏁 Rywalizacja — porównaj z innym krajem';
    rivalButton.addEventListener('click', () => openRivalry(id));
    more.after(rivalButton);
  }
  const originalOpenCountry = openCountry;
  openCountry = function (id, focus = true) {
    originalOpenCountry(id, focus);
    if (mode !== 'quiz') enhanceSheet(id);
  };

  const opponentList = $('rival-opponent');
  for (const c of COUNTRY_DATA.filter(c => c.independent && c.area > 0).sort((a, b) => a.n.localeCompare(b.n, 'pl'))) {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.flag + ' ' + c.n;
    opponentList.append(option);
  }
  function score(c) {
    return Math.round(Math.log10(Math.max(0, c.area) + 10) * 12 +
      c.borders.length * 1.7);
  }
  function compare() {
    const first = byId.get(activeOrigin);
    const other = byId.get(opponentList.value);
    if (!first || !other || first.id === other.id) {
      $('rival-result').textContent = 'Wybierz dwa różne państwa.';
      return;
    }
    const penalty = Number($('rival-disadvantage').value);
    const a = Math.max(1, Math.round(score(first) * (1 - penalty)));
    const b = Math.max(1, score(other));
    const total = a + b;
    const result = $('rival-result');
    result.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = a === b ? '🤝 Remis!' : '🏆 Wygrywa ' + (a > b ? first.n : other.n) + '!';
    const row = document.createElement('div');
    row.className = 'rival-score-row';
    row.textContent = first.flag + ' ' + first.n + ': ' + a + ' pkt · ' + other.flag + ' ' + other.n + ': ' + b + ' pkt';
    const track = document.createElement('div');
    track.className = 'rival-track';
    const fill = document.createElement('span');
    fill.style.width = (100 * a / total) + '%';
    track.append(fill);
    const explain = document.createElement('p');
    explain.textContent = 'Punkty w grze: powierzchnia i liczba lądowych sąsiadów. Utrudnienie dotyczy pierwszego państwa. Wynik nie odzwierciedla rzeczywistej siły państw.';
    result.append(heading, row, track, explain);
  }
  function openRivalry(id) {
    activeOrigin = id;
    const c = byId.get(id);
    $('rival-first').textContent = 'Pierwszy kraj: ' + c.flag + ' ' + c.n;
    $('rival-first').dataset.country = id;
    const firstNeighbor = c.borders.find(code => code !== id && [...opponentList.options].some(o => o.value === code));
    opponentList.value = firstNeighbor || (id !== 'POL' ? 'POL' : 'DEU');
    $('rival-disadvantage').value = '0';
    $('rival-result').replaceChildren();
    openExtra(rivalry, 'rival-country-search');
    compare();
  }
  $('rival-compare').addEventListener('click', compare);
  opponentList.addEventListener('change', compare);
  $('rival-disadvantage').addEventListener('change', compare);
  renderFlags();
})();