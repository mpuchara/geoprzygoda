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
    '<label class="extra-setting"><span><strong>🏳️ Flagi na mapie</strong><small>Pokazuj flagi na większych krajach. Przybliż mapę, żeby zobaczyć więcej.</small></span><input id="setting-flags" type="checkbox"></label>' +
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

  // Flags use SVG text at known map coordinates, without external images.
  const flagLayer = document.createElementNS(ns, 'g');
  flagLayer.id = 'flag-layer';
  flagLayer.setAttribute('aria-hidden', 'true');
  flagLayer.style.pointerEvents = 'none';
  map.append(flagLayer);
  const flagNodes = [];
  for (const c of COUNTRY_DATA) {
    if (!c.mapped || !c.flag || c.flag === '🌍') continue;
    const node = document.createElementNS(ns, 'text');
    node.textContent = c.flag;
    node.setAttribute('x', c.x);
    node.setAttribute('y', c.y);
    node.setAttribute('text-anchor', 'middle');
    node.setAttribute('dominant-baseline', 'middle');
    node.style.pointerEvents = 'none';
    flagLayer.append(node);
    flagNodes.push([c, node]);
  }
  function renderFlags() {
    const enabled = flagsEnabled && mode !== 'quiz';
    flagLayer.style.display = enabled ? '' : 'none';
    const labels = $('country-labels');
    if (labels) labels.style.display = enabled ? 'none' : '';
    if (!enabled) return;
    const rect = map.getBoundingClientRect();
    const scale = Math.min(rect.width / view.w, rect.height / view.h);
    if (!Number.isFinite(scale) || scale <= 0) return;
    const size = Math.max(1, 22 / scale);
    for (const [c, node] of flagNodes) {
      const visible = c.x >= view.x && c.x <= view.x + view.w &&
        c.y >= view.y && c.y <= view.y + view.h &&
        (((c.b[2] - c.b[0]) * scale >= 25 &&
          (c.b[3] - c.b[1]) * scale >= 18) || selected === c.id);
      node.style.display = visible ? '' : 'none';
      if (visible) node.setAttribute('font-size', size);
    }
  }
  const originalLabelMap = labelMap;
  labelMap = function () { originalLabelMap(); renderFlags(); };
  $('setting-flags').checked = flagsEnabled;
  $('setting-flags').addEventListener('change', e => {
    flagsEnabled = e.target.checked;
    writeStore(flagsKey, flagsEnabled ? 'on' : 'off');
    renderFlags();
  });

  // Soft original ambient chord: generated locally with the Web Audio API.
  const musicToggle = $('setting-music');
  const volume = $('setting-volume');
  musicToggle.checked = readStore(musicKey) === 'on';
  volume.value = readStore(volumeKey) || '35';
  function playMusic() {
    if (!musicToggle.checked || document.hidden) return;
    try {
      if (!audio) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) throw new Error('AudioContext unavailable');
        audio = new Context();
        master = audio.createGain();
        master.connect(audio.destination);
        [130.81, 164.81, 196, 261.63].forEach((hz, index) => {
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.type = index === 1 ? 'triangle' : 'sine';
          oscillator.frequency.value = hz;
          gain.gain.value = index === 0 ? 0.09 : 0.028;
          oscillator.connect(gain);
          gain.connect(master);
          oscillator.start();
        });
      }
      master.gain.setTargetAtTime(Number(volume.value) / 100 * 0.18, audio.currentTime, 0.1);
      const resumed = audio.resume();
      if (resumed && resumed.catch) resumed.catch(() => {});
    } catch (error) {
      musicToggle.checked = false;
      writeStore(musicKey, 'off');
      announce('Ten telefon nie obsługuje muzyki w grze.');
    }
  }
  musicToggle.addEventListener('change', () => {
    writeStore(musicKey, musicToggle.checked ? 'on' : 'off');
    if (musicToggle.checked) playMusic();
    else if (audio) audio.suspend();
  });
  volume.addEventListener('input', () => {
    writeStore(volumeKey, volume.value);
    if (audio && master) master.gain.setTargetAtTime(Number(volume.value) / 100 * 0.18, audio.currentTime, 0.08);
  });
  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    if (document.hidden || !musicToggle.checked) audio.suspend();
    else playMusic();
  });
  for (const id of ['submit-name', 'skip-name']) $(id).addEventListener('click', () => {
    if (musicToggle.checked) playMusic();
  });

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
    const firstNeighbor = c.borders.find(code => code !== id && [...opponentList.options].some(o => o.value === code));
    opponentList.value = firstNeighbor || (id !== 'POL' ? 'POL' : 'DEU');
    $('rival-disadvantage').value = '0';
    $('rival-result').replaceChildren();
    openExtra(rivalry, 'rival-opponent');
    compare();
  }
  $('rival-compare').addEventListener('click', compare);
  opponentList.addEventListener('change', compare);
  $('rival-disadvantage').addEventListener('change', compare);
  renderFlags();
})();