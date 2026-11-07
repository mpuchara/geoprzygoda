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
  panel.setAttribute('aria-label', 'Kampania podbojów');
  panel.innerHTML =
    '<div class="battle-head"><strong>⚔️ Kampania podbojów</strong><button id="battle-exit" aria-label="Zakończ rywalizację">×</button></div>' +
    '<div id="battle-title" class="battle-title"></div>' +
    '<div id="battle-stats" class="battle-stats"></div>' +
    '<label for="battle-target">Sąsiedni teren do zdobycia</label><select id="battle-target" class="battle-select"></select>' +
    '<div id="battlefield" class="battlefield hidden" role="status" aria-live="polite">' +
    '<div class="battle-soldiers"><span class="army-left">🪖 🛡️ 🪖</span><span class="army-middle">⚔️</span><span class="army-right">🪖 🛡️ 🪖</span></div>' +
    '<div id="battle-balance" class="battle-balance"></div>' +
    '<div class="battle-progress-caption"><span id="battle-stage">Przygotowanie</span><strong id="battle-progress-label">0%</strong></div>' +
    '<div id="battle-progress" class="battle-progress-track" role="progressbar" aria-label="Postęp zdobywania terenu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="battle-conquest-fill"></span></div></div>' +
    '<div id="battle-message" class="battle-message" aria-live="polite">Wybierz sąsiada i rozpocznij bitwę!</div>' +
    '<div class="battle-actions"><button id="battle-attack" class="battle-primary">⚔️ Rozpocznij natarcie</button>' +
    '<button id="battle-history" class="battle-secondary">📜 Historia</button></div>' +
    '<p class="battle-disclaimer">Fikcyjna gra planszowa. Front przesuwa się przez prawdziwy kształt państwa, ale wynik i oddziały są wymyślone. Nie pokazujemy prawdziwych działań wojskowych.</p>';
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
  rivalStart.textContent = '⚔️ Start: Kampania podbojów';
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
  // Gradual fictional conquest. Organic wave shapes are clipped to the country's
  // real offline Natural Earth outline; no rectangular or straight-cut borders.
  const CAPITAL_POSITION = {
    BLR:[27.5615,53.9023], POL:[21.0122,52.2297], UKR:[30.5234,50.4501],
    LTU:[25.2797,54.6872], LVA:[24.1052,56.9496], EST:[24.7536,59.437],
    CZE:[14.4208,50.088], SVK:[17.1077,48.1486], DEU:[13.405,52.52],
    AUT:[16.3738,48.2082], HUN:[19.0402,47.4979], ROU:[26.1025,44.4268],
    MDA:[28.8638,47.0105], RUS:[37.6173,55.7558], FRA:[2.3522,48.8566],
    BEL:[4.3517,50.8503], NLD:[4.9041,52.3676], LUX:[6.1319,49.6116],
    GBR:[-0.1276,51.5072], IRL:[-6.2603,53.3498], ESP:[-3.7038,40.4168],
    PRT:[-9.1393,38.7223], ITA:[12.4964,41.9028], CHE:[7.4474,46.948],
    DNK:[12.5683,55.6761], NOR:[10.7522,59.9139], SWE:[18.0632,59.3293],
    FIN:[24.9384,60.1699], GRC:[23.7275,37.9838], TUR:[32.8597,39.9334],
    HRV:[15.9819,45.815], SRB:[20.4489,44.7866], BIH:[18.4131,43.8563],
    SVN:[14.5058,46.0569], BGR:[23.3219,42.6977], USA:[-77.0369,38.9072],
    CAN:[-75.6972,45.4215], MEX:[-99.1332,19.4326], BRA:[-47.8825,-15.7942],
    ARG:[-58.3816,-34.6037], CHL:[-70.6693,-33.4489], CHN:[116.4074,39.9042],
    JPN:[139.6917,35.6895], KOR:[126.978,37.5665], PRK:[125.7625,39.0392],
    IND:[77.209,28.6139], PAK:[73.0479,33.6844], IRN:[51.389,35.6892],
    ISR:[35.2137,31.7683], EGY:[31.2357,30.0444], ZAF:[28.1881,-25.7461],
    AUS:[149.13,-35.2809], NZL:[174.7767,-41.2865], MAR:[-6.8498,34.0209],
    DZA:[3.0588,36.7538], IDN:[106.8456,-6.2088]
  };
  const mapPoint = (lon, lat) => ({
    x: (lon + 180) * 3,
    y: 540 - (540 / Math.PI) * Math.asinh(Math.tan(Math.max(-85, Math.min(85, lat)) * Math.PI / 180))
  });
  const clamp01 = value => Math.max(0, Math.min(1, value));
  function countryGoal(c) {
    const coords = CAPITAL_POSITION[c.id];
    return {
      ...(coords ? mapPoint(coords[0],coords[1]) : {x:c.x,y:c.y}),
      city: coords ? c.cap : null
    };
  }
  // Sample actual coast/border path geometry. This also handles tiny countries
  // and irregular polygons without relying on bounding-box rectangles.
  function borderSamples(path, count) {
    let length = 0;
    try { length = path.getTotalLength(); } catch { return []; }
    if (!Number.isFinite(length) || length <= 0) return [];
    const result = [];
    for(let i=0;i<count;i++){
      const p = path.getPointAtLength(length * i / count);
      result.push({x:p.x,y:p.y});
    }
    return result;
  }
  function closestBorderStart(targetId, goal) {
    const targetPaths = [...countryPieces(targetId)];
    const targetBorder = targetPaths.flatMap(path => borderSamples(path,30));
    const special = game.player === 'POL' && targetId === 'BLR';
    const source = special ? mapPoint(23.1688,53.1325) : null; // Białystok, still in Poland
    let entry = targetBorder[0] || {x:goal.x,y:goal.y};
    let start = source || entry;
    let min = Infinity;
    const nearLands = landsOf(game.player).filter(c => neighbors.get(c.id)?.has(targetId));
    if (special) {
      for (const p of targetBorder) {
        const d = Math.hypot(source.x-p.x,source.y-p.y);
        if (d<min){min=d;entry=p;}
      }
    } else {
      const ownBorder = nearLands.flatMap(c => [...countryPieces(c.id)]
        .flatMap(path => borderSamples(path,24)));
      for (const own of ownBorder) for (const p of targetBorder) {
        const d = Math.hypot(own.x-p.x,own.y-p.y);
        if(d<min){min=d;start=own;entry=p;}
      }
    }
    return {start,entry,sourceCity:special?'Białystok':null};
  }
  function smoothBlob(cx,cy,rx,ry,seed) {
    if (rx<0.03 || ry<0.03) return '';
    const pts = [];
    const count = 36;
    for(let i=0;i<count;i++){
      const a=2*Math.PI*i/count;
      const wave=1 + .13*Math.sin(3*a+seed*1.7)
        + .09*Math.sin(5*a-seed*2.3) + .055*Math.sin(9*a+seed*.7);
      pts.push([cx+Math.cos(a)*rx*wave,cy+Math.sin(a)*ry*wave]);
    }
    const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const first=midpoint(pts[count-1],pts[0]);
    let out='M'+first[0].toFixed(2)+','+first[1].toFixed(2);
    for(let i=0;i<count;i++){
      const p=pts[i], mid=midpoint(p,pts[(i+1)%count]);
      out+='Q'+p[0].toFixed(2)+','+p[1].toFixed(2)+' '+mid[0].toFixed(2)+','+mid[1].toFixed(2);
    }
    return out+'Z';
  }
  // Generate fictional small regions inside a country's real coastline.
  // Voronoi borders are irregular; they are NOT real administrative borders.
  function createBattleSectors(box, goal, routeNodes, seed, radius, make, clipId) {
    const columns = Math.max(4, Math.min(9, Math.round(box.width / 4)));
    const rows = Math.max(4, Math.min(9, Math.round(box.height / 4)));
    const random = (x, y) => {
      const n = Math.sin(x * 127.1 + y * 311.7 + seed * 17.81) * 43758.5453;
      return n - Math.floor(n);
    };
    const sites = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      sites.push({
        x: box.x + box.width * (x + .2 + random(x, y) * .6) / columns,
        y: box.y + box.height * (y + .2 + random(y + 17, x) * .6) / rows
      });
    }
    const grid = make('g');
    grid.classList.add('battle-fictional-sectors');
    grid.setAttribute('clip-path', 'url(#' + clipId + ')');
    const sectors = [];
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      let polygon = [
        [box.x, box.y], [box.x + box.width, box.y],
        [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]
      ];
      // Clip each region by the bisectors of its neighboring seed points.
      for (let j = 0; j < sites.length && polygon.length >= 3; j++) {
        if (i === j) continue;
        const other = sites[j];
        const vx = 2 * (other.x - site.x), vy = 2 * (other.y - site.y);
        const edge = other.x * other.x + other.y * other.y -
                     site.x * site.x - site.y * site.y;
        const side = p => vx * p[0] + vy * p[1] - edge;
        const clipped = [];
        for (let k = 0; k < polygon.length; k++) {
          const a = polygon[k], b = polygon[(k + 1) % polygon.length];
          const da = side(a), db = side(b);
          if (da <= 0) clipped.push(a);
          if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
            const amount = da / (da - db);
            clipped.push([
              a[0] + (b[0] - a[0]) * amount,
              a[1] + (b[1] - a[1]) * amount
            ]);
          }
        }
        polygon = clipped;
      }
      if (polygon.length < 3) continue;
      const d = polygon.map((p, k) =>
        (k ? 'L' : 'M') + p[0].toFixed(3) + ',' + p[1].toFixed(3)
      ).join('') + 'Z';
      const outline = make('path');
      outline.setAttribute('d', d);
      outline.classList.add('battle-fictional-sector-line');
      grid.append(outline);

      // First capture sectors close to the marching route (toward the capital).
      // After reaching the capital, nearby sectors expand outwards unevenly.
      let roadThreshold = 1;
      const stepSize = Math.max(1, Math.min(box.width, box.height) * .15);
      for (let k = 0; k < routeNodes.length - 1; k++) {
        const a = routeNodes[k], b = routeNodes[k + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const lengthSq = Math.max(.001, dx * dx + dy * dy);
        const t = Math.max(0, Math.min(1,
          ((site.x - a.x) * dx + (site.y - a.y) * dy) / lengthSq
        ));
        const nearestX = a.x + dx * t, nearestY = a.y + dy * t;
        const distance = Math.hypot(site.x - nearestX, site.y - nearestY);
        const along = (k + t) / (routeNodes.length - 1);
        roadThreshold = Math.min(roadThreshold,
          .045 + along * .47 + Math.min(.22, distance / stepSize * .08));
      }
      const capitalThreshold = .43 +
        .48 * Math.min(1, Math.hypot(site.x - goal.x, site.y - goal.y) /
                           Math.max(1, radius));
      const jitter = (random(i, seed + 22) - .5) * .055;
      const threshold = Math.max(.02, Math.min(.98,
        Math.min(roadThreshold, capitalThreshold) + jitter));
      sectors.push({ d, outline, threshold, revealed: false });
    }
    return { grid, sectors };
  }
  function clearAdvance() {
    if (advanceFrame !== null) cancelAnimationFrame(advanceFrame);
    advanceFrame = null;
    if (!advanceScene) return;
    advanceScene.host.classList.remove('battle-attacking');
    for (const node of advanceScene.nodes) node.remove();
    advanceScene = null;
  }
  function setAdvanceProgress(fraction) {
    const progress = clamp01(fraction);
    const percent = Math.round(progress*100);
    $('battle-conquest-fill').style.width = percent + '%';
    $('battle-progress-label').textContent = percent + '%';
    $('battle-progress').setAttribute('aria-valuenow',String(percent));
    if (!advanceScene) return;
    const scene=advanceScene;
    const {box,routeNodes,frontShape,unit,route,goal,entry} = scene;
    const base=Math.max(1.5,Math.min(box.width,box.height)*.15);
    const parts=[];
    // Small adjacent bulges advance along a curved route, not a straight wipe.
    for(let i=0;i<routeNodes.length;i++){
      const threshold=i/(routeNodes.length-1)*.49;
      const amount=clamp01((progress-threshold)/.15);
      if(amount===0)continue;
      const p=routeNodes[i];
      parts.push(smoothBlob(p.x,p.y,base*(.58+amount*.60)*(1+(i%3)*.12),
        base*(.62+amount*.65)*(1+(i%4)*.08),i*2.7+scene.seed));
    }
    // After reaching the capital, the captured regions spread unevenly to the
    // remaining corners. Final shape exactly follows the country's coastline.
    if(progress>.43){
      const growth=clamp01((progress-.43)/.57);
      const rad=scene.radius*Math.pow(growth,.96)*1.62;
      parts.push(smoothBlob(goal.x,goal.y,rad,rad,scene.seed+7.2));
      if(progress>.7){
        const side=clamp01((progress-.7)/.3);
        parts.push(smoothBlob(box.x+box.width*.23,box.y+box.height*.60,
          scene.radius*1.45*side,scene.radius*1.45*side,scene.seed+3.4));
        parts.push(smoothBlob(box.x+box.width*.77,box.y+box.height*.38,
          scene.radius*1.45*side,scene.radius*1.45*side,scene.seed+11.5));
      }
    }
    if (scene.sectors) {
      for (const cell of scene.sectors) {
        const captured = progress >= .999 || (progress > 0 && progress >= cell.threshold);
        if (captured !== cell.revealed) {
          cell.revealed = captured;
          cell.outline.classList.toggle('battle-fictional-sector-captured', captured);
        }
        if (captured) parts.push(cell.d);
      }
    }
    if(progress>=1){
      parts.length=0;
      parts.push('M'+(box.x-2)+','+(box.y-2)+'h'+(box.width+4)+'v'+(box.height+4)+'h-'+(box.width+4)+'Z');
    }
    frontShape.setAttribute('d',parts.join(''));
    // The unit follows the invasion route; it retreats on unsuccessful attacks.
    const march=clamp01(progress/.55);
    const index=march*(routeNodes.length-1);
    const i=Math.min(routeNodes.length-2,Math.floor(index));
    const f=index-i;
    const a=routeNodes[i],b=routeNodes[i+1];
    unit.setAttribute('transform','translate('+(a.x+(b.x-a.x)*f)+','+(a.y+(b.y-a.y)*f)+')');
    route.setAttribute('stroke-dashoffset',String(34-34*march));
    // A small frontline halo follows the edge without drawing an artificial
    // vertical country-wide border.
    scene.glow.setAttribute('cx',String(a.x+(b.x-a.x)*f));
    scene.glow.setAttribute('cy',String(a.y+(b.y-a.y)*f));
    scene.glow.setAttribute('r',String(base*(.7+progress*.3)));
  }
  function createAdvance(targetId) {
    clearAdvance();
    const primary=$('land-'+targetId);
    if(!primary || !primary.ownerSVGElement)return;
    const host=primary.parentElement;
    const paths=[...countryPieces(targetId)];
    if(!paths.length)return;
    let box;
    try{box=primary.getBBox();}catch{return;}
    if(!box || box.width<=0 || box.height<=0)return;
    const c=playable.get(targetId);
    const goal=countryGoal(c);
    const {start,entry,sourceCity}=closestBorderStart(targetId,goal);
    const svg=primary.ownerSVGElement, ns='http://www.w3.org/2000/svg';
    const make=name=>document.createElementNS(ns,name);
    let defs=svg.querySelector('defs');
    if(!defs){defs=make('defs');svg.insertBefore(defs,svg.firstChild);}
    const clip=make('clipPath');
    clip.id='battle-organic-country-clip';
    clip.setAttribute('clipPathUnits','userSpaceOnUse');
    for(const path of paths){
      const copy=path.cloneNode(false);
      copy.removeAttribute('id');
      copy.removeAttribute('class');
      copy.removeAttribute('style');
      clip.append(copy);
    }
    defs.append(clip);
    const ink=make('path');
    ink.classList.add('battle-organic-fill');
    ink.setAttribute('clip-path','url(#battle-organic-country-clip)');
    const attacker=$('land-'+game.player);
    const fill=map.classList.contains('flag-fill')
      ? 'url(#flag-pattern-'+game.player+')'
      : (attacker?.getAttribute('fill') || '#77cfa3');
    ink.setAttribute('fill',fill);
    ink.setAttribute('fill-rule','nonzero');
    const graphics=make('g');
    graphics.classList.add('battle-route-graphics');
    const dx=goal.x-entry.x,dy=goal.y-entry.y;
    const len=Math.max(1,Math.hypot(dx,dy));
    const seed=Array.from(targetId).reduce((sum,ch)=>sum*7+ch.charCodeAt(0),1)%31;
    const bend=(seed%2?1:-1)*Math.min(len*.24,Math.min(box.width,box.height)*.19);
    const routeNodes=[start];
    for(let i=0;i<10;i++){
      const t=i/9;
      const offset=Math.sin(Math.PI*t)*bend;
      routeNodes.push({x:entry.x+dx*t-dy/len*offset,
                       y:entry.y+dy*t+dx/len*offset});
    }
    const route=make('path');
    route.classList.add('battle-route-line');
    route.setAttribute('d','M'+start.x+','+start.y+' L'+entry.x+','+entry.y+
      ' Q'+(entry.x+dx*.5-dy/len*bend*2)+','+(entry.y+dy*.5+dx/len*bend*2)+
      ' '+goal.x+','+goal.y);
    graphics.append(route);
    const glow=make('circle');
    glow.classList.add('battle-front-halo');
    graphics.append(glow);
    const unit=make('g');
    unit.classList.add('battle-moving-unit');
    const unitRing=make('circle');
    unitRing.setAttribute('r','5');
    const unitCore=make('circle');
    unitCore.setAttribute('r','2');
    unitCore.classList.add('battle-unit-core');
    const banner = make('rect');
    banner.classList.add('battle-unit-banner');
    banner.setAttribute('x','3');
    banner.setAttribute('y','-9');
    banner.setAttribute('width','8');
    banner.setAttribute('height','5');
    banner.setAttribute('fill',fill);
    unit.append(unitRing,unitCore,banner);
    graphics.append(unit);
    const marker=make('g');
    marker.classList.add('battle-capital-marker');
    marker.setAttribute('transform','translate('+goal.x+','+goal.y+')');
    const outer=make('circle');
    outer.setAttribute('r','5');
    const inner=make('circle');
    inner.setAttribute('r','2');
    marker.append(outer,inner);
    if(goal.city){
      const label=make('text');
      label.setAttribute('x','8');
      label.setAttribute('y','-7');
      label.textContent='★ '+goal.city;
      marker.append(label);
    }
    graphics.append(marker);
    host.classList.add('battle-attacking');
    const radius=Math.max(...[
      [box.x,box.y],[box.x+box.width,box.y],
      [box.x,box.y+box.height],[box.x+box.width,box.y+box.height]
    ].map(corner=>Math.hypot(corner[0]-goal.x,corner[1]-goal.y)));
    const { grid, sectors } = createBattleSectors(
      box, goal, routeNodes, seed, radius, make, clip.id
    );
    host.append(ink, grid, graphics);
    advanceScene={
      nodes:[ink,grid,graphics,clip],host,frontShape:ink,route,unit,glow,
      goal,entry,sourceCity,seed,routeNodes,box,radius,sectors
    };
    setAdvanceProgress(0);
  }
  function playAdvance(targetId,won,duration) {
    createAdvance(targetId);
    const stage=$('battle-stage');
    const location=advanceScene?.goal.city;
    const source=advanceScene?.sourceCity;
    const started=performance.now();
    stage.textContent=source ? '📍 Start: '+source : '⚔️ Początek natarcia';
    if(reduced){
      setAdvanceProgress(won?1:0);
      stage.textContent=won?'🏆 Zwycięstwo':'🛡️ Obrona';
      return;
    }
    function frame(now){
      const t=clamp01((now-started)/duration);
      const progress=won?t:(t<.60?t/.60*.59:(1-t)/.40*.59);
      setAdvanceProgress(progress);
      if(t<.15)stage.textContent=source?'📍 Start: '+source:'⚔️ Przekroczenie granicy';
      else if(!won && t>=.60)stage.textContent='🛡️ Obrońcy odzyskują teren';
      else if(progress<.55)stage.textContent=location?'➡️ Kierunek: '+location:'➡️ Natarcie w głąb kraju';
      else stage.textContent='🗺️ Zajmowanie kolejnych regionów';
      if(t<1 && fighting && game)advanceFrame=requestAnimationFrame(frame);
      else advanceFrame=null;
    }
    advanceFrame=requestAnimationFrame(frame);
  }
  function restoreOriginalColors() {
    for (const c of regions) {
      for (const shape of countryPieces(c.id)) {
        const showFlag = map.classList.contains('flag-fill') && c.code;
        if (showFlag) shape.style.fill = shape.dataset.geoprzygodaFittedFlag || 'url(#flag-pattern-' + c.id + ')';
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
        if (showFlag) shape.style.fill = holder === c.id && shape.dataset.geoprzygodaFittedFlag
          ? shape.dataset.geoprzygodaFittedFlag : 'url(#flag-pattern-' + holder + ')';
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
    $('battle-message').textContent = 'Dotknij sąsiedniego kraju lub wybierz go z listy. Zobacz, jak zmienia się linia frontu.';
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
    $('battle-message').textContent = 'Cel: ' + countryLabel(id) + '. Wciśnij „Rozpocznij natarcie”.';
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
    const duration = reduced ? 250 : 6500;
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
