/* Offline search and colorful, rectangular flag cards in GeoPrzygoda. */
(function () {
  'use strict';
  const rival = document.getElementById('rivalry-overlay');
  const rivalSelect = document.getElementById('rival-opponent');
  const battleSelect = document.getElementById('battle-target');
  if (!rival || !rivalSelect || !battleSelect) return;
  const countries = COUNTRY_DATA.filter(c => c.independent && c.area > 0)
    .sort((a, b) => a.n.localeCompare(b.n, 'pl'));
  const byCountry = new Map(COUNTRY_DATA.map(c => [c.id, c]));

  function flag(c) {
    if (!c || !/^[A-Z]{2}$/.test(c.code)) {
      const fallback = document.createElement('span');
      fallback.className = 'picker-flag-fallback';
      fallback.textContent = c ? c.flag : '🌍';
      return fallback;
    }
    const img = document.createElement('img');
    img.className = 'picker-flat-flag';
    img.src = 'flags/' + c.code.toLowerCase() + '.svg';
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'picker-flag-fallback';
      fallback.textContent = c.flag || '🌍';
      img.replaceWith(fallback);
    }, { once: true });
    return img;
  }
  function name(c, subtitle) {
    const container = document.createElement('span');
    container.className = 'picker-name';
    const strong = document.createElement('strong');
    strong.textContent = c ? c.n : 'Brak dostępnych krajów';
    container.append(strong);
    if (subtitle) {
      const small = document.createElement('small');
      small.textContent = subtitle;
      container.append(small);
    }
    return container;
  }
  function preview(button, country, hint) {
    button.replaceChildren();
    if (country) button.append(flag(country));
    button.append(name(country, hint));
    const caret = document.createElement('span');
    caret.className = 'picker-caret';
    caret.textContent = '⌄';
    caret.setAttribute('aria-hidden', 'true');
    button.append(caret);
  }
  function showChoices(container, candidates, selected, choose, emptyText) {
    container.replaceChildren();
    for (const c of candidates.slice(0, 12)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'picker-country-option' + (c.id === selected ? ' picked' : '');
      button.setAttribute('aria-label', 'Wybierz kraj ' + c.n);
      button.append(flag(c), name(c, c.id === selected ? 'Wybrany' : ''));
      button.onclick = () => choose(c.id);
      container.append(button);
    }
    if (!candidates.length) {
      const p = document.createElement('p');
      p.textContent = emptyText;
      p.className = 'picker-empty';
      container.append(p);
    }
    container.classList.remove('hidden');
  }
  function makePicker(select, prefix, labelText) {
    select.classList.add('hidden');
    select.tabIndex = -1;
    const label = document.querySelector('label[for="' + select.id + '"]');
    if (label) {
      label.htmlFor = prefix + '-search';
      label.textContent = labelText;
    }
    const root = document.createElement('div');
    root.className = 'country-picker';
    const picked = document.createElement('button');
    picked.type = 'button';
    picked.id = prefix + '-picked';
    picked.className = 'picker-selected';
    picked.setAttribute('aria-label', 'Zmień wybrany kraj');
    const search = document.createElement('input');
    search.id = prefix + '-search';
    search.className = 'picker-search';
    search.type = 'search';
    search.autocomplete = 'off';
    search.placeholder = '🔎 Szukaj państwa lub stolicy…';
    const results = document.createElement('div');
    results.id = prefix + '-results';
    results.className = 'picker-results hidden';
    results.setAttribute('aria-label', 'Znalezione państwa');
    root.append(picked, search, results);
    select.after(root);
    return { picked, search, results };
  }

  const opponent = makePicker(rivalSelect, 'rival-country', 'Z jakim państwem chcesz rywalizować?');
  function drawOpponent() {
    preview(opponent.picked, byCountry.get(rivalSelect.value), 'Kliknij, aby zmienić przeciwnika');
  }
  function renderOpponentList() {
    const query = norm(opponent.search.value.trim());
    const origin = byCountry.get(document.getElementById('rival-first').dataset.country);
    let options;
    if (query) {
      options = countries.filter(c => c.id !== origin?.id &&
        (norm(c.n).includes(query) || norm(c.cap || '').includes(query) ||
         (c.code || '').toLowerCase() === query));
    } else {
      const neighbors = (origin?.borders || []).map(id => byCountry.get(id))
        .filter(c => c && c.independent && c.area > 0 && c.id !== origin.id);
      options = [...new Map([...neighbors, ...countries.filter(c => c.id !== origin?.id)]
        .map(c => [c.id, c])).values()];
    }
    showChoices(opponent.results, options, rivalSelect.value, id => {
      rivalSelect.value = id;
      rivalSelect.dispatchEvent(new Event('change', { bubbles: true }));
      drawOpponent();
      opponent.search.value = '';
      opponent.results.classList.add('hidden');
      opponent.picked.focus({ preventScroll: true });
    }, 'Nie znalazłem kraju. Wpisz krótszą nazwę.');
  }
  opponent.search.oninput = renderOpponentList;
  opponent.search.onfocus = renderOpponentList;
  opponent.picked.onclick = () => { opponent.search.focus(); renderOpponentList(); };
  rivalSelect.addEventListener('change', drawOpponent);

  function drawFirstCountry() {
    const first = document.getElementById('rival-first');
    const c = byCountry.get(first.dataset.country);
    if (!c) return;
    first.replaceChildren();
    const caption = document.createElement('span');
    caption.className = 'rival-first-caption';
    caption.textContent = 'TWOJE PAŃSTWO';
    first.append(caption, flag(c), name(c, 'Gotowy do rywalizacji'));
  }
  new MutationObserver(() => {
    if (rival.classList.contains('hidden')) return;
    drawFirstCountry();
    drawOpponent();
    opponent.search.value = '';
    opponent.results.classList.add('hidden');
  }).observe(rival, { attributes: true, attributeFilter: ['class'] });
  drawOpponent();

  // Battle list contains only neighbors that are currently available to attack.
  const target = makePicker(battleSelect, 'battle-country', 'Wybierz sąsiedni kraj');
  target.search.placeholder = '🔎 Szukaj dostępnego sąsiada…';
  function availableTargets() {
    return [...battleSelect.options]
      .map(option => byCountry.get(option.value)).filter(Boolean);
  }
  function refreshBattle() {
    preview(target.picked, byCountry.get(battleSelect.value),
      battleSelect.options.length ? 'Dotknij, aby zmienić cel' : 'Brak terenów');
    target.picked.disabled = !battleSelect.options.length;
    target.search.disabled = !battleSelect.options.length;
    target.search.value = '';
    target.results.classList.add('hidden');
  }
  function renderTargetList() {
    const query = norm(target.search.value.trim());
    const options = availableTargets().filter(c =>
      norm(c.n).includes(query) || norm(c.cap || '').includes(query) ||
      (c.code || '').toLowerCase() === query);
    showChoices(target.results, options, battleSelect.value, id => {
      battleSelect.value = id;
      battleSelect.dispatchEvent(new Event('change', { bubbles: true }));
      refreshBattle();
      target.picked.focus({ preventScroll: true });
    }, 'Ten kraj nie sąsiaduje z Twoimi terenami.');
  }
  target.search.oninput = renderTargetList;
  target.search.onfocus = renderTargetList;
  target.picked.onclick = () => { target.search.focus(); renderTargetList(); };
  battleSelect.addEventListener('change', refreshBattle);
  window.GeoPrzygodaPicker = { refreshBattle };
  refreshBattle();
})();
