/* GeoPrzygoda Plan 7 — offline game modes, rewards and local two-player games. */
(function () {
  'use strict';
  const STORE = 'geo7-progress-v1';
  const countries = COUNTRY_DATA.filter(c => c && c.independent && c.n && c.cap && c.area > 0 && /^[A-Z]{2}$/.test(c.code || ''));
  const countryById = new Map(COUNTRY_DATA.map(c => [c.id, c]));
  const historyIds = ['POL', 'NLD', 'DEU', 'FRA', 'USA', 'AUT'];
  const palette = ['#e63946', '#ffffff', '#457b9d'];
  const catalog = [
    { id:'theme-ocean', kind:'theme', name:'🌊 Ocean', cost:40, desc:'Spokojne błękity na mapie' },
    { id:'theme-sunset', kind:'theme', name:'🌅 Zachód słońca', cost:60, desc:'Ciepłe kolory mapy' },
    { id:'theme-night', kind:'theme', name:'🌌 Noc odkrywcy', cost:80, desc:'Nocna kolorystyka mapy' },
    { id:'frame-gold', kind:'frame', name:'✨ Złota ramka', cost:35, desc:'Złota oprawa profilu' },
    { id:'frame-rainbow', kind:'frame', name:'🌈 Tęczowa ramka', cost:60, desc:'Kolorowa ramka profilu' },
    { id:'title-explorer', kind:'title', name:'🧭 Odkrywca', cost:25, desc:'Tytuł przy nazwie gracza' },
    { id:'title-cartographer', kind:'title', name:'🗺️ Kartograf', cost:65, desc:'Nowy tytuł gracza' },
    { id:'effect-sparkle', kind:'effect', name:'⭐ Iskierki', cost:50, desc:'Subtelny efekt na profilu' }
  ];
  const itemById = new Map(catalog.map(item => [item.id, item]));
  const defaultState = () => ({
    version:1, points:0, completed:{}, inventory:[], equipped:{ theme:'default', frame:'default', title:'default', effect:'default' },
    home:'POL', customFlags:{}
  });
  function readState() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(STORE)); } catch { /* storage disabled */ }
    const result = defaultState();
    if (!raw || raw.version !== 1 || typeof raw !== 'object') return result;
    result.points = Number.isSafeInteger(raw.points) ? Math.max(0, Math.min(1000000, raw.points)) : 0;
    if (raw.completed && typeof raw.completed === 'object' && !Array.isArray(raw.completed)) {
      for (const [key,value] of Object.entries(raw.completed).slice(-1500)) {
        if (/^\d{4}-\d\d-\d\d:(capital|country|flag)$/.test(key) && value === true) result.completed[key] = true;
      }
    }
    if (Array.isArray(raw.inventory)) result.inventory = [...new Set(raw.inventory.filter(id => itemById.has(id)))];
    if (raw.equipped && typeof raw.equipped === 'object') {
      for (const kind of ['theme','frame','title','effect']) {
        const id = raw.equipped[kind];
        if (id === 'default' || (result.inventory.includes(id) && itemById.get(id)?.kind === kind)) result.equipped[kind] = id;
      }
    }
    if (countryById.has(raw.home)) result.home = raw.home;
    if (raw.customFlags && typeof raw.customFlags === 'object' && !Array.isArray(raw.customFlags)) {
      for (const [id,flag] of Object.entries(raw.customFlags).slice(0, 20)) {
        if (!countryById.has(id) || !flag || !Array.isArray(flag.colors)) continue;
        if (flag.colors.length !== 3 || !flag.colors.every(x => /^#[a-fA-F0-9]{6}$/.test(x))) continue;
        if (!['h','v'].includes(flag.direction) || !['none','star','circle'].includes(flag.emblem)) continue;
        result.customFlags[id] = { colors:flag.colors, direction:flag.direction, emblem:flag.emblem };
      }
    }
    return result;
  }
  let progress = readState();
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(progress)); } catch { /* still playable as guest */ }
  }
  function el(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label !== undefined) node.textContent = label;
    return node;
  }
  function button(label, action, className) {
    const node = el('button', className || 'geo7-button', label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function title(host, heading, description) {
    host.append(el('h3','geo7-section-title',heading));
    if (description) host.append(el('p','geo7-description',description));
  }
  function optionSelect(values, selected) {
    const select = el('select','geo7-select');
    for (const [value,label] of values) {
      const option = el('option','',label);
      option.value = value;
      select.append(option);
    }
    select.value = selected;
    return select;
  }
  function labeled(host, label, input) {
    const wrapper = el('label','geo7-field');
    wrapper.append(el('span','',label),input);
    host.append(wrapper);
    return input;
  }
  function dateKey(date) {
    const d = date || new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  }
  function hash(str) {
    let h = 2166136261;
    for (let i=0;i<str.length;i++) { h ^= str.charCodeAt(i); h = Math.imul(h,16777619); }
    return h >>> 0;
  }
  function challengeSet(day) {
    const pool = countries.filter(c => c.cap && c.cap !== '-' && c.cap !== c.n);
    const seed = hash('Geo7:' + day);
    const result = [];
    for (let q=0;q<3;q++) {
      const type = ['capital','country','flag'][q];
      const target = pool[(seed + 89*q) % pool.length];
      const options = [target];
      let cursor = (seed + 53*q + 31) % pool.length;
      while (options.length < 4) {
        const next = pool[cursor];
        if (!options.some(c => c.id === next.id) &&
            (type !== 'capital' || !options.some(c => c.cap === next.cap))) options.push(next);
        cursor = (cursor + 109) % pool.length;
      }
      const offset = (seed + q) % 4;
      result.push({
        key:day + ':' + type, type, target,
        prompt:type === 'capital' ? 'Jaka jest stolica państwa ' + target.n + '?' :
          type === 'country' ? 'Do jakiego państwa należy stolica ' + target.cap + '?' :
          'Jakie państwo ma tę flagę?',
        choices:options.slice(offset).concat(options.slice(0,offset)),
        reward:[15,15,20][q]
      });
    }
    return result;
  }
  function customFlagSvg(config) {
    if (!config || !Array.isArray(config.colors) || config.colors.length !== 3) return '';
    const colors = config.colors.map((c,i) => /^#[a-fA-F0-9]{6}$/.test(c) ? c : palette[i]);
    const vertical = config.direction === 'v';
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">';
    for (let i=0;i<3;i++) svg += vertical ?
      '<rect x="' + (i*100) + '" y="0" width="100" height="200" fill="' + colors[i] + '"/>' :
      '<rect x="0" y="' + (i*200/3) + '" width="300" height="' + (200/3+0.5) + '" fill="' + colors[i] + '"/>';
    if (config.emblem === 'circle') svg += '<circle cx="150" cy="100" r="35" fill="#ffffff" stroke="#233b63" stroke-width="5"/>';
    if (config.emblem === 'star') svg += '<polygon points="150,52 163,86 200,86 170,108 181,145 150,123 119,145 130,108 100,86 137,86" fill="#fff" stroke="#223353" stroke-width="3"/>';
    return svg + '</svg>';
  }
  function flagForCountry(id) {
    const config = progress.customFlags[id];
    return config ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(customFlagSvg(config)) : '';
  }
  function countryFlag(id) {
    const c = countryById.get(id);
    const src = flagForCountry(id) || (c && /^[A-Z]{2}$/.test(c.code || '') ? 'flags/' + c.code.toLowerCase() + '.svg' : '');
    const img = el('img','geo7-flag');
    img.alt = c ? 'Flaga ' + c.n : 'Flaga';
    if (src) img.src = src;
    img.loading = 'lazy';
    return img;
  }
  function applyAppearance() {
    for (const id of ['theme-ocean','theme-sunset','theme-night']) document.body.classList.remove('geo7-' + id);
    if (progress.equipped.theme !== 'default') document.body.classList.add('geo7-' + progress.equipped.theme);
  }
  applyAppearance();

  const settings = document.getElementById('open-settings');
  if (!settings) return;
  const trigger = button('🎮', () => open('home'), 'dock-info geo7-dock');
  trigger.id = 'open-game-modes';
  trigger.setAttribute('aria-label','Tryby gry');
  trigger.title = 'Tryby gry';
  settings.after(trigger);

  const overlay = el('div','overlay extras-overlay geo7-overlay hidden');
  overlay.id = 'geo7-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-labelledby','geo7-heading');
  const panel = el('div','extras-panel geo7-panel');
  const closeBtn = button('×', close, 'close-overlay extras-close');
  closeBtn.setAttribute('aria-label','Zamknij tryby gry');
  const heading = el('h2','', '🎮 Tryby gry');
  heading.id='geo7-heading';
  const profile = el('div','geo7-profile');
  profile.id='geo7-profile';
  const bar = el('div','geo7-bar');
  const back = button('‹ Wróć', () => navigate('home'), 'geo7-back');
  back.id='geo7-back';
  const points = el('strong','geo7-points');
  points.id='geo7-points';
  bar.append(back, points);
  const content = el('div','geo7-content');
  content.id='geo7-content';
  const note = el('p','geo7-note','Bez internetu · Bez reklam · Bez prawdziwych pieniędzy');
  panel.append(closeBtn, heading, profile, bar, content, note);
  overlay.append(panel);
  document.body.append(overlay);
  let screen = 'home', focusedBefore = null, duel = null, historyRequest = 0;
  let homeCountry = countryById.has(progress.home) ? progress.home : 'POL';

  function updateHeader() {
    const name = (() => { try { return localStorage.getItem('geo-player-name')?.trim().slice(0,35) || 'Gość'; } catch { return 'Gość'; } })();
    profile.replaceChildren();
    profile.className = 'geo7-profile' +
      (progress.equipped.frame !== 'default' ? ' geo7-' + progress.equipped.frame : '') +
      (progress.equipped.effect !== 'default' ? ' geo7-' + progress.equipped.effect : '');
    profile.append(el('span','geo7-avatar','🌍'));
    const body = el('div','geo7-profile-caption');
    body.append(el('strong','',name));
    const badge = progress.equipped.title === 'title-explorer' ? '🧭 Odkrywca' :
      progress.equipped.title === 'title-cartographer' ? '🗺️ Kartograf' : 'Początkujący podróżnik';
    body.append(el('small','',badge));
    profile.append(body);
    points.textContent = '⭐ ' + progress.points + ' pkt';
  }
  function open(view) {
    if (!overlay.classList.contains('hidden')) { navigate(view); return; }
    focusedBefore = document.activeElement;
    overlay.classList.remove('hidden');
    const gameApp = document.getElementById('app');
    if (gameApp) gameApp.inert = true;
    navigate(view || 'home');
    closeBtn.focus({preventScroll:true});
  }
  function close() {
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    historyRequest++;
    const gameApp = document.getElementById('app');
    if (gameApp) gameApp.inert = false;
    if (focusedBefore && focusedBefore.isConnected && !focusedBefore.closest('.hidden')) focusedBefore.focus({preventScroll:true});
    focusedBefore = null;
  }
  function navigate(view) {
    screen = view;
    historyRequest++;
    updateHeader();
    back.hidden = view === 'home';
    content.replaceChildren();
    content.scrollTop = 0;
    if (view === 'home') renderHome();
    if (view === 'campaign') renderCampaign();
    if (view === 'flags') renderFlagEditor();
    if (view === 'time') renderTime();
    if (view === 'challenges') renderChallenges();
    if (view === 'shop') renderShop();
    if (view === 'friends') renderFriends();
  }
  function card(label, description, action) {
    const node = button('', action, 'geo7-mode');
    node.append(el('strong','',label),el('small','',description));
    return node;
  }
  function renderHome() {
    title(content,'Wybierz przygodę','Możesz grać, zwiedzać albo po prostu odpocząć przy mapie.');
    const modes = el('div','geo7-mode-grid');
    modes.append(
      card('⚔️ Wielka kampania','Podboje, prowincje, sojusze i własne flagi', () => navigate('campaign')),
      card('🏰 Podróż w czasie','Sprawdzone historie i dawne flagi', () => navigate('time')),
      card('🏆 Dobrowolne wyzwania','Trzy zagadki dziennie, bez kar za pominięcie', () => navigate('challenges')),
      card('🛒 Sklep za punkty','Motywy mapy, ramki, tytuły i efekty', () => navigate('shop')),
      card('👥 Gra ze znajomymi','Quiz na jednym telefonie, udostępnianie wyników', () => navigate('friends'))
    );
    content.append(modes);
    content.append(el('p','geo7-description','Tryb online wymaga osobnego serwera i nie jest częścią tej wersji.'));
  }
  function campaignCountries() {
    return countries.filter(c => (c.borders || []).some(id => countryById.has(id)))
      .sort((a,b) => a.n.localeCompare(b.n,'pl'));
  }
  function renderCampaign() {
    title(content,'⚔️ Wielka kampania','Zachowujemy obecne prawdziwe prowincje, płynne animacje oraz fikcyjne zasady podbojów.');
    const starters = campaignCountries();
    const select = optionSelect(starters.map(c=>[c.id,c.n]),homeCountry);
    if (!select.value) select.value = 'POL';
    const flagPreview = el('div','geo7-flag-preview');
    const allianceInput = el('input','');
    allianceInput.type='checkbox';
    const allianceSelect = optionSelect([], '');
    function refresh() {
      homeCountry = select.value;
      progress.home = homeCountry; save();
      flagPreview.replaceChildren(countryFlag(homeCountry),el('strong','',countryById.get(homeCountry).n));
      const c = countryById.get(homeCountry);
      const allies = (c.borders || []).map(id=>countryById.get(id))
        .filter(other=>other && other.id !== c.id && starters.some(s=>s.id===other.id));
      const prior = allianceSelect.value;
      allianceSelect.replaceChildren();
      for (const neighbor of allies) allianceSelect.append(new Option(neighbor.n,neighbor.id));
      if (allies.some(a=>a.id===prior)) allianceSelect.value=prior;
      allianceInput.disabled = allies.length < 2;
      if (allianceInput.disabled) allianceInput.checked = false;
      allianceSelect.disabled = !allianceInput.checked || allianceInput.disabled;
    }
    select.addEventListener('change',refresh);
    allianceInput.addEventListener('change',()=>{ allianceSelect.disabled = !allianceInput.checked; });
    labeled(content,'Wybierz swoje państwo',select);
    content.append(flagPreview);
    content.append(button('🎨 Stwórz lub zmień własną flagę',()=>navigate('flags'),'geo7-button'));
    const allyRow = el('label','geo7-tick');
    allyRow.append(allianceInput,el('span','', '🤝 Załóż sojusz z sąsiednim państwem'));
    content.append(allyRow);
    labeled(content,'Wybierz sojusznika',allianceSelect);
    content.append(el('p','geo7-description','Sojusz to istniejący tryb kampanii: wybrany sąsiad dołącza do Twoich terenów na starcie.'));
    content.append(button('⚔️ Rozpocznij kampanię',()=>{
      const c=countryById.get(select.value);
      const available = (c.borders || []).filter(id=>countryById.has(id));
      const ally = allianceInput.checked && !allianceInput.disabled ? allianceSelect.value : null;
      const opponent = available.find(id => id !== ally);
      if (!opponent || !window.GeoPrzygodaBattle?.start) {
        message(content,'Dla tego kraju nie ma wystarczających sąsiadów do rozpoczęcia kampanii.');
        return;
      }
      close();
      window.GeoPrzygodaBattle.start(c.id,opponent,0,ally ? 'alliance':'free',ally);
    },'geo7-button geo7-primary'));
    refresh();
  }
  function renderFlagEditor() {
    title(content,'🎨 Kreator flag','Wymyśl flagę dla swojej drużyny w kampanii. Oficjalne flagi atlasu pozostaną bez zmian.');
    const c = countryById.get(homeCountry);
    const saved = progress.customFlags[homeCountry] || {colors:palette,direction:'h',emblem:'none'};
    content.append(el('p','geo7-description','Wybrane państwo: ' + c.n));
    const colors=saved.colors.map((value,i)=>{
      const inp=el('input','geo7-color');
      inp.type='color';inp.value=value;
      labeled(content,'Kolor pasa '+(i+1),inp);
      return inp;
    });
    const direction=optionSelect([['h','Poziome pasy'],['v','Pionowe pasy']],saved.direction);
    labeled(content,'Ułożenie pasów',direction);
    const emblem=optionSelect([['none','Bez symbolu'],['star','Gwiazda'],['circle','Koło']],saved.emblem);
    labeled(content,'Symbol',emblem);
    const preview=el('img','geo7-flag geo7-flag-large');
    preview.alt='Podgląd własnej flagi';
    function spec(){return {colors:colors.map(i=>i.value),direction:direction.value,emblem:emblem.value};}
    function update(){preview.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(customFlagSvg(spec()));}
    for (const input of [...colors,direction,emblem]) input.addEventListener('input',update);
    content.append(preview);
    update();
    content.append(button('💾 Zapisz flagę',()=>{
      progress.customFlags[homeCountry] = spec();
      save();
      window.GeoPrzygodaBattle?.refresh?.();
      navigate('campaign');
    },'geo7-button geo7-primary'));
    if (progress.customFlags[homeCountry]) content.append(button('Przywróć oryginalną flagę',()=>{
      delete progress.customFlags[homeCountry]; save();
      window.GeoPrzygodaBattle?.refresh?.();
      navigate('campaign');
    },'geo7-button'));
  }
  function message(host, body) {
    const info=el('p','geo7-message',body);
    host.append(info);
    return info;
  }
  function renderTime() {
    title(content,'🏰 Podróż w czasie','Dane z Planu 6: tylko zweryfikowane wydarzenia. Dzisiejsza mapa się nie zmienia.');
    const picker = optionSelect(historyIds.map(id => [id,countryById.get(id).n]),
      historyIds.includes(homeCountry) ? homeCountry : 'POL');
    labeled(content,'Wybierz kraj z dostępną historią',picker);
    const target=el('section','geo7-history');
    content.append(target);
    picker.addEventListener('change',()=>loadHistory(picker.value,target));
    loadHistory(picker.value,target);
  }
  function historicFlag(entry) {
    const box=el('div','geo7-historic-flag');
    if (['h','v'].includes(entry.kind) && Array.isArray(entry.colors)) {
      box.style.flexDirection = entry.kind === 'h' ? 'column' : 'row';
      for (const color of entry.colors.slice(0,6)) {
        if (!/^#[0-9a-f]{3,8}$/i.test(color)) continue;
        const stripe=el('span','geo7-historic-stripe');
        stripe.style.backgroundColor=color;
        box.append(stripe);
      }
    } else if (entry.kind === 'usa48') {
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 300 200');
      for(let r=0;r<13;r++){
        const rect=document.createElementNS(svg.namespaceURI,'rect');
        rect.setAttribute('x','0'); rect.setAttribute('y',String(200*r/13));
        rect.setAttribute('width','300');rect.setAttribute('height',String(201/13));
        rect.setAttribute('fill',r%2?'#fff':'#b22234');svg.append(rect);
      }
      const canton=document.createElementNS(svg.namespaceURI,'rect');
      for(const [k,v] of Object.entries({x:0,y:0,width:120,height:200*7/13,fill:'#3c3b6e'}))canton.setAttribute(k,String(v));
      svg.append(canton);
      for(let r=0;r<6;r++)for(let col=0;col<8;col++){
        const star=document.createElementNS(svg.namespaceURI,'circle');
        star.setAttribute('cx',String(8+col*15));
        star.setAttribute('cy',String(8+r*15));
        star.setAttribute('r','2.5');
        star.setAttribute('fill','#fff');svg.append(star);
      }
      box.append(svg);
    }
    return box;
  }
  async function loadHistory(id,host) {
    const seq=++historyRequest;
    host.replaceChildren(el('p','geo7-description','Otwieram lokalną historię…'));
    try {
      const response=await fetch('history/'+id.toLowerCase()+'.json');
      if(!response.ok) throw new Error('Brak historii');
      const data=await response.json();
      if(seq!==historyRequest || screen!=='time' || overlay.classList.contains('hidden'))return;
      host.replaceChildren();
      const events=Array.isArray(data.events)?data.events:[];
      if(events.length){
        const wrapper=el('div','geo7-history-card');
        const index=el('input','geo7-timeline-slider');
        index.type='range';index.min='0';index.max=String(events.length-1);index.step='1';index.value='0';
        index.setAttribute('aria-label','Przesuń oś czasu historii');
        const item=el('div','geo7-history-event');
        function setEvent(){
          const event=events[Number(index.value)];
          item.replaceChildren(el('strong','',event.year+' — '+event.title),el('p','',event.text));
        }
        index.addEventListener('input',setEvent);
        wrapper.append(el('h4','', '📅 Oś czasu — przesuwaj palcem'),index,item);
        host.append(wrapper);setEvent();
      }
      for(const [field,heading] of [['names','📜 Dawne nazwy'],['states','🏛️ Dawne państwa'],['leaders','👑 Władcy i przywódcy']]){
        const values=Array.isArray(data[field])?data[field]:[];
        if (!values.length) continue;
        const section=el('details','geo7-history-card');
        section.append(el('summary','',heading));
        const list=el('ul','');
        for(const value of values) list.append(el('li','',value));
        section.append(list);host.append(section);
      }
      if (Array.isArray(data.flags) && data.flags.length) {
        const section=el('div','geo7-history-card');
        section.append(el('h4','', '🚩 Potwierdzone flagi historyczne'));
        for(const flag of data.flags){
          const row=el('div','geo7-history-flag-row');
          row.append(historicFlag(flag));
          const caption=el('div','');
          caption.append(el('strong','',flag.label),el('small','',flag.dates || ''));
          if(flag.note)caption.append(el('small','',flag.note));
          row.append(caption);section.append(row);
        }
        host.append(section);
      } else message(host,'Nie mamy zweryfikowanych rekonstrukcji dawnych flag tego państwa.');
      host.append(el('p','geo7-description','Historycznych granic nie rysujemy bez wiarygodnych danych geometrycznych.'));
      if (Array.isArray(data.sources) && data.sources.length) {
        const s=el('details','geo7-history-card');
        s.append(el('summary','', '📎 Źródła historii'));
        for(const url of data.sources){
          if(!/^https:\/\//.test(url))continue;
          const a=el('a','geo7-source',new URL(url).hostname);
          a.href=url;a.rel='noopener noreferrer';a.target='_blank';s.append(a);
        }
        host.append(s);
      }
    } catch {
      if(seq===historyRequest && screen==='time') host.replaceChildren(el('p','geo7-message','Nie udało się odczytać danych z pamięci aplikacji.'));
    }
  }
  function renderChallenges() {
    const day=dateKey();
    title(content,'🏆 Dobrowolne wyzwania','Dzisiaj: '+day+'. Za poprawne odpowiedzi otrzymujesz punkty. Pominięcie nie ma żadnej kary.');
    for (const challenge of challengeSet(day)) {
      const done=progress.completed[challenge.key] === true;
      const card=el('section','geo7-task');
      card.append(el('strong','geo7-task-heading',(done?'✅ ':'🧩 ')+challenge.prompt));
      if (challenge.type === 'flag') card.append(countryFlag(challenge.target.id));
      card.append(el('small','',done?'Ukończone · +'+challenge.reward+' pkt':'Nagroda: '+challenge.reward+' punktów'));
      if (!done) {
        const answers=el('div','geo7-answers');
        const feedback=el('p','geo7-feedback','');
        for(const choice of challenge.choices){
          const answer=button(challenge.type==='capital'?choice.cap:choice.n,()=>{
            if(progress.completed[challenge.key])return;
            if(choice.id!==challenge.target.id){feedback.textContent='To nie ta odpowiedź. Spróbuj jeszcze raz!';return;}
            progress.completed[challenge.key]=true;
            progress.points+=challenge.reward;
            save();
            navigate('challenges');
          },'geo7-answer');
          answers.append(answer);
        }
        card.append(answers,feedback);
      }
      content.append(card);
    }
    content.append(button('🌍 Wróć do odkrywania świata',close,'geo7-button'));
  }
  function renderShop() {
    title(content,'🛒 Sklep odkrywcy','Wszystkie ceny są w punktach gry. Nie ma płatności ani zakupów za prawdziwe pieniądze.');
    content.append(el('p','geo7-shop-balance','⭐ Twój stan: '+progress.points+' punktów'));
    content.append(button('🎨 Przywróć zwykły wygląd',()=>{
      progress.equipped={theme:'default',frame:'default',title:'default',effect:'default'};
      save();applyAppearance();navigate('shop');
    },'geo7-button'));
    for(const item of catalog){
      const owned=progress.inventory.includes(item.id);
      const selected=progress.equipped[item.kind]===item.id;
      const row=el('div','geo7-shop-item');
      const label=el('div','');
      label.append(el('strong','',item.name),el('small','',item.desc+' · '+item.cost+' pkt'));
      row.append(label);
      const action=button(selected?'✓ Aktywne':owned?'Załóż':'Kup',()=>{
        if(!progress.inventory.includes(item.id)){
          if(progress.points<item.cost){message(content,'Brakuje punktów — wykonaj dobrowolne wyzwania.');return;}
          progress.points-=item.cost;progress.inventory.push(item.id);
        }
        progress.equipped[item.kind]=item.id;save();applyAppearance();navigate('shop');
      },'geo7-buy');
      action.disabled=selected;
      row.append(action);content.append(row);
    }
  }
  function makeDuel() {
    const base = hash(String(Date.now())+':duel');
    const questionTypes=['capital','country','flag'];
    const all=[];
    for(let i=0;i<10;i++){
      const target=countries[(base+i*97)%countries.length];
      const type=questionTypes[i%3];
      if(!target.cap || target.cap==='-')continue;
      const choices=[target];
      let n=(base+i*17+29)%countries.length;
      while(choices.length<4){
        const choice=countries[n];
        if(!choices.some(c=>c.id===choice.id) &&
           (type!=='capital'||!choices.some(c=>c.cap===choice.cap)))choices.push(choice);
        n=(n+131)%countries.length;
      }
      const offset=(base+i)%4;
      all.push({target,type,choices:choices.slice(offset).concat(choices.slice(0,offset))});
    }
    duel={questions:all,index:0,scores:[0,0],answered:false};
  }
  function renderFriends() {
    title(content,'👥 Quiz dla dwóch osób','Podajecie sobie jeden telefon. Każdy odpowiada na pięć pytań — bez internetu.');
    if(!duel) {
      content.append(button('🎲 Rozpocznij pojedynek',()=>{makeDuel();navigate('friends');},'geo7-button geo7-primary'));
      content.append(el('p','geo7-description','Prawdziwy multiplayer online nie jest włączony. Wynik można udostępnić tekstem.'));
      return;
    }
    if(duel.index>=duel.questions.length){
      const result=duel.scores[0]===duel.scores[1]?'🤝 Remis!':
        '🏆 Wygrywa gracz '+(duel.scores[0]>duel.scores[1]?1:2)+'!';
      const shareText='🌍 GeoPrzygoda — quiz dla dwojga! Gracz 1: '+duel.scores[0]+'/'+(duel.questions.length/2)+', Gracz 2: '+duel.scores[1]+'/'+(duel.questions.length/2)+'. '+result;
      content.append(el('h3','geo7-section-title',result),el('p','geo7-score',shareText));
      content.append(button('📤 Udostępnij lub skopiuj wynik',async()=>{
        if(navigator.share){try{await navigator.share({text:shareText});return;}catch{ /* cancelled or unsupported */ }}
        try{
          if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(shareText);message(content,'Wynik skopiowany!');return;}
        }catch{/* fallback below */}
        const box=el('textarea','geo7-share');
        box.readOnly=true;box.value=shareText;content.append(box);
        box.focus();box.select();
        try{ if(document.execCommand('copy')){box.remove();message(content,'Wynik skopiowany!');return;} }catch{}
        message(content,'Zaznacz tekst powyżej i wybierz Kopiuj.');
      },'geo7-button geo7-primary'));
      content.append(button('🔁 Zagraj ponownie',()=>{makeDuel();navigate('friends');},'geo7-button'));
      content.append(button('Zakończ pojedynek',()=>{duel=null;navigate('home');},'geo7-button'));
      return;
    }
    const current=duel.questions[duel.index];
    const player=(duel.index%2)+1;
    content.append(el('div','geo7-duel-score','Gracz 1: '+duel.scores[0]+' · Gracz 2: '+duel.scores[1]));
    content.append(el('h4','geo7-turn','Runda '+(duel.index+1)+'/10 · Gracz '+player));
    const prompt=current.type==='capital'?'Jaka jest stolica '+current.target.n+'?':
      current.type==='country'?'Które państwo ma stolicę '+current.target.cap+'?':'Do którego państwa należy ta flaga?';
    content.append(el('p','geo7-question',prompt));
    if(current.type==='flag')content.append(countryFlag(current.target.id));
    const choices=el('div','geo7-answers'), feedback=el('p','geo7-feedback');
    for(const option of current.choices){
      const ans=button(current.type==='capital'?option.cap:option.n,()=>{
        if(duel.answered)return;
        duel.answered=true;
        if(option.id===current.target.id){duel.scores[player-1]++;feedback.textContent='✅ Brawo! Poprawna odpowiedź.';}
        else feedback.textContent='Odpowiedź: '+(current.type==='capital'?current.target.cap:current.target.n);
        for(const b of choices.querySelectorAll('button'))b.disabled=true;
        content.append(button('Dalej ›',()=>{duel.index++;duel.answered=false;navigate('friends');},'geo7-button geo7-primary'));
      },'geo7-answer');
      choices.append(ans);
    }
    content.append(choices,feedback);
  }
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  document.addEventListener('keydown',event=>{
    if(overlay.classList.contains('hidden'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
    if(event.key==='Tab'){
      const focusables=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')]
        .filter(x=>!x.hidden&&x.getClientRects().length);
      if(!focusables.length)return;
      const first=focusables[0],last=focusables[focusables.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },true);
  if(window.GeoPrzygodaApp?.onBack){
    const previousBack=window.GeoPrzygodaApp.onBack.bind(window.GeoPrzygodaApp);
    window.GeoPrzygodaApp.onBack=function(){
      if(!overlay.classList.contains('hidden')){close();return true;}
      return previousBack();
    };
  }
  window.GeoPrzygodaPlan7={
    version:'7.0.0',open,
    get points(){return progress.points;},
    flagForCountry,
    get completedToday(){return challengeSet(dateKey()).filter(c=>progress.completed[c.key]).length;},
    get inventory(){return [...progress.inventory];}
  };
})();
