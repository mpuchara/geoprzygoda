/* GeoPrzygoda Plan 6: offline country encyclopedia and sourced history.
 * Never modify the current map or fetch any network data at runtime. */
(function () {
  'use strict';
  const atlas = new Map(COUNTRY_DATA.map(c => [c.id, c]));
  const knownHistory = new Set(['POL','NLD','DEU','FRA','USA','AUT']);
  const cache = new Map();
  let activeId = null, current = null, requestId = 0;
  const ns = 'http://www.w3.org/2000/svg';
  const fmt = n => Number(n).toLocaleString('pl-PL');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  };
  function addFact(container, title, value) {
    if (value == null || value === '') return;
    const div = el('div','geo6-fact');
    div.append(el('span','',title),el('strong','',value));
    container.append(div);
  }
  function addDetails(host,title,opened=false) {
    const details = el('details','geo6-card');
    details.open = opened;
    details.append(el('summary','',title));
    host.append(details);
    return details;
  }
  function sourceLinks(host, sources) {
    if (!Array.isArray(sources) || !sources.length) return;
    const details = addDetails(host,'📎 Źródła danych');
    const ul = el('ul','geo6-sources');
    for (const url of sources) {
      if (!/^https:\/\//.test(url)) continue;
      const item = el('li'), a = el('a','',new URL(url).hostname);
      a.href=url;
      a.target='_blank';
      a.rel='noopener noreferrer';
      a.title=url;
      item.append(a);ul.append(item);
    }
    details.append(ul);
  }
  async function readOffline(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Brak lokalnego pliku: '+url);
    return response.json();
  }
  function getCountry(id) {
    if (cache.has(id)) return Promise.resolve(cache.get(id));
    return readOffline('encyclopedia/'+id.toLowerCase()+'.json').then(record=>{
      if (!record || record.id!==id) throw new Error('Niespójne dane kraju');
      cache.set(id,record);
      while (cache.size > 8) cache.delete(cache.keys().next().value);
      return record;
    });
  }
  function renderFacts(host,c,d) {
    host.replaceChildren();
    const intro = el('div','geo6-intro');
    intro.append(el('span','geo6-eyebrow','ENCYKLOPEDIA ŚWIATA'),el('p','', 'Sprawdzone informacje dostępne offline. Nieznane wartości pomijamy.'));
    host.append(intro);
    const basics = addDetails(host,'📚 Kraj w liczbach',true);
    const grid=el('div','geo6-grid');basics.append(grid);
    addFact(grid,'Kontynent',d.continent);
    addFact(grid,'Stolica',d.capital);
    addFact(grid,'Powierzchnia',d.areaKm2?fmt(d.areaKm2)+' km²':null);
    addFact(grid,'Liczba mieszkańców',d.population&&d.populationYear?fmt(d.population)+' ('+d.populationYear+' r.)':null);
    addFact(grid,'Waluta',d.currency?.length?d.currency.map(x=>x.name+' ('+x.code+')'+(x.symbol?' · '+x.symbol:'')).join('; '):null);
    addFact(grid,'Języki wymienione w bazie',d.languages?.length?d.languages.join(', '):null);
    const nature = addDetails(host,'🗺️ Granice i przyroda');
    const natureGrid = el('div','geo6-grid');nature.append(natureGrid);
    addFact(natureGrid,'Granice lądowe',d.landBorderKm!=null?fmt(d.landBorderKm)+' km':null);
    addFact(natureGrid,'Dostęp do morza',typeof d.hasSea==='boolean'?(d.hasSea?'Tak':'Nie'):null);
    addFact(natureGrid,'Długość wybrzeża',d.coastlineKm!=null?fmt(d.coastlineKm)+' km':null);
    addFact(natureGrid,'Najwyższy szczyt',d.peak);
    addFact(natureGrid,'Rzeka',d.river);
    addFact(natureGrid,'Jezioro',d.lake);
    const neigh = d.borders?.map(code=> {
      const country=atlas.get(code);
      if (!country) return null;
      const length=d.borderDistancesKm?.[code];
      return country.n+(length!=null?' — '+fmt(length)+' km':'');
    }).filter(Boolean)||[];
    addFact(natureGrid,'Sąsiednie państwa',neigh.length?neigh.join(' · '):null);
    if (!natureGrid.childElementCount)
      nature.append(el('p','geo6-note','Brak dodatkowych zweryfikowanych pomiarów dla tego obszaru.'));
    const sourceList=['https://github.com/mledoze/countries','https://data.worldbank.org/indicator/SP.POP.TOTL'];
    if(d.sources?.length)sourceList.push(...d.sources);
    sourceLinks(host,sourceList);
    const historyButton=el('button','geo6-history-button','🏰 Jak było dawniej?');
    historyButton.type='button';
    const historyPanel=el('section','geo6-history-panel');
    historyPanel.hidden=true;
    historyButton.addEventListener('click',()=>{
      const opening=historyPanel.hidden;
      historyPanel.hidden=!opening;
      historyButton.setAttribute('aria-expanded',String(opening));
      // Render directly on every opening, avoiding stale per-panel state
      // after repeated open/close gestures and background document clicks.
      if (opening) {
        historyPanel.replaceChildren(el('p','geo6-note','Odczytywanie historii z pamięci telefonu…'));
        renderHistory(c.id,historyPanel);
      }
    });
    historyButton.setAttribute('aria-expanded','false');
    host.append(historyButton,historyPanel);
  }
  function makeFlag(info) {
    const box = el('div','geo6-old-flag');
    box.setAttribute('role','img');
    box.setAttribute('aria-label',info.label+' — '+info.dates);
    if ((info.kind==='h'||info.kind==='v')&&Array.isArray(info.colors)&&info.colors.length) {
      const dir=info.kind==='h'?'to bottom':'to right';
      const stops=info.colors.flatMap((color,i)=>[
        color+' '+(i/info.colors.length*100)+'%',
        color+' '+((i+1)/info.colors.length*100)+'%'
      ]);
      box.style.background='linear-gradient('+dir+','+stops.join(',')+')';
    } else if(info.kind==='usa48'){
      const svg=document.createElementNS(ns,'svg');
      svg.setAttribute('viewBox','0 0 760 400');
      svg.setAttribute('aria-hidden','true');
      for(let i=0;i<13;i++){
        const r=document.createElementNS(ns,'rect');
        r.setAttribute('x','0');r.setAttribute('y',String(i*400/13));
        r.setAttribute('width','760');r.setAttribute('height',String(400/13+0.2));
        r.setAttribute('fill',i%2?'white':'#b22234');svg.append(r);
      }
      const canton=document.createElementNS(ns,'rect');
      canton.setAttribute('width','304');canton.setAttribute('height',String(7*400/13));
      canton.setAttribute('fill','#3c3b6e');svg.append(canton);
      for(let row=0;row<6;row++)for(let col=0;col<8;col++){
        const star=document.createElementNS(ns,'polygon');
        const cx=19+col*38,cy=18+row*35,points=[];
        for(let k=0;k<10;k++){
          const a=Math.PI*k/5-Math.PI/2,rad=k%2===0?10:4.2;
          points.push((cx+rad*Math.cos(a)).toFixed(2)+','+(cy+rad*Math.sin(a)).toFixed(2));
        }
        star.setAttribute('points',points.join(' '));star.setAttribute('fill','white');svg.append(star);
      }
      box.append(svg);
    }
    return box;
  }
  function renderTimeline(host,items){
    const area=el('div','geo6-timeline');
    const row=el('div','geo6-years');
    const range=el('input','geo6-slider');
    range.type='range';range.min='0';range.max=String(items.length-1);range.step='1';range.value='0';
    range.setAttribute('aria-label','Oś czasu historii państwa');
    const card=el('div','geo6-event');
    const update=i=>{
      const e=items[i];
      card.replaceChildren(el('span','geo6-date',e.year),el('h4','',e.title),el('p','',e.text));
      for(const b of row.children)b.classList.toggle('active',Number(b.dataset.index)===i);
    };
    items.forEach((item,index)=>{
      const b=el('button','geo6-year',String(item.year));
      b.type='button';b.dataset.index=String(index);
      b.addEventListener('click',()=>{range.value=String(index);update(index);b.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});});
      row.append(b);
    });
    range.addEventListener('input',()=>update(Number(range.value)));
    update(0);
    area.append(el('p','geo6-note','Przesuwaj oś czasu palcem lub wybierz rok.'),range,row,card);
    host.append(area);
  }
  async function renderHistory(id,host){
    host.replaceChildren(el('p','geo6-note','Odczytywanie historii z pamięci telefonu…'));
    if (!knownHistory.has(id)) {
      host.replaceChildren(el('p','geo6-note','Dla tego kraju nie mamy jeszcze sprawdzonej osi czasu ani historycznych flag. Nie pokazujemy wymyślonych danych.'));
      return;
    }
    try {
      const data=await readOffline('history/'+id.toLowerCase()+'.json');
      if(activeId!==id)return;
      host.replaceChildren(el('h3','geo6-history-title','Historia: '+atlas.get(id).n));
      if(data.events?.length)renderTimeline(host,data.events);
      for(const [key,title] of [['names','📜 Dawne nazwy'],['states','🏰 Dawne państwa i ustroje'],['leaders','👑 Dawni władcy i przywódcy']]){
        if(!data[key]?.length)continue;
        const details=addDetails(host,title);
        const list=el('ul','geo6-list');
        data[key].forEach(x=>list.append(el('li','',x)));
        details.append(list);
      }
      if (data.flags?.length) {
        const flags = addDetails(host,'🚩 Historyczne flagi',true);
        for (const info of data.flags) {
          const card=el('div','geo6-flag-card');
          const descr=el('div');
          descr.append(el('strong','',info.label),el('span','',info.dates));
          if(info.note)descr.append(el('small','',info.note));
          card.append(makeFlag(info),descr);flags.append(card);
        }
      }
      host.append(el('p','geo6-map-note','🗺️ Dawnych granic nie rysujemy bez zweryfikowanych danych geograficznych. Mapa współczesna pozostaje bez zmian.'));
      sourceLinks(host,data.sources);
    } catch(e){
      console.error('GeoPrzygoda: history could not render', id, e);
      host.replaceChildren(el('p','geo6-note','Nie udało się otworzyć sprawdzonych danych historycznych.'));
    }
  }
  function enhance(id) {
    const c=atlas.get(id), sheet=document.getElementById('info-'+id);
    if(!c||!sheet)return;
    activeId=id;requestId++;
    if(current && current.parentNode)current.remove();
    const serial=requestId;
    current=el('div','geo6-encyclopedia');
    // The app's global [data-country] click handler navigates to a country.
    // Never set that attribute on the entire panel: its buttons would reopen
    // the country and erase the history immediately after being clicked.
    current.dataset.encyclopediaCountry=id;
    const anchor=sheet.querySelector('.facts');
    if(anchor)anchor.after(current);else sheet.append(current);
    current.append(el('p','geo6-note','Wczytywanie encyklopedii offline…'));
    getCountry(id).then(data=>{
      if (serial!==requestId || activeId!==id || !current?.isConnected) return;
      renderFacts(current,c,data);
    }).catch(()=>{
      if(serial===requestId&&current?.isConnected)
        current.replaceChildren(el('p','geo6-note','Dodatkowe dane niedostępne. Podstawowy opis kraju działa nadal.'));
    });
  }
  window.GeoPrzygodaEncyclopedia={enhance,knownHistory:[...knownHistory],stats:()=>({activeId,recordsCached:cache.size})};
})();
