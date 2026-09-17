/* DON HUNT live board engine (v3, built for a TV behind the ripper, viewed on TikTok).
   Page sets <body data-type="auction|prefill|pack|custom">.

   Reads the DON_HUNT Google Sheet exactly as the team already runs it:
     board tab  (AUCTION / $10 / $30): column A = spot 1-24, B = owner, C = bid (or FREE), D = winner note
     chase tab  (AUCTION_CHASE / $10_CHASE / $30_CHASE): B1 = image link, B2 = chase name, B3 = chase value
   Optional rows anyone can add to a chase tab (label in A, value in B):
     Title, Subtitle, Price, Box, Banner, Status, Show Leader,
     Chase 2 Image URL / Chase 2 Name / Chase 2 Value (up to Chase 4)

   URL options:
     ?tab=9_13_26_AUC   show a different board tab      ?chase=MY_CHASE  different chase tab
     ?sheet=ID_or_link  use a different Google Sheet    ?clean=1  hide every button/message (OBS)
     ?layout=wide|tall  force a layout                  ?transparent=1  no background          */
(function () {
  const S = window.DonHuntSheet;
  const CFG = window.DONHUNT_CONFIG || {};
  const P = new URLSearchParams(location.search);
  const TYPE = document.body.dataset.type || 'auction';
  const AUCTION_TYPE = TYPE === 'auction' || TYPE === 'custom';
  const MAX_SPOTS = 24;
  const CLEAN = P.has('clean') && P.get('clean') !== '0';
  const POLL = Math.max(3, Number(CFG.pollSeconds) || 4) * 1000;
  const LS = 'donhunt3:' + TYPE + ':';
  const ROOT = new URL('..', document.currentScript.src).href;

  const DEFAULTS = {
    auction: { tab: 'AUCTION', chase: 'AUCTION_CHASE', subtitle: '$1 START', price: 'AUCTION', showLeader: true, showBids: true },
    prefill: { tab: '$10', chase: '$10_CHASE', subtitle: 'PRE-FILL', price: '$10 A SPOT', showLeader: false, showBids: false },
    pack:    { tab: '$30', chase: '$30_CHASE', subtitle: 'PACK RIP', price: '$30 A PACK', showLeader: false, showBids: false },
    custom:  { tab: 'AUCTION', chase: 'AUCTION_CHASE', subtitle: 'AUCTION', price: '', showLeader: true, showBids: true },
  }[TYPE];

  // ---------- helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(LS + k); } catch (e) {} },
  };
  const yes = v => /^(y|yes|true|on|1|show)$/i.test(String(v).trim());
  const no = v => /^(n|no|false|off|0|hide)$/i.test(String(v).trim());
  const isFree = v => /^\s*free\s*$/i.test(String(v || ''));
  function money(v) {
    if (isFree(v)) return null;
    const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }
  const fmtMoney = n => n == null ? '' : '$' + (Math.round(n * 100) % 100 === 0 ? n.toFixed(0) : n.toFixed(2));
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function imgUrl(v) {
    v = String(v || '').trim();
    if (!v) return '';
    const d = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=|thumbnail\?id=)([\w-]{10,})/);
    if (d) return 'https://drive.google.com/thumbnail?id=' + d[1] + '&sz=w1000';
    if (/^(https?:|data:)/i.test(v)) return v;
    try { return new URL(v.replace(/^\/+/, ''), ROOT).href; } catch (e) { return ''; }
  }

  // ---------- read the team's board tab ----------
  function parseBoard(rows) {
    const head = rows[0] || [];
    const looksRight = S.norm(head[1]) === 'owner' || rows.some(r => S.norm(r[1]) === 'owner');
    if (!looksRight) return null;
    const spots = {};
    rows.forEach(r => {
      const a = String(r[0] || '').trim();
      if (!/^\d+$/.test(a)) return;
      const n = +a;
      if (n < 1 || n > MAX_SPOTS || spots[n]) return;
      spots[n] = { owner: (r[1] || '').trim(), bid: (r[2] || '').trim(), note: (r[3] || '').trim() };
    });
    return spots;
  }

  // ---------- read the team's chase tab ----------
  function parseChase(rows) {
    const set = {};
    const chases = {};
    rows.slice(0, 40).forEach(r => {
      const k = S.norm(r[0]);
      const v = (r[1] || '').trim();
      if (!k || k.startsWith('how to')) return;
      let m = k.match(/^chase\s*(\d)?\s*(image url|image|picture|name|value|prize|psa cert|cert number|cert #|cert)$/);
      if (m) {
        const i = +(m[1] || 1);
        const f = /image|picture/.test(m[2]) ? 'image' : /cert/.test(m[2]) ? 'cert' : m[2] === 'name' ? 'name' : 'value';
        (chases[i] = chases[i] || {})[f] = v;
        return;
      }
      if (['title', 'subtitle', 'price', 'box', 'banner', 'status', 'show leader', 'show bids'].includes(k)) set[k] = v;
    });
    const list = Object.keys(chases).sort().map(i => chases[i]).filter(c => c.image || c.name || c.value || c.cert).slice(0, 4);
    return { settings: set, chases: list };
  }

  // ---------- what goes on screen ----------
  function resolve() {
    const s = Object.assign({}, chase ? chase.settings : {});
    const o = ovr;
    const pick = (k, d) => (o[k] != null && o[k] !== '') ? o[k] : (s[k] ? s[k] : d);
    const flag = (k, d) => (o[k] === true || o[k] === false) ? o[k] : yes(s[k] || '') ? true : no(s[k] || '') ? false : d;
    let count = parseInt(o.spots, 10);
    if (!(count >= 1)) count = MAX_SPOTS;
    count = Math.min(count, MAX_SPOTS);
    const src = manual ? store.get('manualSpots', {}) : (spots || {});
    const v = {
      title: pick('title', CFG.brand || 'DON HUNT'),
      subtitle: pick('subtitle', DEFAULTS.subtitle),
      price: pick('price', DEFAULTS.price),
      box: pick('box', ''),
      banner: pick('banner', ''),
      status: pick('status', ''),
      chases: chase ? chase.chases : [],
      showLeader: AUCTION_TYPE && flag('show leader', DEFAULTS.showLeader),
      showBids: AUCTION_TYPE && flag('show bids', DEFAULTS.showBids),
      count, spots: {},
    };
    for (let n = 1; n <= count; n++) v.spots[n] = Object.assign({ owner: '', bid: '', note: '' }, src[n]);
    return v;
  }

  // ---------- page ----------
  document.body.classList.toggle('clean', CLEAN);
  document.body.classList.toggle('transparent', P.has('transparent'));
  const app = el('div', 'app');
  app.innerHTML = `
    <div class="stage">
      <header class="top">
        <h1 class="title gold"></h1>
        <span class="tag sub"></span>
        <span class="spacer"></span>
        <span class="status"></span>
        <span class="price"></span>
      </header>
      <div class="banner"></div>
      <main class="grid">
        <section class="col spots left"></section>
        <section class="col center">
          <div class="card chase">
            <div class="chasehead">Chase</div>
            <div class="chaselist"></div>
            <div class="boxline"></div>
          </div>
          <div class="card leader" hidden>
            <div class="lbl">High Bid</div>
            <div class="bigmoney">$0</div>
            <div class="leadname none">No bids yet</div>
          </div>
          <div class="card fill" hidden>
            <div class="fillnum"><b>0</b><span>/24</span></div>
            <div class="bar"><i></i></div>
            <div class="openlbl"></div>
          </div>
        </section>
        <section class="col spots right"></section>
      </main>
    </div>
    <div class="splash"><div><div class="big gold"></div><div class="small">Next break starting soon</div></div></div>
    <div class="notice" hidden></div>
    <div class="toolbar">
      <span class="dot">Connecting</span>
      <button class="btn" data-act="smaller" title="Smaller text">A-</button>
      <button class="btn" data-act="bigger" title="Bigger text">A+</button>
      <button class="btn" data-act="layout">Layout</button>
      <button class="btn" data-act="full">Fullscreen</button>
      <button class="btn" data-act="panel">Settings</button>
    </div>
    <aside class="panel"></aside>`;
  document.body.appendChild(app);
  $('.splash .big', app).textContent = CFG.brand || 'DON HUNT';

  // ---------- state ----------
  let spots = store.get('lastSpots', null);
  let chase = store.get('lastChase', null);
  let ovr = TYPE === 'custom' ? store.get('ovr', {}) : {};
  let manual = TYPE === 'custom' ? store.get('manual', false) : false;
  let tabPick = TYPE === 'custom' ? store.get('tab', '') : '';
  let chasePick = TYPE === 'custom' ? store.get('chase', '') : '';
  const LIVE_KEY = S.boardKey(P.get('board') || TYPE);
  let liveRow = null;   // what the sheet's LIVE tab says for this board (if that tab exists)
  const boardTab = () => (P.get('tab') || tabPick || (liveRow && liveRow.tab) || DEFAULTS.tab).trim();
  const chaseTab = () => (P.get('chase') || chasePick || (liveRow && liveRow.chase) || DEFAULTS.chase).trim();
  let drawn = null, lastLeader = '', lastChaseKey = '';
  let scale = store.get('scale', 1);
  let layoutPref = P.get('layout') || store.get('layout', 'auto');

  // ---------- drawing ----------
  const setText = (node, t) => { if (node.textContent !== t) node.textContent = t; };

  function buildSpots(v) {
    const half = Math.ceil(v.count / 2);
    [['.spots.left', 1, half], ['.spots.right', half + 1, v.count]].forEach(([sel, a, b]) => {
      const col = $(sel, app);
      col.innerHTML = '';
      for (let n = a; n <= b; n++) {
        const row = el('div', 'srow'); row.dataset.n = n;
        const name = el('span', 'owner');
        const nameTxt = el('span', 'ntxt');
        name.appendChild(nameTxt);
        if (manual) { const i = el('input'); i.placeholder = 'open'; i.dataset.f = 'owner'; name.replaceChildren(i); }
        const bid = el('span', 'bid');
        if (manual && v.showBids) { const i = el('input', 'bidin'); i.placeholder = '$'; i.dataset.f = 'bid'; bid.appendChild(i); }
        row.append(el('span', 'num', String(n)), name, bid);
        col.appendChild(row);
      }
      for (let k = b - a + 1; k < half; k++) { const f = el('div', 'srow ghost'); col.appendChild(f); }
    });
  }

  // Shrink a name until it fits its box (long usernames stay whole and readable).
  function fit(node) {
    node.style.fontSize = '';
    if (!node.parentElement) return;
    const max = node.parentElement.clientWidth;
    if (!max) return;
    let f = 1;
    while (node.scrollWidth > max && f > 0.55) { f -= 0.05; node.style.fontSize = f + 'em'; }
  }

  function sizeAll() {
    const col = $('.spots.left', app);
    const rows = Math.ceil((drawn ? drawn.count : 24) / 2);
    const gap = 6;
    const h = (col.clientHeight || window.innerHeight * .8) - gap * (rows - 1);
    const fs = Math.max(12, Math.min(h / rows * 0.56, col.clientWidth / 7.5));
    app.style.setProperty('--rowfs', fs.toFixed(1) + 'px');
    app.querySelectorAll('.ntxt').forEach(fit);
  }


  // ---------- PSA cert lookup ----------
  // Put a PSA cert number (or a psacard.com/cert/... link) in a chase's image or cert cell and the board
  // shows PSA's own photo of that slab. Needs a PSA Public API token saved on this computer (Settings).
  // Every cert is looked up once and remembered, so PSA's 100-calls-a-day limit is never an issue.
  const PSA_API = 'https://api.psacard.com/publicapi/cert/';
  const psaKey = 'donhunt-psa:';
  const psaMem = {};
  let psaPausedUntil = 0, psaMsg = '';
  const psaToken = {
    get() { try { return localStorage.getItem('donhunt-psa-token') || ''; } catch (e) { return ''; } },
    set(v) { try { v ? localStorage.setItem('donhunt-psa-token', v) : localStorage.removeItem('donhunt-psa-token'); } catch (e) {} },
  };
  if (P.get('psa')) {   // ?psa=TOKEN once, then it's saved and removed from the address
    psaToken.set(P.get('psa').trim());
    const u = new URL(location.href); u.searchParams.delete('psa'); history.replaceState(null, '', u.href);
  }
  function certFrom(c) {
    const cands = [c.cert, c.image];
    for (const v of cands) {
      const t = String(v || '').trim();
      let m = t.match(/psacard\.com\/cert\/(\d{6,10})/i);
      if (m) return m[1];
      m = t.match(/^(?:psa\s*#?\s*)?(\d{6,10})$/i);
      if (m) return m[1];
    }
    return '';
  }
  function psaGet(cert) {
    if (psaMem[cert]) return psaMem[cert];
    try { const v = JSON.parse(localStorage.getItem(psaKey + cert) || 'null'); if (v && v.front) return (psaMem[cert] = v); } catch (e) {}
    return null;
  }
  const psaBusy = {}, psaFailAt = {};
  const picIssues = [];
  function showPicIssues() { if (picIssues.length) status('warn', 'Picture problem', picIssues.map(esc).join('<br>')); }
  async function psaLookup(cert, needLabel) {
    if (psaGet(cert) || psaBusy[cert]) return;
    if (Date.now() < psaPausedUntil || Date.now() - (psaFailAt[cert] || 0) < 120e3) return;
    const token = psaToken.get();
    const proxy = String(CFG.psaProxy || '').trim();
    if (!token && !proxy) { psaMsg = 'A chase has PSA cert ' + cert + ', but no PSA helper is set up (assets/config.js psaProxy).'; return; }
    psaBusy[cert] = true;
    try {
      let val;
      if (proxy && !token) {
        // The shared helper script holds the PSA token, so nobody has to set anything up on this computer.
        const r = await fetch(proxy + (proxy.includes('?') ? '&' : '?') + 'cert=' + encodeURIComponent(cert), { cache: 'no-store' });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'PSA helper could not find that cert.');
        val = { front: j.front, back: j.back || '', label: j.label || '', at: Date.now() };
      } else {
        const call = path => fetch(PSA_API + path + encodeURIComponent(cert), { headers: { Authorization: 'bearer ' + token }, cache: 'no-store' })
          .then(async r => {
            if (r.status === 429) { psaPausedUntil = Date.now() + 3600e3; throw new Error('PSA daily limit reached, trying again in an hour.'); }
            if (r.status === 401 || r.status === 403) { psaPausedUntil = Date.now() + 600e3; throw new Error('PSA rejected the token. Check it in Settings.'); }
            if (!r.ok) throw new Error('PSA lookup failed (' + r.status + ').');
            return r.json();
          });
        const imgs = await call('GetImagesByCertNumber/');
        const list = Array.isArray(imgs) ? imgs : (imgs && (imgs.Images || imgs.images)) || [];
        const pick = f => (list.find(i => (i.IsFrontImage ?? i.isFrontImage) === f) || {});
        const url = i => i.ImageURL || i.ImageUrl || i.imageURL || i.imageUrl || i.url || '';
        const front = url(pick(true)) || url(list[0] || {});
        let label = '';
        if (needLabel) {
          try {
            const info = await call('GetByCertNumber/');
            const c = (info && (info.PSACert || info.psaCert)) || {};
            const grade = c.CardGrade || c.GradeDescription || '';
            label = [c.Subject, grade ? 'PSA ' + String(grade).replace(/^PSA\s*/i, '') : ''].filter(Boolean).join(' ');
          } catch (e) {}
        }
        if (!front) throw new Error('PSA has no photos for cert ' + cert + ' yet.');
        val = { front, back: url(pick(false)), label, at: Date.now() };
      }
      psaMem[cert] = val;
      try { localStorage.setItem(psaKey + cert, JSON.stringify(val)); } catch (e) {}
      psaMsg = '';
      render(false);
    } catch (e) {
      psaFailAt[cert] = Date.now();
      psaMsg = String(e.message || e);
    } finally { psaBusy[cert] = false; }
  }

  function drawChases(v) {
    const IMG = window.DonHuntImages;
    const issues = [];
    const shown = v.chases.map((c, i) => {
      const label = 'Chase' + (i ? ' ' + (i + 1) : '') + ' picture';
      const fixed = IMG.fixImageLink(c.cert || c.image);
      const cert = fixed.kind === 'cert' ? fixed.cert : '';
      if (cert) {
        const got = psaGet(cert);
        if (!got) {
          psaLookup(cert, !c.name);
          const alt = c.cert ? IMG.fixImageLink(c.image) : { url: '' };   // a picture link next to a separate cert row still shows
          return Object.assign({}, c, { image: alt.kind === 'cert' ? '' : alt.url });
        }
        return Object.assign({}, c, { image: got.front, name: c.name || got.label });
      }
      if (fixed.kind === 'page') issues.push(label + ' is a web page, not a picture. Use the Picture Link Maker (home page) to get the picture link.');
      if (fixed.kind === 'text') issues.push(label + ' isn\'t a link. Paste the picture link as plain text (Cmd+Shift+V) and don\'t use =IMAGE or pasted-in pictures.');
      return Object.assign({}, c, { image: fixed.url });
    });
    const key = JSON.stringify(shown);
    const list = $('.chaselist', app);
    if (list.dataset.key === key) return;
    picIssues.splice(0, picIssues.length, ...issues);
    const changed = list.dataset.key != null && list.dataset.key !== key;
    list.dataset.key = key;
    list.className = 'chaselist n' + Math.max(1, shown.length);
    list.innerHTML = '';
    if (!shown.length) { list.appendChild(el('div', 'nochase', 'Chase coming up')); return; }
    shown.forEach(c => {
      const item = el('div', 'chaseitem');
      const src = c.image;
      if (src) {
        const wrap = el('div', 'cimg');
        const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer';
        im.onerror = () => { wrap.remove(); picIssues.push('A chase picture link won\'t load (' + src.slice(0, 60) + '). Check it in the Picture Link Maker.'); showPicIssues(); };
        im.src = src; wrap.appendChild(im); item.appendChild(wrap);
      }
      const t = el('div', 'ctext');
      if (c.name) t.appendChild(el('div', 'cname', c.name));
      if (c.value) t.appendChild(el('div', 'cvalue gold', c.value));
      item.appendChild(t);
      list.appendChild(item);
    });
    if (changed) { const card = $('.chase', app); card.classList.remove('reveal'); void card.offsetWidth; card.classList.add('reveal'); }
  }

  function draw(v, animate) {
    const structKey = [v.count, v.showBids, manual].join('|');
    if (!drawn || drawn.structKey !== structKey) buildSpots(v);
    drawn = Object.assign({}, v, { structKey });
    app.classList.toggle('no-bid', !v.showBids);
    setText($('.title', app), v.title);
    setText($('.sub', app), v.subtitle);
    setText($('.price', app), v.price);
    const st = $('.status', app);
    setText(st, v.status);
    setText($('.banner', app), v.banner);
    setText($('.boxline', app), v.box ? 'Pulling from ' + v.box : '');
    document.title = [v.title, v.subtitle].filter(Boolean).join(' - ');
    drawChases(v);

    let filled = 0, lead = null;
    for (let n = 1; n <= v.count; n++) {
      const s = v.spots[n];
      if (s.owner) filled++;
      const b = v.showBids ? money(s.bid) : null;
      if (b != null && b > 0 && (!lead || b > lead.bid)) lead = { n, bid: b, owner: s.owner || ('Spot ' + n) };
    }

    app.querySelectorAll('.srow[data-n]').forEach(row => {
      const n = +row.dataset.n, s = v.spots[n];
      const sig = [s.owner, s.bid, s.note].join('|');
      const prev = row.dataset.sig;
      const name = $('.owner', row), bid = $('.bid', row);
      if (manual) {
        const oi = $('input[data-f=owner]', row), bi = $('input[data-f=bid]', row);
        if (oi && document.activeElement !== oi) oi.value = s.owner;
        if (bi && document.activeElement !== bi) bi.value = s.bid;
      } else if (prev !== sig) {
        const t = $('.ntxt', name);
        t.textContent = s.owner || 'OPEN';
        const free = isFree(s.bid);
        bid.textContent = '';
        if (free) bid.appendChild(el('span', 'pill free', 'FREE'));
        else if (v.showBids && s.bid) { const m = money(s.bid); bid.textContent = m != null ? fmtMoney(m) : s.bid; }
        if (s.note) bid.appendChild(el('span', 'pill win', /win/i.test(s.note) ? 'WINNER' : s.note.slice(0, 10)));
        row.classList.toggle('has-pill', free || !!s.note);
        fit(t);
      }
      if (animate && prev != null && prev !== sig && s.owner) { row.classList.remove('pop'); void row.offsetWidth; row.classList.add('pop'); }
      row.dataset.sig = sig;
      row.classList.toggle('filled', !!s.owner);
      row.classList.toggle('lead', !!(v.showLeader && lead && lead.n === n));
    });

    const lc = $('.leader', app);
    lc.hidden = !v.showLeader;
    if (v.showLeader) {
      setText($('.bigmoney', lc), lead ? fmtMoney(lead.bid) : '$0');
      const ln = $('.leadname', lc);
      setText(ln, lead ? lead.owner : 'No bids yet');
      ln.classList.toggle('none', !lead);
      fit(ln);
      const lk = lead ? lead.n + ':' + lead.bid : '';
      if (animate && lk && lk !== lastLeader) { lc.classList.remove('bump'); void lc.offsetWidth; lc.classList.add('bump'); }
      lastLeader = lk;
    }

    const fc = $('.fill', app);
    fc.hidden = v.showLeader;
    if (!v.showLeader) {
      setText($('.fillnum b', fc), String(filled));
      setText($('.fillnum span', fc), '/' + v.count);
      $('.bar > i', fc).style.width = (v.count ? filled / v.count * 100 : 0) + '%';
      const open = v.count - filled;
      const ol = $('.openlbl', fc);
      setText(ol, open <= 0 ? 'FULL! RIPPING SOON' : open + ' OPEN');
      ol.classList.toggle('sold', open <= 0);
    }
    sizeAll();
  }

  function render(animate) {
    draw(resolve(), animate);
    if (spots || chase || manual) $('.splash', app).classList.add('gone');
  }

  // ---------- layout ----------
  function applyLayout() {
    const tall = layoutPref === 'tall' || (layoutPref === 'auto' && window.innerHeight > window.innerWidth * 1.05);
    app.classList.toggle('tall', tall);
    document.documentElement.style.setProperty('--scale', scale);
    if (drawn) requestAnimationFrame(sizeAll);
  }
  window.addEventListener('resize', applyLayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawn && sizeAll());

  // ---------- host messages (hidden with ?clean=1) ----------
  const dot = $('.dot', app), notice = $('.notice', app);
  function status(kind, text, msg) {
    dot.className = 'dot ' + kind; dot.textContent = text;
    notice.hidden = !msg; if (msg) notice.innerHTML = msg;
  }
  function explain(reason, tab) {
    const keep = (spots || chase) ? ' The board is still showing the last good info.' : '';
    switch (reason) {
      case 'nosheet': return 'No Google Sheet connected. Add the sheet ID in <b>assets/config.js</b> or add <b>?sheet=</b> and the link to this address.';
      case 'private': return 'Can\'t read the Google Sheet. In the sheet, click <b>Share</b> and set General access to <b>Anyone with the link: Viewer</b>.' + keep;
      case 'offline': return 'Can\'t reach Google right now. Retrying on its own.' + keep;
      case 'notab': return 'There\'s no tab named <b>' + esc(tab) + '</b> in the sheet (spelling and spaces count).' + keep;
      case 'notboard': return 'The tab <b>' + esc(tab) + '</b> doesn\'t look like a board (row 1 should read Pack / Owner / Bid).' + keep;
      default: return 'Something went wrong reading the sheet. Retrying.' + keep;
    }
  }

  // ---------- sync ----------
  let fails = 0, timer = null, busy = false;
  async function tick() {
    if (busy) return; busy = true;
    try {
      if (!S.SHEET_ID) { status('err', 'No sheet', explain('nosheet')); fails++; return; }
      if (!P.get('tab') || !P.get('chase')) {
        const lv = await S.readLive();
        liveRow = lv.ok ? (lv.boards[LIVE_KEY] || null) : (lv.reason === 'notab' ? null : liveRow);
      }
      const bt = boardTab(), ct = chaseTab();
      const [rb, rc] = await Promise.all([
        manual ? Promise.resolve(null) : S.readTab(bt),
        ct ? S.readTab(ct) : Promise.resolve(null),
      ]);
      let problem = null, changed = false;
      if (rb) {
        if (!rb.ok) problem = [rb.reason, bt];
        else {
          const p = parseBoard(rb.rows);
          if (!p) problem = ['notboard', bt];
          else if (JSON.stringify(p) !== JSON.stringify(spots)) { spots = p; store.set('lastSpots', spots); changed = true; }
        }
      }
      if (rc) {
        if (!rc.ok) { if (!problem) problem = [rc.reason, ct]; }
        else {
          const c = parseChase(rc.rows);
          if (JSON.stringify(c) !== JSON.stringify(chase)) { chase = c; store.set('lastChase', chase); changed = true; }
        }
      }
      if (changed || !drawn) render(true);
      if (problem) {
        fails++;
        status(problem[0] === 'offline' ? 'warn' : 'err', problem[0] === 'offline' ? 'Reconnecting' : 'Check the sheet', explain(problem[0], problem[1]));
      } else {
        fails = 0;
        if (picIssues.length) { status('warn', 'Picture problem', picIssues.map(esc).join('<br>')); return; }
        if (psaMsg) { status('warn', 'PSA photo', psaMsg); return; }
        status('ok', manual ? 'Typing on board + ' + ct : 'Live: ' + bt + (ct ? ' + ' + ct : ''), '');
      }
    } catch (e) {
      fails++;
      status('warn', 'Reconnecting', explain('offline'));
    } finally {
      busy = false;
      clearTimeout(timer);
      timer = setTimeout(tick, fails ? Math.min(20000, POLL * (1 + fails)) : POLL);
    }
  }

  // ---------- settings panel ----------
  const panel = $('.panel', app);
  function panelHTML() {
    const custom = TYPE === 'custom';
    const f = (k, label, ph) => `<label>${label}</label><input type="text" data-o="${k}" placeholder="${esc(ph || 'default')}" value="${esc(ovr[k] || '')}">`;
    const tri = (k, label) => {
      const v = ovr[k] === true ? 'yes' : ovr[k] === false ? 'no' : '';
      return `<label>${label}</label><select data-t="${k}"><option value="">Default</option><option value="yes"${v === 'yes' ? ' selected' : ''}>Show</option><option value="no"${v === 'no' ? ' selected' : ''}>Hide</option></select>`;
    };
    return `
      <button class="btn close" data-act="panel">Close</button>
      <h3>Board settings</h3>
      <div class="hint">Reading <b class="pi-live"></b></div>
      ${custom ? `
      <h4>Which tabs</h4>
      <label>Spots tab</label><select class="tabsel" data-k="tab"><option value="">AUCTION (default)</option></select>
      <label>Chase tab</label><select class="tabsel" data-k="chase"><option value="">AUCTION_CHASE (default)</option></select>
      <h4>Adjust this auction</h4>
      <div class="hint">Leave a box empty to use the default.</div>
      ${f('title', 'Title', CFG.brand || 'DON HUNT')}${f('subtitle', 'Red tag', DEFAULTS.subtitle)}${f('price', 'Gold price tag')}
      <label>Number of spots (1 to 24)</label><input type="number" min="1" max="24" data-o="spots" placeholder="24" value="${esc(ovr.spots || '')}">
      ${f('box', 'Pulling from (box)')}${f('banner', 'Yellow banner')}${f('status', 'Status tag', 'OPEN, RIPPING NOW...')}
      ${tri('show leader', 'High bid leader')}${tri('show bids', 'Bid amounts on spots')}
      <div class="chk"><input type="checkbox" class="manual" ${manual ? 'checked' : ''}><span>Type names on the board instead of using the sheet</span></div>
      <div class="row2"><button class="btn" data-act="reset">Reset</button><button class="btn" data-act="clearmanual">Clear typed names</button></div>` : `
      <div class="hint">This board always shows the <b>${esc(DEFAULTS.tab)}</b> and <b>${esc(DEFAULTS.chase)}</b> tabs, same as the team already fills them in. To show an old tab, add <b>?tab=</b> and its name to the address.</div>`}
      <h4>PSA slab photos</h4>
      <div class="hint">Put a PSA cert number (or psacard.com/cert link) in a chase tab's picture cell and the board shows PSA's own photo. This works automatically through the shared PSA helper. Only paste a token here to override the helper on this one computer.</div>
      <label>PSA API token (optional override)</label><input type="password" class="psatok" placeholder="paste token" value="${esc(psaToken.get())}">
      <div class="row2"><button class="btn" data-act="psasave">Save token</button><button class="btn" data-act="psaclear">Forget cached photos</button></div>
      <div class="hint psastat"></div>
      <h4>Screen</h4>
      <div class="row2"><button class="btn" data-act="smaller">Text -</button><button class="btn" data-act="bigger">Text +</button><button class="btn" data-act="layout">Layout: <span class="pi-layout"></span></button></div>
      <h4>OBS / stream link</h4>
      <div class="hint">Use this as a Browser Source. It hides every button and message.</div>
      <input type="text" class="obs" readonly>
      <div class="row2"><button class="btn" data-act="copy">Copy link</button></div>`;
  }
  function refreshPanelInfo() {
    const li = $('.pi-live', panel); if (li) li.textContent = (manual ? 'typed names' : boardTab()) + ' + ' + chaseTab();
    const lo = $('.pi-layout', panel); if (lo) lo.textContent = layoutPref;
    const u = new URL(location.href); u.searchParams.set('clean', '1'); const o = $('.obs', panel); if (o) o.value = u.href;
  }
  async function openPanel() {
    panel.innerHTML = panelHTML();
    panel.classList.add('open');
    refreshPanelInfo();
    if (TYPE !== 'custom' || !S.SHEET_ID) return;
    try {
      const map = await S.loadTabs(true);
      panel.querySelectorAll('.tabsel').forEach(sel => {
        const want = sel.dataset.k === 'tab' ? tabPick : chasePick;
        map.__order.filter(n => sel.dataset.k === 'chase' ? /chase/i.test(n) : !/chase|readme/i.test(n)).forEach(n => {
          const o = el('option', '', n); o.value = n; if (n === want) o.selected = true; sel.appendChild(o);
        });
      });
    } catch (e) {}
  }
  panel.addEventListener('change', e => {
    const t = e.target;
    if (t.classList.contains('tabsel')) {
      if (t.dataset.k === 'tab') { tabPick = t.value; store.set('tab', tabPick); spots = null; }
      else { chasePick = t.value; store.set('chase', chasePick); chase = null; }
      refreshPanelInfo(); tick(); return;
    }
    if (t.classList.contains('manual')) { manual = t.checked; store.set('manual', manual); drawn = null; render(false); tick(); return; }
    if (t.dataset.t) ovr[t.dataset.t] = t.value === 'yes' ? true : t.value === 'no' ? false : undefined;
    if (t.dataset.o) ovr[t.dataset.o] = t.value.trim();
    store.set('ovr', ovr); render(false);
  });
  panel.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.o) { ovr[t.dataset.o] = t.value.trim(); store.set('ovr', ovr); render(false); }
  });

  // typing names straight onto the custom board
  app.addEventListener('input', e => {
    const f = e.target.dataset && e.target.dataset.f;
    const row = e.target.closest && e.target.closest('.srow[data-n]');
    if (!f || !row) return;
    const typed = store.get('manualSpots', {});
    const n = row.dataset.n;
    typed[n] = Object.assign({ owner: '', bid: '', note: '' }, typed[n], { [f]: e.target.value });
    store.set('manualSpots', typed);
    render(false);
  });

  app.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'smaller' || act === 'bigger') { scale = Math.min(1.5, Math.max(.7, Math.round((scale + (act === 'bigger' ? .1 : -.1)) * 10) / 10)); store.set('scale', scale); applyLayout(); }
    if (act === 'layout') { layoutPref = { auto: 'wide', wide: 'tall', tall: 'auto' }[layoutPref] || 'auto'; store.set('layout', layoutPref); applyLayout(); refreshPanelInfo(); }
    if (act === 'full') { if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
    if (act === 'panel') { panel.classList.contains('open') ? panel.classList.remove('open') : openPanel(); }
    if (act === 'reset') { ovr = {}; store.del('ovr'); tabPick = ''; chasePick = ''; store.del('tab'); store.del('chase'); openPanel(); tick(); render(false); }
    if (act === 'clearmanual') { if (confirm('Clear every name typed on this board?')) { store.del('manualSpots'); drawn = null; render(false); } }
    if (act === 'psasave') { psaToken.set($('.psatok', panel).value.trim()); psaPausedUntil = 0; psaMsg = ''; $('.psastat', panel).textContent = 'Saved. Looking up certs now.'; render(false); }
    if (act === 'psaclear') { Object.keys(localStorage).filter(k => k.startsWith(psaKey)).forEach(k => localStorage.removeItem(k)); for (const k in psaMem) delete psaMem[k]; $('.psastat', panel).textContent = 'Cleared. Photos will be looked up again.'; const l = $('.chaselist', app); delete l.dataset.key; render(false); }
    if (act === 'copy') { const o = $('.obs', panel); o.select(); (navigator.clipboard ? navigator.clipboard.writeText(o.value) : Promise.reject()).catch(() => document.execCommand('copy')); b.textContent = 'Copied'; }
  });

  const tb = $('.toolbar', app); let idle;
  document.addEventListener('mousemove', () => { tb.classList.add('awake'); clearTimeout(idle); idle = setTimeout(() => tb.classList.remove('awake'), 2500); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') panel.classList.remove('open'); });

  applyLayout();
  if (spots || chase || manual) render(false);
  tick();
})();
