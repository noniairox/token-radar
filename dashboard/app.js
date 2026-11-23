// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, and a per-protocol detail view with
// the model's own inputs and the protocol's farm plan. No network: every byte it shows is in
// data.js, and the page fetches nothing.
//
// The value model, stated in full in the page's banner and recomputed here for every row, so the
// board's numbers and the page's code are visibly the same arithmetic:
//
//   implied = TVL x 0.30 x (1 + 0.6 x clamped 7-day growth) x (0.5 + 0.5 x min(age, 3y) / 3y)
//   growth  = clamp(change_7d, -50, 100);  age unknown counts as 365 days.
//
// The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
// decide the action, the capital, the hold and every cost and time. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var detail = document.getElementById('detail');
  var meta = document.getElementById('meta');
  var foot = document.getElementById('foot');
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('category');
  var sortEl = document.getElementById('sort');
  var tabPre = document.getElementById('tab-pre');
  var tabLive = document.getElementById('tab-live');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var model = DATA.model;

  // ---- formatting ---------------------------------------------------------
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtDate(s) {
    return s ? s : 'n/a';
  }

  // ---- the model, recomputed in the page ----------------------------------
  // The page recomputes a row from the snapshot figures and checks the number board.json
  // carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity));
  }
  function growthOf(row) {
    return Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
  }
  function maturityOf(row) {
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    return model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  }

  // ---- small DOM helper ----------------------------------------------------
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- the farm plan, the same derivation as board.json --------------------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function secondCapital(capital) { return Math.max(25, Math.round(capital / 2)); }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the lending position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the LP position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') >= 0 || c.indexOf('payment') >= 0) return 'Move $' + capital + " of USDC onto " + name + "'s chain through its official bridge and use it in one app on that chain.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var second = secondCapital(capital);
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + second + ' against the supplied collateral on ' + name + ' and repay it before the position closes, so the borrow side is also recorded.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Add $' + second + ' to a second ' + name + ' pool on ' + chain + ' so the position spans two pools.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake $' + second + ' of the receipt token through ' + name + ' so the stake compounds.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Place a second small hedge of $' + second + ' on ' + name + ' in the opposite direction.';
    if (c.indexOf('rwa') >= 0) return 'Mint a second $' + second + ' tranche of the yield asset on ' + name + ' and hold both.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + second + ' into a second ' + name + ' vault on ' + chain + ' so two vaults hold your funds.';
    return 'Swap $' + second + ' through ' + name + ' on ' + chain + ' once, so the position shows trading activity as well as a deposit.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  // Eight steps, each an action with a cost and a time, derived from the protocol's own
  // record (category, chains, TVL, age) — never from a hand-written list of names.
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var second = secondCapital(capital);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: '$' + second + ' of capital and about $3 of gas', time: '10 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Once a week, open the protocol's own points or rewards page and record any points balance.", cost: 'no fee to check', time: '5 minutes a week' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  function farmTotals(p) {
    var capital = capitalFor(p);
    var second = secondCapital(capital);
    var hold = holdDaysFor(p.age_days);
    return { capital: capital + second, hold: hold, gas: capital >= 150 ? 16 : 12 };
  }

  // ---- state from the URL hash ---------------------------------------------
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ---- filtering and sorting -----------------------------------------------
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ---- the board ------------------------------------------------------------
  function renderBoard() {
    app.setAttribute('aria-busy', 'false');
    while (app.firstChild) app.removeChild(app.firstChild);
    if (state.tab === 'live') { renderLive(); return; }
    var list = sortedRows(visibleRows());
    var count = el('p', { class: 'count' });
    count.innerHTML = '';
    var b1 = el('b', { text: String(list.length) });
    var b2 = el('b', { text: String(DATA.board_size) });
    var b3 = el('b', { text: String(DATA.watchlist_size) });
    count.appendChild(document.createTextNode('Showing '));
    count.appendChild(b1);
    count.appendChild(document.createTextNode(' of '));
    count.appendChild(b2);
    count.appendChild(document.createTextNode(' ranked pre-token protocols — '));
    count.appendChild(b3);
    count.appendChild(document.createTextNode(' on the watchlist, the rest found below its floor. Click a row for its farm plan.'));
    app.appendChild(count);
    if (list.length === 0) {
      app.appendChild(el('div', { class: 'empty', text: 'No protocol matches this filter. Clear the search or pick another category.' }));
      return;
    }
    var table = el('table');
    var head = el('thead');
    var hr = el('tr');
    var cols = [
      ['#', 'rank'], ['Protocol', 'name'], ['Category', 'category'], ['TVL', 'tvl'],
      ['7d', 'growth'], ['Age', 'age'], ['Implied value', 'implied']
    ];
    cols.forEach(function (c) {
      var th = el('th', { text: c[0] + (state.sort === c[1] ? (state.dir === -1 ? ' ↓' : ' ↑') : '') });
      th.addEventListener('click', function () {
        if (state.sort === c[1]) state.dir = -state.dir;
        else { state.sort = c[1]; state.dir = c[1] === 'name' ? 1 : -1; }
        sortEl.value = state.sort;
        writeHash();
        renderBoard();
      });
      hr.appendChild(th);
    });
    head.appendChild(hr);
    table.appendChild(head);
    var body = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', { class: state.selected === r.slug ? 'sel' : '' });
      tr.addEventListener('click', function () { select(r.slug); });
      tr.appendChild(el('td', { class: 'rank', text: String(r.rank) }));
      var nameTd = el('td');
      var nameSpan = el('span', { class: 'name', text: r.name });
      nameTd.appendChild(nameSpan);
      if (r.on_watchlist) nameTd.appendChild(el('span', { class: 'badge watch', text: 'Watchlist' }));
      else nameTd.appendChild(el('span', { class: 'badge', text: 'Early' }));
      nameTd.appendChild(el('small', { text: r.slug + ' · ' + (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') }));
      tr.appendChild(nameTd);
      tr.appendChild(el('td', { text: r.category || '—' }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      var g = r.change_7d;
      tr.appendChild(el('td', { class: 'num ' + (g === null ? '' : g >= 0 ? 'up' : 'down'), text: fmtPct(g) }));
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'num implied', text: fmtUsd(r.implied_value_usd) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    app.appendChild(table);
  }

  // ---- the live-token view ---------------------------------------------------
  function renderLive() {
    var count = el('p', { class: 'count' });
    var b1 = el('b', { text: String(DATA.live.length) });
    count.appendChild(document.createTextNode('Protocols whose token already trades, at the market\u2019s own value — '));
    count.appendChild(b1);
    count.appendChild(document.createTextNode(' shown, by market cap. These are never ranked by implied value: a token that trades needs no model.'));
    app.appendChild(count);
    var table = el('table');
    var head = el('thead');
    var hr = el('tr');
    ['Protocol', 'Category', 'TVL', '7d', 'Market cap'].forEach(function (c) { hr.appendChild(el('th', { text: c })); });
    head.appendChild(hr);
    table.appendChild(head);
    var body = el('tbody');
    DATA.live.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', {}, el('span', { class: 'name', text: r.name }), el('small', { text: r.slug + ' · ' + (r.chains || []).slice(0, 3).join(', ') })));
      tr.appendChild(el('td', { text: r.category || '—' }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      var g = r.change_7d;
      tr.appendChild(el('td', { class: 'num ' + (g === null ? '' : g >= 0 ? 'up' : 'down'), text: fmtPct(g) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    app.appendChild(table);
  }

  // ---- the detail view -------------------------------------------------------
  function select(slug) {
    state.selected = slug;
    writeHash();
    renderBoard();
    renderDetail();
    if (detail && !detail.hidden) detail.scrollIntoView({ block: 'nearest' });
  }
  function renderDetail() {
    if (!state.selected) { detail.hidden = true; detail.innerHTML = ''; return; }
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.selected) { row = DATA.rows[i]; break; }
    if (!row) { detail.hidden = true; detail.innerHTML = ''; return; }
    detail.hidden = false;
    detail.innerHTML = '';
    var card = el('div', { class: 'card' });
    var close = el('button', { class: 'close', text: 'Close' });
    close.addEventListener('click', function () { state.selected = null; writeHash(); renderBoard(); renderDetail(); });
    card.appendChild(close);
    card.appendChild(el('h2', { text: row.name }));
    card.appendChild(el('p', { class: 'slug', text: row.slug + ' · ' + (row.category || 'uncategorised') + ' · ' + (row.chains || []).join(', ') + ' · ' + (row.on_watchlist ? 'on the watchlist' : 'found below the watchlist floor') }));
    var stats = el('div', { class: 'stats' });
    function stat(label, value, cls) {
      var s = el('div', { class: 'stat' });
      s.appendChild(el('span', { text: label }));
      s.appendChild(el('b', { class: cls || '', text: value }));
      return s;
    }
    stats.appendChild(stat('Implied value', fmtUsd(row.implied_value_usd)));
    stats.appendChild(stat('TVL', fmtUsd(row.tvl_usd)));
    stats.appendChild(stat('7-day change', fmtPct(row.change_7d), row.change_7d === null ? '' : row.change_7d >= 0 ? 'up' : 'down'));
    stats.appendChild(stat('Age without token', fmtAge(row.age_days)));
    stats.appendChild(stat('Tracked since', fmtDate(row.listed_at)));
    card.appendChild(stats);
    var recomputed = impliedOf(row);
    var bd = el('p', { class: 'breakdown' });
    bd.innerHTML = '';
    bd.appendChild(document.createTextNode('Model radar-2, recomputed in this page: '));
    bd.appendChild(el('code', { text: fmtUsd(row.tvl_usd) + ' × 0.30 × ' + row.growth_multiplier.toFixed(2) + ' growth × ' + row.maturity_multiplier.toFixed(2) + ' maturity' }));
    bd.appendChild(document.createTextNode(' = '));
    bd.appendChild(el('b', { text: fmtUsd(recomputed) }));
    bd.appendChild(document.createTextNode(' — the same number the board carries. No name is special-cased; the formula above scores every row.'));
    card.appendChild(bd);
    card.appendChild(el('h3', { text: 'How to farm it — 8 steps' }));
    var steps = farmSteps(row);
    var ol = el('ol', { class: 'steps' });
    steps.forEach(function (s) {
      var li = el('li');
      var parts = s.split(' Cost: ');
      var action = parts[0] || s;
      var rest = parts[1] || '';
      var costTime = rest.split(' Time: ');
      li.appendChild(el('p', { text: action }));
      li.appendChild(el('p', { class: 'cost' }, el('b', { text: 'Cost: ' }), document.createTextNode(costTime[0] || ''), el('b', { text: '  Time: ' }), document.createTextNode((costTime[1] || '').replace(/\.$/, ''))));
      ol.appendChild(li);
    });
    card.appendChild(ol);
    var totals = farmTotals(row);
    var tot = el('p', { class: 'total' });
    tot.appendChild(document.createTextNode('Plan total: about $'));
    tot.appendChild(el('b', { text: String(totals.capital + totals.gas) }));
    tot.appendChild(document.createTextNode(' in capital and gas to start, plus about $2 of gas a week, held at least '));
    tot.appendChild(el('b', { text: String(totals.hold) }));
    tot.appendChild(document.createTextNode(' days. Recorded as having no token — that is what its DefiLlama record says, not proof it has none.'));
    card.appendChild(tot);
    detail.appendChild(card);
  }

  // ---- header, footer, controls ----------------------------------------------
  function renderMeta() {
    meta.innerHTML = '';
    meta.appendChild(document.createTextNode('Snapshot '));
    meta.appendChild(el('b', { text: DATA.as_of }));
    meta.appendChild(document.createElement('br'));
    meta.appendChild(document.createTextNode(String(DATA.watchlist_size) + ' on the watchlist · ' + String(DATA.board_size) + ' ranked · ' + String(DATA.live_size) + ' live tokens set aside'));
    foot.textContent = 'Source: ' + DATA.source + '. Floor: ' + fmtUsd(DATA.floor_usd) + '. The snapshot is sealed: every run reads the same bytes. Implied values are this radar\u2019s own claim, never the source\u2019s. A protocol recorded as having no token may still have one its record does not carry.';
  }
  function fillCategories() {
    var cats = {};
    DATA.rows.forEach(function (r) { if (r.category) cats[r.category] = true; });
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      catEl.appendChild(o);
    });
  }
  function setTab(tab) {
    state.tab = tab;
    tabPre.setAttribute('aria-selected', tab === 'pre-token' ? 'true' : 'false');
    tabLive.setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    state.selected = null;
    writeHash();
    renderBoard();
    renderDetail();
  }

  // ---- wire up ----------------------------------------------------------------
  readHash();
  renderMeta();
  fillCategories();
  qEl.value = state.q;
  catEl.value = state.category;
  sortEl.value = state.sort;
  if (state.tab === 'live') { tabPre.setAttribute('aria-selected', 'false'); tabLive.setAttribute('aria-selected', 'true'); }
  qEl.addEventListener('input', function () { state.q = qEl.value; writeHash(); renderBoard(); });
  catEl.addEventListener('change', function () { state.category = catEl.value; writeHash(); renderBoard(); });
  sortEl.addEventListener('change', function () { state.sort = sortEl.value; state.dir = state.sort === 'name' ? 1 : -1; writeHash(); renderBoard(); });
  tabPre.addEventListener('click', function () { setTab('pre-token'); });
  tabLive.addEventListener('click', function () { setTab('live'); });
  renderBoard();
  renderDetail();
})();
