/**
 * WACKY MCLOVIN STREAM BOARDS - setup + shop orders to board spots + spot labels.
 *
 * ONE TIME:
 *   1. Run createWackyBoards()  -> makes 5 Google Sheets in Drive folder "Wacky Stream Boards"
 *      (Main board sheet + Rip Till You Hit + Pick Your Type + Case Break + Wall of Hits).
 *      The IDs are logged and saved in Script Properties (WACKY_MAIN, WACKY_RTYH, ...).
 *   2. Project Settings > Script Properties: add SHOP (xxxx.myshopify.com), CLIENT_ID, CLIENT_SECRET
 *      from the Shopify Dev Dashboard app (scopes: read_orders, read_customers, read_products).
 *      (An old-style admin token also works: put it in SHOPIFY_TOKEN instead.)
 *   3. Run turnOnAutoOrders()   -> checks the shop every minute.
 * EVERY NIGHT: nothing. Paid orders for products listed in the SHOP tab get the next open spot
 * and a line in the LABELS tab. The Print Station page prints that line as a spot label.
 */
var GOLD = '#ffcc33', BLACK = '#111111', YELLOW = '#fff4c2', GREY = '#eeeeee';
var API_VERSION = '2026-07';
var SPOT_TABS = ['AUCTION', '$10', '$30'];

function createWackyBoards() {
  var props = PropertiesService.getScriptProperties();
  var folder = getFolder_('Wacky Stream Boards');
  var list = [
    { key: 'MAIN', title: 'Wacky Boards - Main (Auction, $10, $30, Shop Orders)', build: buildMain_ },
    { key: 'RTYH', title: 'Wacky Boards - Rip Till You Hit', tab: 'RTYH', build: buildRTYH_ },
    { key: 'TYPES', title: 'Wacky Boards - Pick Your Type', tab: 'TYPES', build: buildTypes_ },
    { key: 'CASE', title: 'Wacky Boards - Case Break', tab: 'CASE', build: buildCase_ },
    { key: 'HITS', title: 'Wacky Boards - Wall of Hits', tab: 'HITS', build: buildHits_ }
  ];
  list.forEach(function (g) {
    var existing = props.getProperty('WACKY_' + g.key);
    if (existing) {
      try { SpreadsheetApp.openById(existing); Logger.log(g.key + ' already exists: ' + existing); return; } catch (e) {}
    }
    var ss = SpreadsheetApp.create(g.title);
    if (g.tab) {
      var sh = ss.getSheets()[0].setName(g.tab);
      sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
      g.build(sh);
    } else {
      g.build(ss);
    }
    var file = DriveApp.getFileById(ss.getId());
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    file.moveTo(folder);
    props.setProperty('WACKY_' + g.key, ss.getId());
    Logger.log(g.key + ' created: ' + ss.getUrl());
  });
  Logger.log('IDS ' + JSON.stringify({
    main: props.getProperty('WACKY_MAIN'), rtyh: props.getProperty('WACKY_RTYH'), types: props.getProperty('WACKY_TYPES'),
    case: props.getProperty('WACKY_CASE'), hits: props.getProperty('WACKY_HITS')
  }));
}

// ---------- Main sheet: AUCTION / $10 / $30, chase tabs, LIVE, SHOP, LABELS ----------
function buildMain_(ss) {
  var first = ss.getSheets()[0];
  SPOT_TABS.forEach(function (name, i) {
    var sh = i === 0 ? first.setName(name) : ss.insertSheet(name);
    sh.getRange(1, 1, 60, 8).setNumberFormat('@');
    var rows = [['SPOT', 'OWNER', 'BID', 'NOTE', 'ORDER']];
    for (var n = 1; n <= 24; n++) rows.push([String(n), '', '', '', '']);
    sh.getRange(1, 1, rows.length, 5).setValues(rows);
    style_(sh.getRange(1, 1, 1, 5), 'head');
    sh.getRange(2, 1, 24, 5).setBorder(true, true, true, true, true, true, '#bbbbbb', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(2, 1, 24, 1).setFontWeight('bold').setBackground(GREY);
    sh.setColumnWidth(2, 220); sh.setColumnWidth(4, 200);
    sh.setFrozenRows(1);
    sh.getRange(1, 7, 4, 1).setValues([['HOW TO'], ['B = buyer name. C = bid (' + (i === 0 ? 'auction' : 'leave blank') + ').'],
      ['Type FREE in C for a free spot. Type winner in D to tag a winner.'], ['Shop orders fill this in by themselves.']]);
    sh.getRange(1, 7).setFontWeight('bold'); sh.setColumnWidth(7, 420);
  });
  var price = { 'AUCTION': ['$1 START', 'AUCTION', 'YES', 'YES'], '$10': ['$10 A SPOT', 'PRE-FILL', 'NO', 'NO'], '$30': ['$30 A PACK', 'PACK', 'NO', 'NO'] };
  SPOT_TABS.forEach(function (name) {
    var sh = ss.insertSheet(name + '_CHASE');
    sh.getRange(1, 1, 40, 3).setNumberFormat('@');
    var p = price[name];
    var rows = [
      ['Chase Image URL', '', 'Picture link (use the Picture Link Maker) or a PSA cert number'],
      ['Chase Name', 'Sample Chase Card', 'What they are chasing'],
      ['Chase Value', 'Grand prize', 'The prize or value'],
      ['Title', 'WACKY HUNT', 'Big title on the board'],
      ['Subtitle', p[1], 'Red tag'],
      ['Price', p[0], 'Gold price tag'],
      ['Box', '', 'What box the packs come from'],
      ['Banner', '', 'Yellow banner (blank hides it)'],
      ['Status', '', 'Small tag like LIVE or SOLD OUT'],
      ['Show Leader', p[2], 'YES shows the high bidder'],
      ['Show Bids', p[3], 'YES shows bids on the spots'],
      ['Chase 2 Image URL', '', 'Optional 2nd chase (up to 4)'],
      ['Chase 2 Name', '', ''],
      ['Chase 2 Value', '', '']
    ];
    sh.getRange(1, 1, rows.length, 3).setValues(rows);
    sh.getRange(1, 1, rows.length, 1).setFontWeight('bold');
    sh.getRange(1, 2, rows.length, 1).setBackground(YELLOW);
    sh.getRange(1, 3, rows.length, 1).setFontColor('#777777').setFontStyle('italic');
    sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 360); sh.setColumnWidth(3, 380);
  });
  var live = ss.insertSheet('LIVE');
  live.getRange(1, 1, 20, 4).setNumberFormat('@');
  live.getRange(1, 1, 6, 3).setValues([['BOARD', 'SHOW THIS TAB', 'CHASE TAB'], ['AUCTION', 'AUCTION', 'AUCTION_CHASE'], ['$10', '$10', '$10_CHASE'], ['$30', '$30', '$30_CHASE'], ['', '', ''],
    ['HOW TO: copy a tab, give it a new name, type that name in column B. The board switches in a few seconds.', '', '']]);
  style_(live.getRange(1, 1, 1, 3), 'head');
  live.getRange(2, 2, 3, 2).setBackground(YELLOW);
  live.setColumnWidth(1, 160); live.setColumnWidth(2, 220); live.setColumnWidth(3, 220);

  var shop = ss.insertSheet('SHOP');
  shop.getRange(1, 1, 80, 6).setNumberFormat('@');
  shop.getRange(1, 1).setValue('SHOP ORDERS').setBackground(BLACK).setFontColor('#ffffff').setFontWeight('bold').setFontSize(14);
  shop.getRange(1, 2, 1, 4).merge().setValue('When someone buys a product listed below (TikTok Shop, website, anywhere Shopify gets the order), they get the next open spot on that board and a spot label prints at the Print Station.').setFontStyle('italic').setWrap(true);
  shop.setRowHeight(1, 48);
  var r = settings_(shop, 3, [
    ['Auto Orders', 'YES', 'YES = fill spots from shop orders. NO = pause.'],
    ['Test Order', '', 'Type YES to make a pretend order (checks your label printer). It clears itself.'],
    ['Buyer Name', 'FIRST L', 'FIRST L = Jonah M.   FIRST = Jonah   ORDER = #1790'],
    ['Last Checked', '', 'Filled in by the robot']
  ]);
  table_(shop, r, ['PRODUCT NAME HAS', 'BOARD', 'SPOTS PER ITEM', 'ON'],
    [['Wacky $10 Spot', '$10', '1', 'YES'], ['Wacky $30 Pack', '$30', '1', 'YES'], ['Pick Your Type Spot', 'TYPES', '1', 'NO'], ['Case Break Spot', 'CASE', '1', 'NO'], ['Rip Till You Hit', 'RTYH', '1', 'NO']], 15,
    '(BOARD can be AUCTION, $10, $30, any tab name in this sheet, or TYPES / CASE / RTYH for the game sheets. Case does not matter.)');
  shop.setColumnWidth(1, 230); shop.setColumnWidth(2, 200); shop.setColumnWidth(3, 330); shop.setColumnWidth(4, 90);

  var lab = ss.insertSheet('LABELS');
  lab.getRange(1, 1, 500, 9).setNumberFormat('@');
  lab.getRange(1, 1, 1, 9).setValues([['TIME', 'ORDER', 'BUYER', 'BOARD', 'SPOT', 'ITEM', 'CHANNEL', 'STATUS', 'ORDER ID']]);
  style_(lab.getRange(1, 1, 1, 9), 'head');
  lab.setFrozenRows(1); lab.setColumnWidth(6, 300); lab.setColumnWidth(9, 60);
}

function getFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

// ---------- shared layout helpers ----------
function put_(sh, row, values) {
  sh.getRange(row, 1, 1, values.length).setValues([values.map(String)]);
  return row + 1;
}
function settings_(sh, row, list) {
  row = put_(sh, row, ['SETTINGS', 'VALUE', 'NOTES']);
  style_(sh.getRange(row - 1, 1, 1, 3), 'head');
  list.forEach(function (s) {
    row = put_(sh, row, s);
    sh.getRange(row - 1, 1).setFontWeight('bold');
    sh.getRange(row - 1, 2).setBackground(YELLOW);
    sh.getRange(row - 1, 3).setFontColor('#777777').setFontStyle('italic');
  });
  return row + 1;
}
function table_(sh, row, headers, rows, blankRows, note) {
  if (note) { sh.getRange(row, 1).setValue(note).setFontColor('#777777').setFontStyle('italic'); row++; }
  row = put_(sh, row, headers);
  style_(sh.getRange(row - 1, 1, 1, headers.length), 'head');
  var all = rows.slice();
  for (var i = 0; i < (blankRows || 0); i++) all.push(headers.map(function () { return ''; }));
  if (all.length) {
    var r = sh.getRange(row, 1, all.length, headers.length);
    r.setValues(all.map(function (x) { return headers.map(function (_, j) { return String(x[j] == null ? '' : x[j]); }); }));
    r.setBorder(true, true, true, true, true, true, '#bbbbbb', SpreadsheetApp.BorderStyle.SOLID);
    row += all.length;
  }
  return row + 1;
}
function style_(range, kind) {
  if (kind === 'head') range.setBackground(GOLD).setFontWeight('bold').setFontColor('#000000');
}
function top_(sh, name, how) {
  sh.getRange(1, 1).setValue(name).setBackground(BLACK).setFontColor('#ffffff').setFontWeight('bold').setFontSize(14);
  sh.getRange(1, 2, 1, 4).merge().setValue(how).setFontStyle('italic').setWrap(true);
  sh.setRowHeight(1, 48);
  sh.setColumnWidth(1, 230); sh.setColumnWidth(2, 230); sh.setColumnWidth(3, 230); sh.setColumnWidth(4, 260); sh.setColumnWidth(5, 200);
  sh.setFrozenRows(1);
  return 3;
}

// ---------- RTYH ----------
function buildRTYH_(sh) {
  var row = top_(sh, 'RIP TILL YOU HIT', 'Each buyer rips until they hit. Add a row at the bottom for each new ripper, update PACKS as you open, and type the HIT CARD when it lands (the board plays the HIT animation).');
  row = settings_(sh, row, [
    ['Title', 'RIP TILL YOU HIT', 'Big title'],
    ['Game', 'RTYH', 'Red tag'],
    ['Price Per Pack', '$6 / PACK', 'Gold price tag'],
    ['Hit Rule', 'Illustration Rare or better', 'What counts as a hit (shown on the board)'],
    ['Product', 'Booster packs', 'What is being ripped'],
    ['Status', 'LIVE', 'Small tag (blank hides it)'],
    ['Show Spend', 'NO', 'YES shows packs x price for the current ripper'],
    ['Celebrate Seconds', '10', 'How long the HIT animation stays up']
  ]);
  row = table_(sh, row, ['WHAT COUNTS AS A HIT', 'PICTURE'], [['Illustration Rare', ''], ['Special Illustration Rare', ''], ['Hyper Rare', '']], 2,
    '(Optional pictures show next to the hit rule. Use the Picture Link Maker for links.)');
  table_(sh, row, ['RIPPER', 'PACKS', 'HIT CARD', 'HIT PICTURE'], [['sample_buyer', '4', 'Sample Illustration Rare', ''], ['next_buyer', '2', '', '']], 60,
    '(Newest ripper at the bottom. The last row with no HIT CARD is the one ripping now.)');
}

// ---------- Pick Your Type ----------
function buildTypes_(sh) {
  var row = top_(sh, 'PICK YOUR TYPE', 'Buyers pick a type or color and get every card of that type from the break. Type the buyer next to their type. COLOR can be a name (red, blue...) or a hex code like #ff8800.');
  row = settings_(sh, row, [
    ['Title', 'COLOR HUNT', 'Big title'],
    ['Game', 'PICK YOUR TYPE', 'Red tag'],
    ['Price', '$15 A TYPE', 'Gold price tag'],
    ['Product', '', 'What is being opened'],
    ['Status', '', 'Blank = shows how many are taken'],
    ['Banner', 'Every card of your type is yours', 'Yellow banner (blank hides it)']
  ]);
  var t = [['Grass', '', 'green', ''], ['Fire', 'sample_buyer', 'fire', ''], ['Water', '', 'water', ''], ['Lightning', '', 'lightning', ''],
    ['Psychic', '', 'psychic', ''], ['Fighting', '', 'fighting', ''], ['Darkness', '', 'darkness', ''], ['Metal', '', 'metal', ''],
    ['Dragon', '', 'dragon', ''], ['Colorless', '', 'colorless', ''], ['Trainer', '', 'trainer', '']];
  row = table_(sh, row, ['TYPE', 'OWNER', 'COLOR', 'HITS'], t, 13, '(Up to 24 types. HITS is optional, e.g. "2 SIR".)');
  sh.getRange(row, 1).setValue('(One Piece colors example: Red, Green, Blue, Purple, Black, Yellow, Multicolor. Replace the TYPE column to switch.)').setFontColor('#777777');
}

// ---------- Case Break ----------
function buildCase_(sh) {
  var row = top_(sh, 'CASE BREAK', 'Track a full case: boxes (sealed / ripping / done), up to 24 spots, and a live hit feed. Add hits at the bottom of the HIT list and the board celebrates them.');
  row = settings_(sh, row, [
    ['Title', 'CASE BREAK', 'Big title'],
    ['Game', 'CASE BREAK', 'Red tag'],
    ['Product', 'Booster Box Case', 'Shown above the boxes'],
    ['Price', '$25 A SPOT', 'Gold price tag'],
    ['Status', 'LIVE', 'Small tag'],
    ['Banner', '', 'Yellow banner (blank hides it)'],
    ['Celebrate Seconds', '8', 'How long the HIT animation stays up']
  ]);
  var boxes = [];
  for (var b = 1; b <= 12; b++) boxes.push(['Box ' + b, b === 1 ? 'done' : (b === 2 ? 'ripping' : 'sealed'), b === 1 ? '2' : '']);
  row = table_(sh, row, ['BOX', 'STATUS', 'HITS'], boxes, 0, '(STATUS: sealed, ripping or done.)');
  var spots = [];
  for (var s = 1; s <= 24; s++) spots.push([String(s), s === 1 ? 'sample_buyer' : '']);
  row = table_(sh, row, ['SPOT', 'OWNER'], spots, 0, '(Up to 24 spots.)');
  table_(sh, row, ['HIT CARD', 'OWNER', 'PICTURE'], [['Sample Hit Card', 'sample_buyer', '']], 60, '(Newest hit at the bottom.)');
}

// ---------- Wall of Hits ----------
function buildHits_(sh) {
  var row = top_(sh, 'WALL OF HITS', 'Every big pull, newest at the bottom. The board spotlights the newest hit with an animation and shows the rest as a wall.');
  row = settings_(sh, row, [
    ['Title', 'HIT WALL', 'Big title'],
    ['Game', 'TONIGHT\'S HITS', 'Red tag'],
    ['Status', '', 'Small tag'],
    ['Rotate Seconds', '8', 'Cycle the spotlight through recent hits (0 = off)'],
    ['Celebrate Seconds', '10', 'How long the HIT animation stays up']
  ]);
  table_(sh, row, ['HIT CARD', 'BUYER', 'PICTURE', 'GAME', 'NOTE'],
    [['Sample Hit Card', 'sample_buyer', '', 'RTYH', 'in 4 packs']], 100, '(Newest hit at the bottom. PICTURE: any image link, Drive link, or use the Picture Link Maker.)');
}

// =====================================================================
//  SHOP ORDERS -> BOARD SPOTS -> LABELS
// =====================================================================
function turnOnAutoOrders() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'checkOrders') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkOrders').timeBased().everyMinutes(1).create();
  checkOrders();
  Logger.log('Auto orders are ON. The shop gets checked every minute.');
}
function turnOffAutoOrders() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'checkOrders') ScriptApp.deleteTrigger(t); });
  Logger.log('Auto orders are OFF.');
}
/** Pretend order, so you can check the board and the label printer without buying anything. */
function testOrder() { runTest_(); }

function mainSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('WACKY_MAIN');
  if (!id) throw new Error('Run createWackyBoards() first.');
  return SpreadsheetApp.openById(id);
}
function shopSettings_(sh) {
  var v = sh.getDataRange().getValues(), set = {}, rules = [], inTable = false;
  for (var i = 0; i < v.length; i++) {
    var a = String(v[i][0]).trim(), b = String(v[i][1]).trim();
    if (/^product name has$/i.test(a)) { inTable = true; continue; }
    if (!inTable) { if (a) set[a.toLowerCase()] = { value: b, row: i + 1 }; continue; }
    if (!a || a.charAt(0) === '(') continue;
    rules.push({ match: a.toLowerCase(), board: b, per: Math.max(1, parseInt(v[i][2], 10) || 1), on: !/^no$/i.test(String(v[i][3]).trim()) });
  }
  return { set: set, rules: rules };
}

function checkOrders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var ss = mainSheet_();
    var shop = ss.getSheetByName('SHOP'), labels = ss.getSheetByName('LABELS');
    var cfg = shopSettings_(shop);
    var stamp = function (txt) { if (cfg.set['last checked']) shop.getRange(cfg.set['last checked'].row, 2).setValue(txt); };
    if (cfg.set['test order'] && /^yes$/i.test(cfg.set['test order'].value)) {
      shop.getRange(cfg.set['test order'].row, 2).setValue('');
      runTest_();
    }
    if (cfg.set['auto orders'] && /^no$/i.test(cfg.set['auto orders'].value)) { stamp('Paused ' + now_()); return; }
    var orders;
    try { orders = fetchOrders_(); }
    catch (e) { stamp('PROBLEM: ' + e.message + ' (' + now_() + ')'); return; }
    var done = {};
    labels.getRange(1, 9, Math.max(1, labels.getLastRow()), 1).getValues().forEach(function (r) { if (r[0]) done[String(r[0])] = true; });
    var added = 0;
    orders.forEach(function (o) {
      if (done[o.id] || o.cancelledAt || !/paid/i.test(o.displayFinancialStatus || '')) return;
      var lines = [];
      o.lineItems.nodes.forEach(function (li) {
        var hay = ((li.title || '') + ' ' + (li.variantTitle || '') + ' ' + (li.sku || '')).toLowerCase();
        var rule = null;
        cfg.rules.forEach(function (r) { if (!rule && r.on && hay.indexOf(r.match) >= 0) rule = r; });
        if (rule) lines.push({ li: li, rule: rule });
      });
      if (!lines.length) return;
      var buyer = buyerName_(o, (cfg.set['buyer name'] || {}).value);
      var channel = o.channelInformation && o.channelInformation.channelDefinition ? o.channelInformation.channelDefinition.channelName : (o.sourceName || '');
      lines.forEach(function (x) {
        var count = (x.li.quantity || 1) * x.rule.per;
        for (var k = 0; k < count; k++) {
          var spot = assign_(ss, x.rule.board, buyer, o.name, x.li.variantTitle || '');
          labels.appendRow([now_(), o.name, buyer, spot.board, spot.spot, x.li.title + (x.li.variantTitle ? ' - ' + x.li.variantTitle : ''), channel, spot.ok ? 'READY' : 'NO OPEN SPOT - CHECK', o.id]);
          added++;
        }
      });
      done[o.id] = true;
    });
    stamp((added ? added + ' new spot(s) ' : 'OK ') + now_());
  } finally { lock.releaseLock(); }
}

function runTest_() {
  var ss = mainSheet_();
  var cfg = shopSettings_(ss.getSheetByName('SHOP'));
  var rule = cfg.rules.filter(function (r) { return r.on; })[0] || { board: '$10' };
  var spot = assign_(ss, rule.board, 'TEST BUYER', '#TEST', '');
  ss.getSheetByName('LABELS').appendRow([now_(), '#TEST', 'TEST BUYER', spot.board, spot.spot, 'Pretend order (safe to delete)', 'Test', spot.ok ? 'READY' : 'NO OPEN SPOT - CHECK', 'test-' + Date.now()]);
}

function now_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d h:mm:ss a'); }

function buyerName_(o, style) {
  style = String(style || 'FIRST L').toUpperCase();
  var attrs = (o.customAttributes || []).slice();
  o.lineItems.nodes.forEach(function (li) { (li.customAttributes || []).forEach(function (a) { attrs.push(a); }); });
  for (var i = 0; i < attrs.length; i++) {
    if (/tiktok|username|user name|handle|whatnot/i.test(attrs[i].key) && String(attrs[i].value || '').trim()) return String(attrs[i].value).trim().replace(/^@/, '');
  }
  var c = o.customer || {};
  var first = (c.firstName || '').trim(), last = (c.lastName || '').trim();
  if (style === 'ORDER' || (!first && !last)) return o.name;
  if (style === 'FIRST') return first || last;
  return (first + (last ? ' ' + last.charAt(0).toUpperCase() + '.' : '')).trim();
}

/** Put a buyer on a board. Returns {ok, board, spot}. */
function assign_(ss, boardName, buyer, orderName, variant) {
  var key = String(boardName || '').trim();
  var up = key.toUpperCase();
  var props = PropertiesService.getScriptProperties();
  if (up === 'TYPES' || up === 'CASE' || up === 'RTYH') {
    var gid = props.getProperty('WACKY_' + up);
    if (!gid) return { ok: false, board: up, spot: '?' };
    var gs = SpreadsheetApp.openById(gid);
    var sh = gs.getSheetByName(up) || gs.getSheets()[0];
    if (up === 'RTYH') return assignRipper_(sh, buyer);
    return assignOwner_(sh, up === 'TYPES' ? 'type' : 'spot', buyer, up === 'TYPES' ? variant : '', up === 'TYPES' ? 'Pick Your Type' : 'Case Break', null);
  }
  var tab = ss.getSheetByName(key) || ss.getSheetByName(up);
  var live = ss.getSheetByName('LIVE');
  if (live) {   // follow the LIVE tab so orders land on the tab that is on stream right now
    live.getDataRange().getValues().forEach(function (r) {
      if (String(r[0]).trim().toUpperCase() === up && String(r[1]).trim() && ss.getSheetByName(String(r[1]).trim())) tab = ss.getSheetByName(String(r[1]).trim());
    });
  }
  if (!tab) return { ok: false, board: key, spot: '?' };
  return assignOwner_(tab, 'spot', buyer, '', tab.getName(), orderName);
}

function assignOwner_(sh, mode, buyer, wanted, boardLabel, orderName) {
  var v = sh.getDataRange().getValues();
  var headerRow = -1, orderCol = -1;
  for (var i = 0; i < v.length; i++) {
    var a = String(v[i][0]).trim().toLowerCase(), b = String(v[i][1]).trim().toLowerCase();
    if (b !== 'owner') continue;
    if (mode === 'type' ? a === 'type' : true) {
      if (headerRow < 0) headerRow = i;
      for (var c = 2; c < v[i].length; c++) if (String(v[i][c]).trim().toLowerCase() === 'order') orderCol = c;
      if (mode === 'type') break;
    }
  }
  if (headerRow < 0) return { ok: false, board: boardLabel, spot: '?' };
  var open = [];
  for (var j = headerRow + 1; j < v.length; j++) {
    var A = String(v[j][0]).trim();
    if (mode === 'type') { if (!A) break; }
    else if (!/^\d+$/.test(A) || +A < 1 || +A > 24) continue;
    if (String(v[j][1]).trim()) continue;
    open.push(j);
  }
  if (!open.length) return { ok: false, board: boardLabel, spot: 'FULL' };
  var pick = open[0];
  if (wanted) open.forEach(function (j) { if (String(v[j][0]).trim().toLowerCase() === String(wanted).trim().toLowerCase()) pick = j; });
  sh.getRange(pick + 1, 2).setValue(buyer);
  if (orderName && orderCol >= 0) sh.getRange(pick + 1, orderCol + 1).setValue(orderName);
  return { ok: true, board: boardLabel, spot: String(v[pick][0]).trim() };
}

function assignRipper_(sh, buyer) {
  var v = sh.getDataRange().getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === 'ripper' && String(v[i][1]).trim().toLowerCase() === 'packs') {
      var n = 0;
      for (var j = i + 1; j < sh.getMaxRows(); j++) {
        var row = j < v.length ? v[j] : ['', '', ''];
        if (String(row[0]).trim()) { n++; continue; }
        sh.getRange(j + 1, 1, 1, 2).setValues([[buyer, '0']]);
        return { ok: true, board: 'Rip Till You Hit', spot: 'Ripper ' + (n + 1) };
      }
    }
  }
  return { ok: false, board: 'Rip Till You Hit', spot: '?' };
}

// ---------- Shopify ----------
function shopToken_() {
  var p = PropertiesService.getScriptProperties();
  var shop = String(p.getProperty('SHOP') || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  if (!shop) throw new Error('Add SHOP in Script Properties');
  var fixed = p.getProperty('SHOPIFY_TOKEN');
  if (fixed) return { shop: shop, token: fixed.trim() };
  var cache = CacheService.getScriptCache();
  var hit = cache.get('shop_token');
  if (hit) return { shop: shop, token: hit };
  var id = p.getProperty('CLIENT_ID'), secret = p.getProperty('CLIENT_SECRET');
  if (!id || !secret) throw new Error('Add CLIENT_ID and CLIENT_SECRET in Script Properties');
  var r = UrlFetchApp.fetch('https://' + shop + '/admin/oauth/access_token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'client_credentials', client_id: id.trim(), client_secret: secret.trim() }
  });
  if (r.getResponseCode() !== 200) throw new Error('Shopify said no to the app keys (' + r.getResponseCode() + ')');
  var j = JSON.parse(r.getContentText());
  cache.put('shop_token', j.access_token, Math.min(21600, Math.max(60, (j.expires_in || 3600) - 300)));
  return { shop: shop, token: j.access_token };
}

var ORDERS_QUERY = 'query Orders($q: String) { orders(first: 50, sortKey: CREATED_AT, reverse: true, query: $q) { nodes { id name createdAt sourceName displayFinancialStatus cancelledAt customAttributes { key value } customer { firstName lastName } channelInformation { channelDefinition { channelName } } lineItems(first: 50) { nodes { title variantTitle sku quantity customAttributes { key value } } } } } }';

function fetchOrders_() {
  var t = shopToken_();
  var since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  var r = UrlFetchApp.fetch('https://' + t.shop + '/admin/api/' + API_VERSION + '/graphql.json', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Shopify-Access-Token': t.token },
    payload: JSON.stringify({ query: ORDERS_QUERY, variables: { q: 'created_at:>' + since } })
  });
  if (r.getResponseCode() === 401) { CacheService.getScriptCache().remove('shop_token'); throw new Error('Shopify key expired or wrong'); }
  if (r.getResponseCode() !== 200) throw new Error('Shopify error ' + r.getResponseCode());
  var j = JSON.parse(r.getContentText());
  if (j.errors) {
    // Customer names need extra permission. Try again without them.
    if (JSON.stringify(j.errors).indexOf('customer') >= 0) {
      var q2 = ORDERS_QUERY.replace(' customer { firstName lastName }', '');
      r = UrlFetchApp.fetch('https://' + t.shop + '/admin/api/' + API_VERSION + '/graphql.json', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'X-Shopify-Access-Token': t.token },
        payload: JSON.stringify({ query: q2, variables: { q: 'created_at:>' + since } })
      });
      j = JSON.parse(r.getContentText());
    }
    if (j.errors) throw new Error(String(j.errors[0] && j.errors[0].message || 'Shopify error').slice(0, 120));
  }
  return (j.data.orders.nodes || []).reverse();   // oldest first, so spots go in buying order
}
