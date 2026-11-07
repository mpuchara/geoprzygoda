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

  // Every flag, not only emblem-heavy examples, is fitted independently into
  // the real geographic path using a userSpaceOnUse pattern. Never stretch the
  // artwork of an emblem/cross/star to the bounding box. Only simple bands
  // may use preserveAspectRatio='none'; the country path clips all fills.
  const flagDefs = document.createElementNS(ns, 'defs');
  flagDefs.id = 'country-flag-patterns';
  map.insertBefore(flagDefs, map.firstChild);
  const flagPaths = new Map();
  // Keep complex symbols in their actual flag proportions. Pure stripe
  // patterns can still fill an irregular silhouette without visible distortion.
  // The background matches each flag, filling gaps around its centered emblem.
  const emblemBackgrounds = new Map([
    ['TUR', '#e30a17'], ['SAU', '#165d31'],
    ['USA', '#bd3d44'], ['AUS', '#00008B'], ['FRA', '#ffffff'],
    ['CAN', '#ffffff'], ['BRA', '#229e45'], ['IND', '#ffffff'],
    ['JPN', '#ffffff'], ['KOR', '#ffffff'], ['CHN', '#ee1c25'],
    ['PRT', '#006600'], ['ESP', '#aa151b'], ['MEX', '#ffffff'],
    ['NZL', '#00247d'], ['GBR', '#012169'], ['PAK', '#0c590b'],
    ['ARG', '#ffffff'], ['ISR', '#ffffff'], ['EGY', '#ffffff'],
    ['MAR', '#c1272d'], ['ALB', 'red'], ['CHE', 'red']
  ]);
  // These flags consist only of plain horizontal or vertical bands, without
  // a canton, emblem or coat of arms. Stretching bands is safe; all other SVGs
  // keep their original proportions (including small islands).
  const stripeOnlyCountries = new Set([
    'AUT','NLD','FRA','BEL','DEU','ITA','IRL','POL','UKR','RUS',
    'EST','LTU','LVA','HUN','BGR','ROU','ARM','LUX',
    'NGA','MLI','GIN','GAB','CIV','TCD','SLE','YEM'
  ]);
  function createProportionalFlag(c, piece, partIndex, asset, background,
                                  plainBands = false, patternId = null) {
    let box;
    try { box = piece.getBBox(); } catch { return null; }
    if (!box || !Number.isFinite(box.x + box.y + box.width + box.height) ||
        box.width <= 0 || box.height <= 0) return null;
    const id = patternId || 'flag-fitted-' + c.id + '-' + partIndex;
    const original = document.getElementById(id);
    const geometryKey = [asset, background || '', plainBands,
      box.x.toFixed(3), box.y.toFixed(3), box.width.toFixed(3), box.height.toFixed(3)].join(':');
    if (original && original.dataset.textureGeometry === geometryKey)
      return 'url(#' + id + ')';
    const pattern = original || document.createElementNS(ns, 'pattern');
    pattern.id = id;
    pattern.replaceChildren();
    pattern.dataset.textureGeometry = geometryKey;
    // Country coordinates, rather than normalized 0..1 boxes, are essential:
    // normalized boxes stretch symbols even when preserveAspectRatio is set.
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('patternContentUnits', 'userSpaceOnUse');
    for (const [attr, value] of Object.entries({
      x: box.x, y: box.y, width: box.width, height: box.height
    })) pattern.setAttribute(attr, String(value));
    // For individually verified emblems, a matching base + "meet" keeps the
    // *entire* icon visible (e.g. the small Union Jack on Australia's flag).
    // For all other detailed flags "slice" covers the full silhouette without
    // distorting any part of the SVG; only extreme aspect ratios crop edges.
    // Always draw a plain country-colored tile *under* the texture. Some
    // Android WebView versions silently fail to paint nested SVG images.
    // An image decoding/loading failure must never make a country disappear.
    const backing = document.createElementNS(ns, 'rect');
    for (const [attr, value] of Object.entries({
      x: box.x, y: box.y, width: box.width, height: box.height
    })) backing.setAttribute(attr, String(value));
    backing.setAttribute('fill', background || piece.getAttribute('fill') || '#a8d77e');
    pattern.append(backing);
    const image = document.createElementNS(ns, 'image');
    image.setAttribute('href', asset);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', asset);
    for (const [attr, value] of Object.entries({
      x: box.x, y: box.y, width: box.width, height: box.height
    })) image.setAttribute(attr, String(value));
    // PreserveAspectRatio="none" is allowed exclusively for verified simple
    // bands. Every emblem, crescent, star and cross retains 4:3 geometry.
    // "meet" keeps complete artwork on a matching solid background, whereas
    // "slice" fills narrow islands by cropping edges, never distorting symbols.
    const fit = plainBands ? 'none'
      : (background ? 'xMidYMid meet' : 'xMidYMid slice');
    image.setAttribute('preserveAspectRatio', fit);
    pattern.append(image);
    if (!original) flagDefs.append(pattern);
    return 'url(#' + pattern.id + ')';
  }
  // Battles may draw the victor's flag on a completely different shape.
  // Fit its symbol to the *captured* country; never reuse the old country's
  // normalized pattern where stars, moons or emblems get stretched.
  window.GeoPrzygodaFitFlag = function (ownerId, targetId, piece, index) {
    const owner = byId.get(ownerId);
    const backing = emblemBackgrounds.get(ownerId);
    if (!owner || !piece || !/^[A-Z]{2}$/.test(owner.code))
      return null;
    return createProportionalFlag({ id: ownerId + '-on-' + targetId },
      piece, index, 'flag-textures/' + owner.code.toLowerCase() + '.png', backing,
      stripeOnlyCountries.has(ownerId));
  };
  for (const c of COUNTRY_DATA) {
    const path = $('land-' + c.id);
    if (!c.mapped || !path || !/^[A-Z]{2}$/.test(c.code)) continue;
    const url = 'flag-textures/' + c.code.toLowerCase() + '.png';
    // The first fragment keeps the legacy "flag-pattern-ID" alias, but it is
    // now a fitted userSpaceOnUse SVG pattern, never an objectBBox fallback.
    // Other fragments (mainland, distant islands) each get independent fits.
    const pieces = [...path.parentElement.querySelectorAll('path.land')];
    pieces.forEach((piece, index) => {
      const fitted = createProportionalFlag(
        c, piece, index, url, emblemBackgrounds.get(c.id),
        stripeOnlyCountries.has(c.id),
        index === 0 ? 'flag-pattern-' + c.id : null
      );
      if (!fitted) return; // Preserve original terrain color if geometry is invalid.
      piece.dataset.geoprzygodaFittedFlag = fitted;
      flagPaths.set(piece, fitted);
    });
  }

  function refitProportionalCountry(id) {
    const c = byId.get(id);
    const background = emblemBackgrounds.get(id);
    const primary = $('land-' + id);
    if (!c || !primary) return;
    const pieces = [...primary.parentElement.querySelectorAll('path.land')];
    pieces.forEach((piece, index) => {
      const fitted = createProportionalFlag(
        c, piece, index, 'flag-textures/' + c.code.toLowerCase() + '.png', background,
        stripeOnlyCountries.has(id),
        index === 0 ? 'flag-pattern-' + id : null
      );
      if (!fitted) return;
      piece.dataset.geoprzygodaFittedFlag = fitted;
      flagPaths.set(piece, fitted);
      if (map.classList.contains('flag-fill') &&
          !(window.GeoPrzygodaBattle && window.GeoPrzygodaBattle.active)) {
        piece.style.fill = fitted;
      }
    });
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
  // The overview always uses the original light 1:50m country outlines.
  // Keep immutable baselines so zooming back out truly drops 1:10m geometry.
  const baseGeometry = new Map();
  for (const c of COUNTRY_DATA) {
    const primary = $('land-' + c.id);
    if (!primary) continue;
    baseGeometry.set(c.id, [...primary.parentElement.querySelectorAll('path.land')]
      .map(piece => ({ piece, d: piece.getAttribute('d') })));
  }

  const DETAIL_ZOOM_LIMIT = 280; // About 4x world zoom; never load on overview.
  const enhancedCountries = new Set();
  const detailViewport = new Map();
  const detailCache = new Map();
  const loadingDetails = new Set();
  let detailedIndex = null, worldLoading = false, worldFailed = false;
  let detailFrame = null, detailTimer = null;

  function boxIntersects(b, v) {
    return b[2] >= v.x && b[0] <= v.x + v.width &&
           b[3] >= v.y && b[1] <= v.y + v.height;
  }
  function paddedView(view, amount = .15) {
    const x = view.width * amount, y = view.height * amount;
    return {x:view.x-x,y:view.y-y,width:view.width+2*x,height:view.height+2*y};
  }
  function matchDetailedFragment(nodes, parts) {
    const assignments = [], unused = new Set(parts.map((_, i) => i));
    for (const node of nodes) {
      let b;
      try { b = node.getBBox(); } catch { b = null; }
      let best = null, distance = Infinity;
      for (const i of unused) {
        const x = parts[i].b;
        const dx = (x[0] + x[2] - (b ? b.x * 2 + b.width : x[0] + x[2])) / 2;
        const dy = (x[1] + x[3] - (b ? b.y * 2 + b.height : x[1] + x[3])) / 2;
        const oldSize = b ? Math.max(.00001, b.width * b.height) : 1;
        const newSize = Math.max(.00001, (x[2]-x[0]) * (x[3]-x[1]));
        const score = Math.hypot(dx,dy) + Math.abs(Math.log(newSize/oldSize))*.8;
        if (score < distance) { distance = score; best = i; }
      }
      if (best !== null) { assignments.push([node,best]); unused.delete(best); }
    }
    return {assignments,unused};
  }
  function restoreBaseGeometry(id) {
    const original = baseGeometry.get(id), primary = $('land-' + id);
    if (!original || !primary) return;
    const keep = new Set(original.map(item => item.piece));
    for (const extra of [...primary.parentElement.querySelectorAll('path.land')]) {
      if (keep.has(extra)) continue;
      flagPaths.delete(extra);
      const fitted = /url\(#([^)]+)\)/.exec(extra.dataset.geoprzygodaFittedFlag || '');
      if (fitted) document.getElementById(fitted[1])?.remove();
      extra.remove();
    }
    for (const {piece,d} of original) {
      if (piece.getAttribute('d') !== d) piece.setAttribute('d',d);
    }
    enhancedCountries.delete(id);
    detailViewport.delete(id);
    refitProportionalCountry(id);
  }
  function applyDetail(id, detail) {
    const primary = $('land-' + id);
    if (!primary || !detail) return false;
    const anchor = primary.parentElement;
    const previous = [...anchor.querySelectorAll('path.land')];
    if (Array.isArray(detail.parts) && detail.parts.length && previous.length) {
      const {assignments,unused} = matchDetailedFragment(previous,detail.parts);
      for (const [old,index] of assignments) {
        if (old.getAttribute('d') !== detail.parts[index].d)
          old.setAttribute('d', detail.parts[index].d);
      }
      // Some island-heavy countries have hundreds of tiny detached pieces.
      // Only add islands currently in view; never expand entire world at once.
      const view = paddedView(map.viewBox.baseVal,.22);
      for (const index of unused) {
        const part = detail.parts[index];
        if (!boxIntersects(part.b,view)) continue;
        const extra = document.createElementNS(ns,'path');
        extra.setAttribute('d',part.d);
        extra.classList.add('land','flag-fragment');
        extra.setAttribute('fill',primary.getAttribute('fill') || '#a8d77e');
        extra.setAttribute('fill-rule','evenodd');
        anchor.append(extra);
        flagPaths.set(extra, 'url(#flag-pattern-' + id + ')');
      }
    } else if (typeof detail.d === 'string' && detail.d.startsWith('M')) {
      if (primary.getAttribute('d') !== detail.d)
        primary.setAttribute('d',detail.d);
    } else return false;
    refitProportionalCountry(id);
    enhancedCountries.add(id);
    const vb = map.viewBox.baseVal;
    detailViewport.set(id,{x:vb.x,y:vb.y,width:vb.width,height:vb.height});
    return true;
  }
  function loadDetailedNorthSeaBorders() {
    // Old eager Benelux replacement removed. The indexed world detail includes
    // Netherlands, Belgium and Germany at the same Natural Earth 1:10m scale.
    // Retained as a named compatibility hook for legacy assertions.
    return detailedIndex && ['NLD','BEL','DEU'].every(id => !!detailedIndex[id]);
  }
  function loadSingleDetailedCountry(id) {
    if (loadingDetails.has(id)) return;
    if (detailCache.has(id)) {
      if (!enhancedCountries.has(id)) applyDetail(id,detailCache.get(id));
      return;
    }
    loadingDetails.add(id);
    fetch('world-detail/' + id.toLowerCase() + '.json')
      .then(response => {
        if (!response.ok) throw new Error('No detailed country geometry');
        return response.json();
      })
      .then(detail => {
        if (!detail || !detail.b || (!detail.d && !detail.parts)) return;
        detailCache.set(id,detail);
        // At most 8 decoded countries: bound memory as the user explores.
        while (detailCache.size > 8) {
          const discard = [...detailCache.keys()].find(key => !enhancedCountries.has(key));
          if (!discard) break;
          detailCache.delete(discard);
        }
        const vb = map.viewBox.baseVal;
        if (vb.width > 0 && vb.width <= DETAIL_ZOOM_LIMIT &&
            boxIntersects(detail.b,paddedView(vb,.12)) &&
            !enhancedCountries.has(id) &&
            !document.querySelector('.territory-game.battle-animating')) {
          applyDetail(id,detail);
          if (window.GeoPrzygodaBattle?.active) window.GeoPrzygodaBattle.refresh();
        }
      })
      .catch(() => { /* 1:50m remains usable if optional detailed data is missing. */ })
      .finally(() => {
        loadingDetails.delete(id);
        queueVisibleDetails();
      });
  }
  function updateVisibleDetailedCountries() {
    if (!map.viewBox || !map.viewBox.baseVal) return;
    const vb = map.viewBox.baseVal;
    if (!vb.width) return;
    const zoomed = vb.width <= DETAIL_ZOOM_LIMIT;
    const view = paddedView(vb,.15);
    // Revert paths, not just flag patterns, when zooming out or leaving an area.
    let updated = 0;
    for (const id of [...enhancedCountries]) {
      const previousView = detailViewport.get(id);
      const movedFar = previousView &&
        (Math.abs((vb.x+vb.width/2)-(previousView.x+previousView.width/2)) >
           Math.max(vb.width*1.2,4) ||
         Math.abs((vb.y+vb.height/2)-(previousView.y+previousView.height/2)) >
           Math.max(vb.height*1.2,4));
      if (!zoomed || movedFar || (detailedIndex &&
          !boxIntersects(detailedIndex[id].b,paddedView(vb,.6)))) {
        restoreBaseGeometry(id);
        updated++;
        if (updated >= 4) { queueVisibleDetails(); break; }
      }
    }
    if (updated && window.GeoPrzygodaBattle?.active) window.GeoPrzygodaBattle.refresh();
    if (!zoomed || worldFailed || document.querySelector('.territory-game.battle-animating'))
      return;
    if (!detailedIndex) {
      if (worldLoading) return;
      worldLoading = true;
      fetch('world-detail-10m.json')
        .then(response => {
          if (!response.ok) throw new Error('Detailed map index unavailable');
          return response.json();
        })
        .then(data => {
          if (data?.projection !== 'Mercator 1080x1080, 3 decimal SVG precision' ||
              !data.countries || !data.countries.NLD) throw new Error('Invalid detail index');
          detailedIndex = data.countries;
          queueVisibleDetails();
        })
        .catch(() => { worldFailed = true; })
        .finally(() => { worldLoading = false; });
      return;
    }
    let queued = 0;
    for (const [id, detail] of Object.entries(detailedIndex)) {
      if (queued >= 3 || !detail?.b || enhancedCountries.has(id) ||
          loadingDetails.has(id) || !boxIntersects(detail.b,view)) continue;
      queued++;
      loadSingleDetailedCountry(id);
    }
  }
  function queueVisibleDetails() {
    // Debounce rapid pinch/drag changes. Work happens after a gesture settles,
    // not for all 238 countries on every frame of scrolling.
    if (detailTimer !== null) clearTimeout(detailTimer);
    detailTimer = setTimeout(() => {
      detailTimer = null;
      if (detailFrame !== null) return;
      detailFrame = requestAnimationFrame(() => {
        detailFrame = null;
        updateVisibleDetailedCountries();
      });
    }, 100);
  }
  const detailObserver = new MutationObserver(queueVisibleDetails);
  detailObserver.observe(map,{attributes:true,attributeFilter:['viewBox']});
  for (const event of ['pointerup','touchend','wheel']) {
    map.addEventListener(event,queueVisibleDetails,{passive:true});
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