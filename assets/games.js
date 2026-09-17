/* DON HUNT game boards: RTYH, Pick Your Type/Color, Case Break, Wall of Hits.
   Page sets <body data-game="rtyh|types|case|hits">. Each game reads its own Google Sheet
   (DONHUNT_CONFIG.gameSheets[game], or ?sheet=). It uses the tab named after the game if it
   exists (RTYH / TYPES / CASE / HITS), otherwise the sheet's first tab.
   URL options: ?sheet= ?tab= ?clean=1 ?layout=wide|tall ?transparent=1 ?sound=1 */
(function () {
  const S = window.DonHuntSheet;
  const IMG = window.DonHuntImages;
  const CFG = window.DONHUNT_CONFIG || {};
  const P = new URLSearchParams(location.search);
  const GAME = document.body.dataset.game;
  const CLEAN = P.has('clean') && P.get('clean') !== '0';
  const POLL = Math.max(3, Number(CFG.pollSeconds) || 4) * 1000;
  const LS = 'donhunt-game:' + GAME + ':';
  const TAB = { rtyh: 'RTYH', types: 'TYPES', case: 'CASE', hits: 'HITS' }[GAME];
  const MAX_SPOTS = 24;

  // ---------- helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = S.norm;
  const yes = v => /^(y|yes|true|on|1|show)$/i.test(String(v || '').trim());
  const no = v => /^(n|no|false|off|0|hide)$/i.test(String(v || '').trim());
  const money = v => { const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; };
  const fmtMoney = n => n == null ? '' : '$' + (Math.round(n * 100) % 100 === 0 ? n.toFixed(0) : n.toFixed(2));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} },
  };
  function picUrl(raw) { const f = IMG.fixImageLink(raw); return f.kind === 'image' || f.kind === 'drive' ? f.url : ''; }
  function picHTML(raw, cls) {
    const u = picUrl(raw);
    return u ? `<div class="pic ${cls || ''}"><img src="${esc(u)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()"></div>` : `<div class="pic ${cls || ''}"></div>`;
  }
  // Shrink text until it fits its own box (the box is width-limited by CSS).
  function fit(node, min) {
    if (!node) return;
    node.style.fontSize = '';
    const base = parseFloat(getComputedStyle(node).fontSize) || 16;
    let f = 1;
    while (node.scrollWidth > node.clientWidth + 1 && f > (min || 0.5)) { f -= 0.05; node.style.fontSize = (base * f) + 'px'; }
  }
  // Best grid for n items in a w x h box, keeping tiles near the given aspect (w/h).
  function bestGrid(n, w, h, aspect) {
    let best = { cols: 1, rows: n, size: 0 };
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const tw = w / c, th = h / r;
      const size = Math.min(tw / aspect, th);
      if (size > best.size) best = { cols: c, rows: r, size, tw, th };
    }
    return best;
  }

  // ---------- sheet sections ----------
  // Settings are "Label | Value" rows at the top. Sections start at a header row (column A + B labels).
  function readSheet(rows, defs) {
    const out = { settings: {} };
    defs.forEach(d => out[d.key] = []);
    let cur = null;
    for (const r of rows) {
      const a = norm(r[0]), b = norm(r[1]);
      const hit = defs.find(d => a === d.a && b === d.b);
      if (hit) { cur = hit; continue; }
      if (!cur) { if (a && !a.startsWith('(')) out.settings[a] = (r[1] || '').trim(); continue; }
      if (!(r[0] || '').trim() && !(r[1] || '').trim() && !(r[2] || '').trim()) continue;
      if ((r[0] || '').trim().startsWith('(')) continue;
      out[cur.key].push(r.map(c => (c || '').trim()));
    }
    return out;
  }

  const DEFS = {
    rtyh: [{ key: 'hitlist', a: 'what counts as a hit', b: 'picture' }, { key: 'rippers', a: 'ripper', b: 'packs' }],
    types: [{ key: 'types', a: 'type', b: 'owner' }],
    case: [{ key: 'boxes', a: 'box', b: 'status' }, { key: 'spots', a: 'spot', b: 'owner' }, { key: 'hits', a: 'hit card', b: 'owner' }],
    hits: [{ key: 'hits', a: 'hit card', b: 'buyer' }],
  }[GAME];

  const LABELS = {
    rtyh: { game: 'RIP TILL YOU HIT', title: 'RTYH' },
    types: { game: 'PICK YOUR TYPE', title: 'COLOR HUNT' },
    case: { game: 'CASE BREAK', title: 'CASE BREAK' },
    hits: { game: 'WALL OF HITS', title: 'HIT WALL' },
  }[GAME];

  // ---------- page frame ----------
  document.body.classList.toggle('clean', CLEAN);
  document.body.classList.toggle('transparent', P.has('transparent'));
  const app = document.createElement('div');
  app.className = 'app ' + GAME;
  app.innerHTML = `
    <div class="stage">
      <header class="top"><h1 class="title gold"></h1><span class="tag"></span><span class="spacer"></span><span class="status"></span><span class="price"></span></header>
      <div class="strip"></div>
      <main class="main"></main>
    </div>
    <div class="splash"><div><div class="big gold"></div><div class="small">Starting soon</div></div></div>
    <div class="notice" hidden></div>
    <div class="toolbar">
      <span class="dot">Connecting</span>
      <button class="btn" data-act="smaller">A-</button><button class="btn" data-act="bigger">A+</button>
      <button class="btn" data-act="layout">Layout</button><button class="btn" data-act="full">Fullscreen</button>
    </div>`;
  document.body.appendChild(app);
  const main = $('.main', app);
  let scale = store.get('scale', 1);
  let layoutPref = P.get('layout') || store.get('layout', 'auto');

  function header(s) {
    $('.title', app).textContent = s.title || LABELS.title;
    $('.tag', app).textContent = s.game || LABELS.game;
    $('.price', app).textContent = s.price || s['price per pack'] || '';
    const st = $('.status', app);
    st.textContent = s.status || '';
    st.classList.toggle('hot', /rip|live|now|last|sold|hit/i.test(s.status || ''));
    $('.strip', app).textContent = s.banner || '';
    $('.splash .big', app).textContent = s.title || LABELS.title;
    document.title = [s.title || LABELS.title, s.game || LABELS.game].join(' - ');
  }

  // ---------- celebration ----------
  let partyTimer = null;
  function chime() {
    if (!P.has('sound')) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.12;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.start(t); o.stop(t + 0.4);
      });
    } catch (e) {}
  }
  function celebrate(card, who, pic, extra, seconds) {
    const old = $('.party', app); if (old) old.remove();
    clearTimeout(partyTimer);
    const d = document.createElement('div');
    d.className = 'party';
    const colors = ['#ffcc33', '#ff2b2b', '#2fe07f', '#2a7bf0', '#ffffff', '#8a4dff'];
    let conf = '';
    for (let i = 0; i < 70; i++) {
      conf += `<i class="confetti" style="left:${Math.random() * 100}vw;background:${colors[i % colors.length]};animation-duration:${2.5 + Math.random() * 3}s;animation-delay:${Math.random() * 1.2}s"></i>`;
    }
    d.innerHTML = conf + `<div class="pbox"><div class="phit">HIT!</div>${picUrl(pic) ? picHTML(pic, 'ppic') : ''}
      <div class="pcard gold">${esc(card)}</div><div class="pwho">${esc(who || '')}${extra ? ' &middot; ' + esc(extra) : ''}</div></div>`;
    app.appendChild(d);
    chime();
    partyTimer = setTimeout(() => d.remove(), Math.max(4, Number(seconds) || 10) * 1000);
  }

  // =====================================================================
  // RTYH
  // =====================================================================
  let rtyhPrev = null;
  function renderRTYH(data, animate) {
    const s = data.settings;
    const price = money(s['price per pack'] || s.price);
    const rippers = data.rippers.filter(r => r[0]).map(r => ({ who: r[0], packs: parseInt(r[1], 10) || 0, hit: r[2] || '', pic: r[3] || '' }));
    let cur = null;
    // the first ripper with no hit yet is ripping now; anyone after them is waiting in line (shop orders add to the line)
    for (let i = 0; i < rippers.length; i++) { if (!rippers[i].hit) { cur = rippers[i]; cur.i = i; break; } }
    const waiting = cur ? rippers.slice(cur.i + 1).filter(r => !r.hit) : [];
    const done = rippers.filter(r => r.hit);
    const avg = done.length ? done.reduce((a, r) => a + r.packs, 0) / done.length : 0;
    const lucky = done.slice().sort((a, b) => a.packs - b.packs)[0];
    const showSpend = yes(s['show spend']);

    // new hit? (a row that had no hit card now has one)
    if (animate && rtyhPrev) {
      rippers.forEach((r, i) => {
        const p = rtyhPrev[i];
        if (r.hit && p && p.who === r.who && !p.hit) celebrate(r.hit, r.who, r.pic, r.packs ? 'in ' + r.packs + (r.packs === 1 ? ' pack' : ' packs') : '', s['celebrate seconds']);
      });
    }
    const packsBumped = animate && cur && rtyhPrev && rtyhPrev[cur.i] && rtyhPrev[cur.i].who === cur.who && rtyhPrev[cur.i].packs !== cur.packs;
    rtyhPrev = rippers;

    const thumbs = data.hitlist.map(h => picUrl(h[1])).filter(Boolean).slice(0, 4);
    const rule = s['hit rule'] || data.hitlist.map(h => h[0]).filter(Boolean).join(' / ') || 'Set the hit rule in the sheet';
    const hist = rippers.slice().reverse().filter(r => r !== cur && waiting.indexOf(r) < 0).slice(0, 8);
    main.innerHTML = `
      <div class="card"><div class="cardhead">${cur ? 'Ripping now' : 'Next ripper up'}</div>
        <div class="cardbody">
          <div class="now ${cur ? '' : 'idle'}">
            <div class="who fit">${esc(cur ? cur.who : 'Buy a pack to start')}</div>
            ${cur ? `<div class="packlbl">Pack</div><div class="packs${packsBumped ? ' bump' : ''}">${cur.packs || 1}</div>
              ${showSpend && price != null ? `<div class="spend">${fmtMoney((cur.packs || 1) * price)} so far</div>` : ''}` : (s.product ? `<div class="packlbl">${esc(s.product)}</div>` : '')}
          </div>
          ${waiting.length ? `<div class="upnext fit">Up next: ${waiting.slice(0, 3).map(r => esc(r.who)).join(', ')}${waiting.length > 3 ? ' +' + (waiting.length - 3) : ''}</div>` : ''}
          <div class="hitrule"><div class="lbl">HIT =</div><div class="rule">${esc(rule)}</div>
            <div class="thumbs">${thumbs.map(u => `<img src="${esc(u)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">`).join('')}</div></div>
        </div></div>
      <div class="card"><div class="cardhead gold-bg">Hit board</div>
        <div class="cardbody">
          <div class="stats">
            <div class="stat"><b>${done.length}</b><span>Hits</span></div>
            <div class="stat"><b>${done.length ? (Math.round(avg * 10) / 10) : '-'}</b><span>Avg packs</span></div>
            <div class="stat"><b>${lucky ? lucky.packs : '-'}</b><span class="fit">${lucky ? 'Luckiest: ' + esc(lucky.who) : 'Luckiest'}</span></div>
          </div>
          <div class="hist">${hist.length ? hist.map(r => `
            <div class="hrow ${r.hit ? 'hit' : ''}"><div class="n"><div class="fit">${esc(r.who)}</div><small>${esc(r.hit || 'no hit yet')}</small></div>
            <div class="p">${r.packs} PK</div></div>`).join('') : '<div class="muted" style="text-align:center;font-size:calc(3.4*var(--u))">Hits show up here</div>'}</div>
        </div></div>`;
    main.querySelectorAll('.fit').forEach(n => fit(n));
  }

  // =====================================================================
  // PICK YOUR TYPE / COLOR
  // =====================================================================
  const TYPE_COLORS = {
    grass: ['#35b24a', '#fff'], fire: ['#ff5a2c', '#fff'], water: ['#2f8fff', '#fff'], lightning: ['#ffd21f', '#000'], electric: ['#ffd21f', '#000'],
    psychic: ['#b05cff', '#fff'], fighting: ['#c9763a', '#fff'], darkness: ['#474c6b', '#fff'], dark: ['#474c6b', '#fff'], metal: ['#9aa7b5', '#000'], steel: ['#9aa7b5', '#000'],
    dragon: ['#c9a227', '#000'], colorless: ['#e8e8e8', '#000'], normal: ['#e8e8e8', '#000'], fairy: ['#ff7fc8', '#000'], trainer: ['#8a8a8a', '#fff'],
    red: ['#e8262b', '#fff'], green: ['#1fa84a', '#fff'], blue: ['#2573e8', '#fff'], purple: ['#8a4dff', '#fff'], black: ['#3a3a3a', '#fff'], yellow: ['#ffd400', '#000'],
    orange: ['#ff8a1f', '#000'], pink: ['#ff4fa3', '#000'], white: ['#f2f2f2', '#000'], gold: ['#ffcc33', '#000'], silver: ['#c0c6cc', '#000'], multicolor: ['#ff8a1f', '#000'],
  };
  function typeColor(name, given) {
    const g = String(given || '').trim();
    if (/^#?[0-9a-f]{6}$/i.test(g)) { const hex = g.startsWith('#') ? g : '#' + g; const n = parseInt(hex.slice(1), 16); const lum = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)); return [hex, lum > 150 ? '#000' : '#fff']; }
    return TYPE_COLORS[norm(g)] || TYPE_COLORS[norm(name)] || TYPE_COLORS[norm(name).split(' ')[0]] || ['#777', '#fff'];
  }
  let typesPrev = {};
  function renderTypes(data, animate) {
    const s = data.settings;
    const types = data.types.filter(r => r[0]).slice(0, 24).map(r => ({ name: r[0], owner: r[1], color: typeColor(r[0], r[2]), hits: r[3] }));
    const taken = types.filter(t => t.owner).length;
    if (!s.status && types.length) $('.status', app).textContent = taken + '/' + types.length + ' TAKEN';
    main.innerHTML = `<div class="tgrid"></div>`;
    const grid = $('.tgrid', main);
    const g = bestGrid(Math.max(1, types.length), grid.clientWidth || innerWidth, grid.clientHeight || innerHeight * .7, 1.5);
    grid.style.gridTemplateColumns = `repeat(${g.cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${g.rows}, 1fr)`;
    grid.style.setProperty('--tfs', Math.max(12, Math.min(g.tw / 6.2, g.th / 3.6)) * scale + 'px');
    grid.innerHTML = types.map(t => `
      <div class="tile ${t.owner ? 'sold' : 'open'}${t.hits ? ' has-hits' : ''}${animate && t.owner && typesPrev[t.name] !== t.owner ? ' pop' : ''}" style="--c:${t.color[0]};--ink:${t.color[1]}">
        ${t.hits ? `<div class="thits">${esc(t.hits)}</div>` : ''}
        <div class="tname fit">${esc(t.name)}</div><div class="towner fit">${esc(t.owner || 'OPEN')}</div></div>`).join('') ||
      '<div class="muted" style="font-size:calc(4*var(--u))">Add types in the sheet</div>';
    typesPrev = Object.fromEntries(types.map(t => [t.name, t.owner]));
    grid.querySelectorAll('.fit').forEach(n => fit(n, 0.45));
  }

  // =====================================================================
  // CASE BREAK
  // =====================================================================
  let casePrevHits = null;
  function renderCase(data, animate) {
    const s = data.settings;
    const boxes = data.boxes.filter(r => r[0]).slice(0, 24).map(r => ({ name: r[0], status: norm(r[1]), hits: r[2] }));
    const spots = data.spots.filter(r => r[0]).slice(0, MAX_SPOTS).map(r => ({ n: r[0], owner: r[1] }));
    const hits = data.hits.filter(r => r[0]);
    const doneN = boxes.filter(b => /done|finish|opened|ripped|complete/.test(b.status)).length;
    const ripping = boxes.find(b => /rip|open(ing)?$|now|live/.test(b.status) && !/opened/.test(b.status));
    if (animate && casePrevHits != null && hits.length > casePrevHits) {
      const h = hits[hits.length - 1];
      celebrate(h[0], h[1], h[2], '', s['celebrate seconds']);
    }
    const newCount = casePrevHits == null ? 0 : Math.max(0, hits.length - casePrevHits);
    casePrevHits = hits.length;
    const filled = spots.filter(x => x.owner).length;
    main.innerHTML = `
      <div class="card c-spots"><div class="cardhead gold-bg">Spots ${filled}/${spots.length || 0}</div><div class="cardbody"><div class="slist"></div></div></div>
      <div class="card"><div class="cardhead">${esc(s.product || 'The case')}</div><div class="cardbody">
        <div class="bprog"><b>${ripping ? esc(ripping.name) : doneN + ' / ' + boxes.length}</b><span>${ripping ? 'Ripping now &middot; ' + doneN + ' of ' + boxes.length + ' done' : 'Boxes opened'}</span></div>
        <div class="bgrid"></div></div></div>
      <div class="card"><div class="cardhead">Hits</div><div class="cardbody"><div class="feed">${hits.slice().reverse().slice(0, 6).map((h, i) => `
        <div class="fitem${i < newCount ? ' new' : ''}">${picHTML(h[2], 'fpic')}<div><div class="fcard">${esc(h[0])}</div><div class="fwho">${esc(h[1] || '')}</div></div></div>`).join('') ||
        '<div class="muted" style="text-align:center;font-size:calc(3.4*var(--u))">Hits show up here</div>'}</div></div></div>`;
    // spots
    const sl = $('.slist', main);
    const cols = spots.length > 12 && !app.classList.contains('tall') ? 2 : 1;
    const rows = Math.max(1, Math.ceil(spots.length / cols));
    sl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    sl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    const rh = (sl.clientHeight || 600) / rows, cw = (sl.clientWidth || 300) / cols;
    sl.style.setProperty('--sfs', Math.max(10, Math.min(rh * 0.55, cw / 6)) * scale + 'px');
    sl.innerHTML = spots.map(x => `<div class="srow2 ${x.owner ? 'filled' : ''}"><span class="num">${esc(x.n)}</span><span class="nm">${esc(x.owner || 'OPEN')}</span></div>`).join('');
    // boxes
    const bg = $('.bgrid', main);
    const g = bestGrid(Math.max(1, boxes.length), bg.clientWidth || 400, bg.clientHeight || 300, 1.2);
    bg.style.gridTemplateColumns = `repeat(${g.cols}, 1fr)`;
    bg.style.gridTemplateRows = `repeat(${g.rows}, 1fr)`;
    bg.style.setProperty('--bfs', Math.max(10, Math.min(g.tw / 4, g.th / 2.4)) * scale + 'px');
    bg.innerHTML = boxes.map(b => {
      const st = /done|finish|opened|ripped|complete/.test(b.status) ? 'done' : (b === ripping ? 'ripping' : '');
      return `<div class="box ${st}"><div class="bn">${esc(b.name)}</div><div class="bs">${st === 'done' ? (b.hits ? esc(b.hits) + ' hits' : 'done') : st ? 'ripping' : 'sealed'}</div></div>`;
    }).join('');
  }

  // =====================================================================
  // WALL OF HITS
  // =====================================================================
  let wallPrev = null, spotIdx = 0, spotTimer = null, wallData = null;
  function renderHits(data, animate) {
    const s = data.settings;
    const hits = data.hits.filter(r => r[0]).map(r => ({ card: r[0], who: r[1], pic: r[2], game: r[3], note: r[4] })).reverse();   // newest first
    if (animate && wallPrev != null && hits.length > wallPrev) celebrate(hits[0].card, hits[0].who, hits[0].pic, hits[0].game, s['celebrate seconds']);
    if (wallPrev == null || hits.length !== wallPrev) spotIdx = 0;
    wallPrev = hits.length;
    wallData = { hits, s };
    if (!$('.spot', main)) {
      main.innerHTML = `<div class="card"><div class="cardhead">Latest hit</div><div class="cardbody"><div class="spot"></div></div></div>
        <div class="card"><div class="cardhead gold-bg">Hit wall</div><div class="cardbody"><div class="wgrid"></div></div></div>`;
    }
    drawSpot();
    const rot = Math.max(0, Number(s['rotate seconds']) || 0);
    clearInterval(spotTimer);
    if (rot && hits.length > 1) spotTimer = setInterval(() => { spotIdx = (spotIdx + 1) % Math.min(hits.length, 6); drawSpot(); }, rot * 1000);
  }
  function drawSpot() {
    const { hits } = wallData;
    const h = hits[spotIdx];
    const spot = $('.spot', main);
    spot.classList.remove('swap'); void spot.offsetWidth; spot.classList.add('swap');
    spot.innerHTML = h ? `${picHTML(h.pic)}<div class="scard gold">${esc(h.card)}</div><div class="swho fit">${esc(h.who || '')}</div>${h.game || h.note ? `<div class="snote">${esc([h.game, h.note].filter(Boolean).join(' &middot; '))}</div>` : ''}`
      : '<div class="muted" style="margin:auto;font-size:calc(5*var(--u))">No hits yet</div>';
    spot.querySelectorAll('.fit').forEach(n => fit(n));
    const wg = $('.wgrid', main);
    const rest = hits.slice(0, 10).filter((x, i) => i !== spotIdx).slice(0, 9);
    wg.innerHTML = rest.map(x => `<div class="witem">${picHTML(x.pic)}<div class="wc fit">${esc(x.card)}</div><div class="wn fit">${esc(x.who || '')}</div></div>`).join('');
    wg.querySelectorAll('.fit').forEach(n => fit(n, 0.6));
  }

  const RENDER = { rtyh: renderRTYH, types: renderTypes, case: renderCase, hits: renderHits }[GAME];

  // ---------- data loop ----------
  let data = store.get('last', null), lastJSON = data ? JSON.stringify(data) : '', liveOnce = false, fails = 0, timer = null, busy = false;
  const dot = $('.dot', app), notice = $('.notice', app);
  function status(kind, text, msg) { dot.className = 'dot ' + kind; dot.textContent = text; notice.hidden = !msg; if (msg) notice.innerHTML = msg; }
  function draw(animate) {
    if (!data) return;
    header(data.settings);
    RENDER(data, animate);
    $('.splash', app).classList.add('gone');
  }
  async function pickTab() {
    if (P.get('tab')) return P.get('tab');
    const map = await S.loadTabs(false);
    if (map[norm(TAB)]) return map[norm(TAB)].name;
    return map.__order[0];
  }
  async function tick() {
    if (busy) return; busy = true;
    try {
      if (!S.SHEET_ID) { status('err', 'No sheet', 'This board has no Google Sheet yet. Add its ID to <b>gameSheets.' + GAME + '</b> in assets/config.js, or add <b>?sheet=</b> and the sheet link to this address.'); fails++; return; }
      let tab;
      try { tab = await pickTab(); }
      catch (e) { status('err', 'Check the sheet', e.message === 'private' ? 'Can\'t read the Google Sheet. Share it as <b>Anyone with the link: Viewer</b>.' : 'Can\'t reach Google right now. Retrying.'); fails++; return; }
      const r = await S.readTab(tab);
      if (!r.ok) { status(r.reason === 'offline' ? 'warn' : 'err', 'Check the sheet', r.reason === 'notab' ? 'No tab named <b>' + esc(tab) + '</b>.' : r.reason === 'private' ? 'Share the sheet as <b>Anyone with the link: Viewer</b>.' : 'Can\'t reach Google right now. Retrying.'); fails++; return; }
      const next = readSheet(r.rows, DEFS);
      const json = JSON.stringify(next);
      if (json !== lastJSON) {
        const first = !liveOnce;   // never celebrate on the first read after the page opens
        data = next; lastJSON = json; store.set('last', data);
        draw(!first);
      }
      liveOnce = true;
      fails = 0;
      status('ok', 'Live: ' + tab, '');
    } catch (e) {
      fails++; status('warn', 'Reconnecting', 'Can\'t reach Google right now. Retrying.');
    } finally {
      busy = false;
      clearTimeout(timer);
      timer = setTimeout(tick, fails ? Math.min(20000, POLL * (1 + fails)) : POLL);
    }
  }

  // ---------- layout + tools ----------
  function applyLayout() {
    const tall = layoutPref === 'tall' || (layoutPref === 'auto' && innerHeight > innerWidth * 1.05);
    app.classList.toggle('tall', tall);
    document.documentElement.style.setProperty('--scale', scale);
    if (data) requestAnimationFrame(() => RENDER(data, false));
  }
  addEventListener('resize', applyLayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => data && RENDER(data, false));
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'smaller' || a === 'bigger') { scale = Math.min(1.5, Math.max(.7, Math.round((scale + (a === 'bigger' ? .1 : -.1)) * 10) / 10)); store.set('scale', scale); applyLayout(); }
    if (a === 'layout') { layoutPref = { auto: 'wide', wide: 'tall', tall: 'auto' }[layoutPref] || 'auto'; store.set('layout', layoutPref); applyLayout(); }
    if (a === 'full') { if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
  });
  const tb = $('.toolbar', app); let idle;
  document.addEventListener('mousemove', () => { tb.classList.add('awake'); clearTimeout(idle); idle = setTimeout(() => tb.classList.remove('awake'), 2500); });

  applyLayout();
  if (data) { header(data.settings); requestAnimationFrame(() => draw(false)); }
  tick();
})();
