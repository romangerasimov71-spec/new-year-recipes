/* Новогодний стол: рецепты — логика приложения. */
(function () {
  'use strict';

  var D = window.NYR_DATA;
  var ART = window.NYR_ART;
  var APP_URL = 'https://romangerasimov71-spec.github.io/new-year-recipes/';
  var STORE_KEY = 'nyr.v1';
  var MIN_PEOPLE = 1, MAX_PEOPLE = 40, MAX_WHOLE = 10;
  var QUICK_GUESTS = [2, 4, 6, 8, 10, 12, 20];
  var EPS = 1e-6;

  // Поиск только через Map — никакие «__proto__» и «toString» из сохранения не пролезут.
  var RECIPES = new Map();
  D.RECIPES.forEach(function (r) { RECIPES.set(r.id, r); });
  var CATS = new Map();
  D.CATEGORIES.forEach(function (c) { CATS.set(c.id, c); });
  function rec(id) { return typeof id === 'string' ? RECIPES.get(id) : undefined; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function dict() { return Object.create(null); }

  /* ---------- Сохранение ---------- */
  var state = { menu: [], guests: 6, bought: dict(), steps: dict(), portions: dict(), fromMenu: dict() };

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function num(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0; }
  function load() {
    var s;
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      s = JSON.parse(raw);
    } catch (e) { return; /* без хранилища тоже работаем */ }
    if (!isObj(s)) return;
    if (Array.isArray(s.menu)) {
      s.menu.forEach(function (id) { if (rec(id) && state.menu.indexOf(id) < 0) state.menu.push(id); });
    }
    if (typeof s.guests === 'number' && isFinite(s.guests)) state.guests = clamp(Math.round(s.guests), MIN_PEOPLE, MAX_PEOPLE);
    if (isObj(s.steps)) {
      Object.keys(s.steps).forEach(function (id) {
        var r = rec(id), v = s.steps[id];
        if (!r || !Array.isArray(v)) return;
        var arr = [];
        v.forEach(function (k) { if (typeof k === 'number' && k % 1 === 0 && k >= 0 && k < r.steps.length && arr.indexOf(k) < 0) arr.push(k); });
        if (arr.length) state.steps[id] = arr;
      });
    }
    if (isObj(s.bought)) {
      Object.keys(s.bought).forEach(function (name) {
        var v = s.bought[name];
        if (!isObj(v) || !own(D.DEPT, name)) return;
        var b = { mass: num(v.mass), vol: num(v.vol), pcs: num(v.pcs), sp: num(v.sp) };
        if (b.mass || b.vol || b.pcs || b.sp) state.bought[name] = b;
      });
    }
  }
  function save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        menu: state.menu, guests: state.guests, bought: state.bought, steps: state.steps
      }));
    } catch (e) { /* ничего страшного */ }
  }

  /* ---------- Помощники ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function plural(n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }
  var DISH = ['блюдо', 'блюда', 'блюд'];
  var PORTION = ['порция', 'порции', 'порций'];
  var RECIPE_W = ['рецепт', 'рецепта', 'рецептов'];
  function guestsText(n) { return n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'гостя' : 'гостей'); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  /* ---------- Количества ---------- */
  function numStr(x) { return (Math.round(x * 100) / 100).toString().replace('.', ','); }
  function halfStr(x) {
    var whole = Math.floor(x + EPS), frac = x - whole;
    if (frac > 0.25 && frac < 0.75) return (whole ? whole : '') + '½';
    return String(Math.round(x));
  }
  function roundStep(v, mode) {
    // В рецепте мелочь точнее; в магазине — вверх до 10 г / 50 г.
    var step = mode === 'shop' ? (v < 200 ? 10 : 50) : (v < 20 ? 1 : (v < 200 ? 10 : 50));
    var r = mode === 'shop' ? Math.ceil(v / step - EPS) * step : Math.round(v / step) * step;
    return Math.max(step, r);
  }
  function fmtMetric(v, mode, small, big) {
    var r = roundStep(v, mode);
    if (r >= 1000) return numStr(r / 1000) + ' ' + big;
    return r + ' ' + small;
  }
  function half(n) { return Math.round(n * 2) / 2; }
  function ceilHalf(n) { return Math.ceil(n * 2 - EPS) / 2; }

  // Ложки в рецепте: ч. л. от 6 — в ст. л.
  function fmtSpoonRecipe(tsp, wasTbsp) {
    if (wasTbsp || tsp >= 6 - EPS) return halfStr(Math.max(0.5, half(tsp / 3))) + ' ст. л.';
    return halfStr(Math.max(0.5, half(tsp))) + ' ч. л.';
  }
  // Одна строка рецепта (и текста «Поделиться»).
  function fmtIng(ing, factor) {
    var q = ing.qty * factor;
    switch (ing.unit) {
      case 'кг': q *= 1000; /* falls through */
      case 'г': return q < 5 - EPS ? 'щепотка' : fmtMetric(q, 'recipe', 'г', 'кг');
      case 'л': q *= 1000; /* falls through */
      case 'мл': return fmtMetric(q, 'recipe', 'мл', 'л');
      case 'шт':
        if (own(D.PCS_CEIL, ing.name)) return Math.max(1, Math.ceil(q - 0.001)) + ' шт';
        if (q < 5) return halfStr(Math.max(0.5, half(q))) + ' шт';
        return Math.round(q) + ' шт';
      case 'ст. л.': return fmtSpoonRecipe(q * 3, true);
      case 'ч. л.': return fmtSpoonRecipe(q, false);
      default: return 'по вкусу';
    }
  }

  function wholeCount(r, guests) { return Math.max(1, Math.ceil(guests / r.serves - EPS)); }
  function menuFactor(r, guests) { return r.whole ? wholeCount(r, guests) : guests / r.serves; }
  function servesText(r) { return r.servesText || String(r.serves); }
  // «4–5 порций»: форма слова — по последнему числу.
  function portionsWord(t) { return plural(+String(t).split('–').pop(), PORTION); }
  function wholeText(r, k) {
    var t = k === 1 ? servesText(r) : String(k * r.serves);
    return k + ' ' + plural(k, r.whole) + ' — ' + t + ' ' + portionsWord(t);
  }

  /* ---------- Список покупок ---------- */
  // Потребность по продукту: масса (г), объём (мл), штуки, ложки (в ч. л.).
  function emptyVec() { return { mass: 0, vol: 0, pcs: 0, sp: 0, tbsp: true, taste: false }; }
  function needs(menuIds, guests) {
    var items = new Map();
    menuIds.forEach(function (id) {
      var r = rec(id); if (!r) return;
      var f = menuFactor(r, guests);
      r.ingredients.forEach(function (ing) {
        if (own(D.NO_BUY, ing.name)) return;
        var it = items.get(ing.name);
        if (!it) { it = emptyVec(); items.set(ing.name, it); }
        var q = ing.qty * f;
        switch (ing.unit) {
          case 'г': it.mass += q; break;
          case 'кг': it.mass += q * 1000; break;
          case 'мл': it.vol += q; break;
          case 'л': it.vol += q * 1000; break;
          case 'шт': it.pcs += q; break;
          case 'ст. л.': it.sp += q * 3; break;
          case 'ч. л.': it.sp += q; it.tbsp = false; break;
          default: it.taste = true;
        }
      });
    });
    return items;
  }
  // Сколько реально купить (округлено вверх) — это и запоминаем при галочке.
  function roundNeed(name, v) {
    var o = { mass: 0, vol: 0, pcs: 0, sp: 0 };
    if (v.mass > EPS) o.mass = roundStep(v.mass, 'shop');
    if (v.vol > EPS) o.vol = roundStep(v.vol, 'shop');
    if (v.pcs > EPS) {
      var n = Math.ceil(v.pcs - 0.001);
      if (own(D.PACK, name)) n = Math.ceil(n / D.PACK[name]) * D.PACK[name];
      else if (name === 'Чеснок (зубчики)' && n > 10) n = Math.ceil(n / 10) * 10;
      o.pcs = n;
    }
    if (v.sp > EPS) o.sp = Math.ceil(v.sp / 1.5 - EPS) * 1.5;
    return o;
  }
  var HEADS = ['головка', 'головки', 'головок'], CLOVES = ['зубчик', 'зубчика', 'зубчиков'];
  var PACKS = ['пачка', 'пачки', 'пачек'], TENS = ['десяток', 'десятка', 'десятков'];
  // Понятная подпись количества для магазина.
  function fmtShop(name, v) {
    var parts = [], vol = v.vol, approxVol = false;
    var tsp = v.sp, tbspMode = v.tbsp !== false || tsp >= 6 - EPS;
    if (tsp > EPS && own(D.LIQUID, name) && tsp / 3 >= 8 - EPS) { vol += tsp * 5; tsp = 0; approxVol = true; }
    if (v.mass > EPS) parts.push(fmtMetric(v.mass, 'shop', 'г', 'кг'));
    if (vol > EPS) parts.push((approxVol ? '≈ ' : '') + fmtMetric(vol, 'shop', 'мл', 'л'));
    if (v.pcs > EPS) {
      var n = Math.ceil(v.pcs - 0.001);
      if (own(D.PACK, name)) { var k = Math.ceil(n / D.PACK[name]); parts.push(k + ' ' + plural(k, PACKS)); }
      else if (name === 'Чеснок (зубчики)' && n > 10) { var h = Math.ceil(n / 10); parts.push(h + ' ' + plural(h, HEADS) + ' (≈ ' + n + ' ' + plural(n, CLOVES) + ')'); }
      else if (name === 'Яйца' && n >= 20) { var t = Math.ceil(n / 10); parts.push(n + ' шт (≈ ' + t + ' ' + plural(t, TENS) + ')'); }
      else parts.push(n + ' шт');
    }
    if (tsp > EPS) {
      if (tbspMode) {
        var tb = Math.max(0.5, ceilHalf(tsp / 3)), s = halfStr(tb) + ' ст. л.';
        if (own(D.SPOON_G, name) && tb > 10) s += ' (≈ ' + fmtMetric(tb * D.SPOON_G[name], 'shop', 'г', 'кг') + ')';
        parts.push(s);
      } else parts.push(halfStr(Math.max(0.5, ceilHalf(tsp))) + ' ч. л.');
    }
    return parts.join(' + ');
  }
  function hasQty(v) { return v.mass > EPS || v.vol > EPS || v.pcs > EPS || v.sp > EPS; }
  function covered(v, b) {
    return !!b && v.mass <= b.mass + EPS && v.vol <= b.vol + EPS && v.pcs <= b.pcs + EPS && v.sp <= b.sp + EPS;
  }
  function deficit(v, b) {
    return { mass: Math.max(0, v.mass - b.mass), vol: Math.max(0, v.vol - b.vol), pcs: Math.max(0, v.pcs - b.pcs),
      sp: Math.max(0, v.sp - b.sp), tbsp: v.tbsp };
  }
  var collator = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('ru') : null;
  function byName(a, b) { return collator ? collator.compare(a.name, b.name) : (a.name < b.name ? -1 : 1); }

  // Готовый список: items — что купить (по отделам, по алфавиту), home — «проверьте дома».
  function buildShopping(menuIds, guests, bought) {
    bought = bought || dict();
    var items = [], home = [];
    needs(menuIds, guests).forEach(function (v, name) {
      if (own(D.AT_HOME, name) || !hasQty(v)) { home.push(name); return; }
      var b = own(bought, name) ? bought[name] : null;
      var it = { name: name, dept: own(D.DEPT, name) ? D.DEPT[name] : 'other', need: v, amount: fmtShop(name, v),
        bought: covered(v, b), partial: false };
      if (b && !it.bought) {
        it.partial = true;
        it.got = fmtShop(name, b);
        it.more = fmtShop(name, deficit(v, b));
      }
      items.push(it);
    });
    items.sort(byName);
    home.sort(function (a, b) { return byName({ name: a }, { name: b }); });
    return { items: items, home: home };
  }
  // Убрать отметки по продуктам, которых больше нет в списке.
  function pruneBought() {
    var names = new Set(buildShopping(state.menu, state.guests).items.map(function (it) { return it.name; }));
    Object.keys(state.bought).forEach(function (n) { if (!names.has(n)) delete state.bought[n]; });
  }

  /* ---------- Значки (всегда рядом с подписью) ---------- */
  var ICON = {
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="currentColor"/><circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="19" r="3" fill="currentColor"/><path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" stroke="currentColor" stroke-width="2"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="9" cy="19" r="1.8" fill="currentColor"/><circle cx="17" cy="19" r="1.8" fill="currentColor"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="currentColor"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7M6 9.5V20h12V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>'
  };

  /* ---------- Маршруты ---------- */
  // Терпимы к хвосту: #r/olivier/, #r/olivier?x=1, #R/Olivier.
  function parseRoute(hash) {
    var h = String(hash || '').replace(/^#\/?/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* как есть */ }
    var qi = h.indexOf('?'), query = qi >= 0 ? h.slice(qi + 1) : '';
    var path = (qi >= 0 ? h.slice(0, qi) : h).toLowerCase().replace(/\/+$/, '').trim();
    var q = dict();
    query.split('&').forEach(function (p) { if (p) { var kv = p.split('='); q[kv[0]] = kv[1] || '1'; } });
    var m;
    if ((m = /^c\/([\w-]+)$/.exec(path)) && CATS.has(m[1])) return { name: 'cat', id: m[1] };
    if ((m = /^r\/([\w-]+)$/.exec(path)) && RECIPES.has(m[1])) return { name: 'recipe', id: m[1], fromMenu: q.from === 'menu' };
    if (path === 'menu') return { name: 'menu' };
    if (path === 'shop') return { name: 'shop' };
    return { name: 'home' };
  }
  function routeKey(r) { return r ? r.name + (r.id ? '/' + r.id : '') + (r.fromMenu ? '?m' : '') : ''; }
  function parentHash(r) {
    if (r.name === 'recipe') return r.fromMenu ? '#menu' : '#c/' + rec(r.id).cat;
    if (r.name === 'shop') return '#menu';
    return '';
  }
  var current = null;

  function urlFor(hash) { return hash ? hash : location.pathname + location.search; }
  function go(hash) {
    if (hash === '#' || hash === '#/') hash = '';
    if (routeKey(parseRoute(hash)) === routeKey(current)) { window.scrollTo(0, 0); return; }
    try {
      var st = history.state || {};
      history.replaceState(Object.assign({}, st, { scroll: window.scrollY }), '');
      history.pushState({ app: true, scroll: 0 }, '', urlFor(hash));
    } catch (e) { location.hash = hash; return; }
    render();
    window.scrollTo(0, 0);
  }
  function goBack() {
    if (history.state && history.state.app) { history.back(); return; }
    var ph = parentHash(current);
    try { history.replaceState(null, '', urlFor(ph)); } catch (e) { location.hash = ph; return; }
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- Экраны ---------- */
  var app = document.getElementById('app');
  var headerTitle = document.getElementById('hdr-title');
  var backBtn = document.getElementById('hdr-back');

  function setHeader(title, showBack) {
    headerTitle.textContent = title;
    backBtn.hidden = !showBack;
    document.title = title === 'Новогодний стол' ? 'Новогодний стол: рецепты' : title + ' — Новогодний стол';
  }
  function nb(t) { return esc(t).replace(/ /g, '\u00a0'); }
  function metaLine(r) {
    var y = r.whole ? wholeText(r, 1) : 'на ' + r.serves + ' ' + plural(r.serves, PORTION);
    return nb(r.time) + ' · ' + nb(r.level) + ' · ' + nb(y).replace('\u00a0—\u00a0', '\u00a0— ');
  }

  function viewHome() {
    setHeader('Новогодний стол', false);
    var n = state.menu.length;
    var tiles = D.CATEGORIES.map(function (c) {
      var cnt = D.RECIPES.filter(function (r) { return r.cat === c.id; }).length;
      return '<a class="tile" href="#c/' + c.id + '">' +
        '<span class="tile-art">' + ART.cat(c.id) + '</span>' +
        '<span class="tile-name">' + esc(c.title) + '</span>' +
        '<span class="tile-sub">' + cnt + ' ' + plural(cnt, RECIPE_W) + '</span></a>';
    }).join('');
    return '<section class="hero">' +
      '<div class="hero-art">' + ART.hero() + '</div>' +
      '<div class="hero-text"><h1>Рецепты к Новому году</h1>' +
      '<p class="lead">Проверенная классика по шагам, меню на праздник и список покупок.</p></div>' +
      '</section>' +
      '<div class="home-actions">' +
      '<a class="big-btn primary" href="#menu">' + ICON.menu +
      '<span class="big-btn-text">Моё меню на праздник</span>' +
      '<span class="badge" data-testid="menu-count">' + (n ? n + '\u00a0' + plural(n, DISH) : 'пусто') + '</span></a>' +
      '<a class="big-btn" href="#shop">' + ICON.cart +
      '<span class="big-btn-text">Список покупок</span>' +
      '<span class="badge">' + (n ? 'на\u00a0' + guestsText(state.guests).replace(' ', '\u00a0') : 'пусто') + '</span></a>' +
      '</div>' +
      '<h2 class="sec-title">Выберите раздел</h2>' +
      '<nav class="tiles" aria-label="Разделы">' + tiles + '</nav>';
  }

  function viewCat(id) {
    var c = CATS.get(id);
    setHeader(c.title, true);
    var list = D.RECIPES.filter(function (r) { return r.cat === id; }).map(function (r) {
      var inMenu = state.menu.indexOf(r.id) >= 0;
      return '<li><a class="rcard" href="#r/' + r.id + '">' +
        '<span class="rcard-art">' + ART.dish(r.id) + '</span>' +
        '<span class="rcard-body"><span class="rcard-title">' + esc(r.title) + '</span>' +
        '<span class="rcard-meta">' + metaLine(r) + '</span>' +
        (inMenu ? '<span class="tag">' + ICON.check + 'В моём меню</span>' : '') +
        '</span></a></li>';
    }).join('');
    return '<h1 class="page-title">' + esc(c.title) + '</h1><ul class="rlist">' + list + '</ul>';
  }

  // Для целых блюд — число целых (курица, торт), для остальных — порции.
  function amountOf(r) { return own(state.portions, r.id) ? state.portions[r.id] : (r.whole ? 1 : r.serves); }
  function factorOf(r) { var a = amountOf(r); return r.whole ? a : a / r.serves; }

  function ingredientList(r, factor) {
    var html = '', lastGroup = null, open = false;
    r.ingredients.forEach(function (ing) {
      var g = ing.group || '';
      if (g !== lastGroup) {
        if (open) html += '</ul>';
        if (g) html += '<h3 class="ing-group">' + esc(g) + '</h3>';
        html += '<ul class="ings">'; open = true; lastGroup = g;
      }
      html += '<li><span class="ing-name">' + esc(ing.name) + '</span><span class="ing-q">' + fmtIng(ing, factor) + '</span></li>';
    });
    if (open) html += '</ul>';
    return html;
  }

  function menuBlock(r, shareLabel) {
    var inMenu = state.menu.indexOf(r.id) >= 0;
    var share = '<button class="btn btn-secondary" data-act="share-recipe" data-id="' + r.id + '">' + ICON.share + shareLabel + '</button>';
    if (!inMenu) {
      return '<div class="actions"><button class="btn btn-primary" data-act="menu-add" data-id="' + r.id + '">' + ICON.plus + 'Добавить в меню</button>' + share + '</div>';
    }
    return '<div class="actions"><div class="in-menu" role="status">' + ICON.check + 'В вашем меню</div>' + share + '</div>' +
      '<button class="btn btn-link remove-link" data-act="menu-del" data-id="' + r.id + '">Убрать из меню</button>';
  }

  function viewRecipe(id) {
    var r = rec(id);
    setHeader(r.title, true);
    var a = amountOf(r), factor = factorOf(r);
    var done = state.steps[r.id] || [];
    var steps = r.steps.map(function (s, k) {
      var isDone = done.indexOf(k) >= 0;
      return '<li><button class="step' + (isDone ? ' done' : '') + '" data-act="step" data-id="' + r.id + '" data-i="' + k + '" aria-pressed="' + isDone + '">' +
        '<span class="step-num">' + (k + 1) + '</span>' +
        '<span class="step-text">' + esc(s) + '</span>' +
        '<span class="step-done">' + ICON.check + 'Сделано</span></button></li>';
    }).join('');
    var max = r.whole ? MAX_WHOLE : MAX_PEOPLE;
    var label = r.whole ? 'Сколько:' : 'Порций:';
    var under = r.whole ? '<p class="note strong" data-testid="whole-note">' + esc(wholeText(r, a)) + '</p>' : '';
    if (state.fromMenu[r.id]) under += '<p class="note from-menu" data-testid="from-menu">' + (r.whole ? 'Хватит ' : 'Количества ') + 'на ' + guestsText(state.guests) + ', как в вашем меню.</p>';
    var yieldTxt = r.whole ? wholeText(r, 1) : r.serves + ' ' + plural(r.serves, PORTION);
    return '<div class="r-top"><div class="r-hero">' + ART.dish(r.id) + '</div><div class="r-head">' +
      '<h1 class="page-title">' + esc(r.title) + '</h1>' +
      '<ul class="facts">' +
      '<li><span class="fact-k">Время</span><span class="fact-v">' + esc(r.time) + (r.wait ? ' <span class="wait">' + esc(r.wait) + '</span>' : '') + '</span></li>' +
      '<li><span class="fact-k">Сложность</span><span class="fact-v">' + esc(r.level) + '</span></li>' +
      '<li><span class="fact-k">Выход</span><span class="fact-v">' + esc(yieldTxt) + (r.note ? ' (' + esc(r.note) + ')' : '') + '</span></li>' +
      '</ul></div></div>' +
      menuBlock(r, 'Поделиться') +
      '<section class="card"><h2>Ингредиенты</h2>' +
      '<div class="stepper" role="group" aria-label="' + (r.whole ? 'Сколько готовить' : 'Количество порций') + '"><span class="stepper-label">' + label + '</span>' +
      '<button class="round" data-act="por-" data-id="' + r.id + '" aria-label="Меньше"' + (a <= 1 ? ' disabled' : '') + '>−</button>' +
      '<output class="stepper-val" data-testid="portions">' + a + '</output>' +
      '<button class="round" data-act="por+" data-id="' + r.id + '" aria-label="Больше"' + (a >= max ? ' disabled' : '') + '>+</button></div>' +
      under + ingredientList(r, factor) + '</section>' +
      '<section class="card"><h2>Как готовить</h2><p class="hint">Нажмите на шаг, когда сделаете его, — он отметится.</p>' +
      '<ol class="steps">' + steps + '</ol>' +
      (done.length ? '<button class="btn btn-link" data-act="steps-reset" data-id="' + r.id + '">Снять все отметки</button>' : '') +
      '</section>' +
      '<aside class="tip"><span class="tip-k">' + ICON.star + 'Совет хозяйке</span><p>' + esc(r.tip) + '</p></aside>' +
      menuBlock(r, 'Поделиться рецептом');
  }

  function guestsStepper() {
    var g = state.guests;
    var chips = QUICK_GUESTS.map(function (v) {
      return '<button class="chip' + (v === g ? ' on' : '') + '" data-act="guests-set" data-v="' + v + '" aria-pressed="' + (v === g) + '">' + v + '</button>';
    }).join('');
    return '<div class="stepper big" role="group" aria-label="Число гостей"><span class="stepper-label">Гостей:</span>' +
      '<button class="round" data-act="guests-" aria-label="Меньше гостей"' + (g <= MIN_PEOPLE ? ' disabled' : '') + '>−</button>' +
      '<output class="stepper-val" data-testid="guests">' + g + '</output>' +
      '<button class="round" data-act="guests+" aria-label="Больше гостей"' + (g >= MAX_PEOPLE ? ' disabled' : '') + '>+</button></div>' +
      '<div class="chips" role="group" aria-label="Быстрый выбор числа гостей"><span class="chips-label">Быстро:</span>' + chips + '</div>';
  }

  function dishAmount(r) {
    if (r.whole) {
      var k = wholeCount(r, state.guests);
      var s = wholeText(r, k);
      if (state.guests <= r.serves / 2) s += ' · ' + r.whole[0] + ' целиком — останется';
      return s;
    }
    return 'на ' + state.guests + ' ' + plural(state.guests, PORTION);
  }

  function viewMenu() {
    setHeader('Моё меню', true);
    if (!state.menu.length) {
      return '<h1 class="page-title">Моё меню на праздник</h1>' +
        '<div class="empty"><div class="empty-art">' + ART.empty() + '</div>' +
        '<p>В меню пока нет блюд. Откройте любой рецепт и нажмите «Добавить в меню».</p>' +
        '<p>Или соберите готовое праздничное меню одним нажатием: два салата, горячее, закуска и сладкое.</p></div>' +
        '<div class="actions col">' +
        '<button class="btn btn-primary" data-act="ready-menu">' + ICON.star + 'Готовое меню</button>' +
        '<a class="btn btn-secondary" href="#">Выбрать блюда самому</a></div>';
    }
    var groups = D.CATEGORIES.map(function (c) {
      var ids = state.menu.filter(function (id) { return rec(id).cat === c.id; });
      if (!ids.length) return '';
      return '<h2 class="sec-title">' + esc(c.title) + '</h2><ul class="mlist">' + ids.map(function (id) {
        var r = rec(id);
        return '<li class="mitem"><a class="mitem-link" href="#r/' + id + '?from=menu">' +
          '<span class="mitem-art">' + ART.dish(id) + '</span>' +
          '<span class="mitem-body"><span class="mitem-title">' + esc(r.title) + '</span>' +
          '<span class="mitem-meta">' + esc(dishAmount(r)) + '</span></span></a>' +
          '<button class="btn btn-small" data-act="menu-remove" data-id="' + id + '" aria-label="Убрать «' + esc(r.title) + '» из меню">Убрать</button></li>';
      }).join('') + '</ul>';
    }).join('');
    var n = state.menu.length;
    return '<h1 class="page-title">Моё меню на праздник</h1>' +
      '<section class="card guests-card">' + guestsStepper() +
      '<p class="note">Все блюда пересчитаны на ' + guestsText(state.guests) + '. В меню ' + n + ' ' + plural(n, DISH) + '.</p></section>' +
      groups +
      '<div class="actions col">' +
      '<a class="btn btn-primary" href="#shop">' + ICON.cart + 'Список покупок</a>' +
      '<button class="btn btn-secondary" data-act="share-menu">' + ICON.share + 'Поделиться меню</button>' +
      '<a class="btn btn-outline" href="#">' + ICON.plus + 'Добавить ещё блюда</a></div>';
  }

  function viewShop() {
    setHeader('Список покупок', true);
    if (!state.menu.length) {
      return '<h1 class="page-title">Список покупок</h1>' +
        '<div class="empty"><div class="empty-art">' + ART.empty() + '</div>' +
        '<p>Список пуст. Он собирается сам из блюд вашего меню — с учётом числа гостей.</p></div>' +
        '<div class="actions col"><a class="btn btn-primary" href="#menu">' + ICON.menu + 'Перейти к меню</a></div>';
    }
    pruneBought();
    var list = buildShopping(state.menu, state.guests, state.bought), items = list.items;
    var total = items.length, got = items.filter(function (it) { return it.bought; }).length;
    var anyMark = Object.keys(state.bought).length > 0;
    var n = state.menu.length;
    var groups = D.DEPARTMENTS.map(function (d) {
      var dl = items.filter(function (it) { return it.dept === d.id; });
      if (!dl.length) return '';
      return '<h2 class="sec-title">' + esc(d.title) + '</h2><ul class="shop">' + dl.map(function (it) {
        return '<li class="' + (it.bought ? 'bought' : (it.partial ? 'partial' : '')) + '"><label class="chk">' +
          '<input type="checkbox" data-act="buy" data-name="' + esc(it.name) + '"' + (it.bought ? ' checked' : '') + '>' +
          '<span class="box" aria-hidden="true">' + ICON.check + '</span>' +
          '<span class="shop-main"><span class="shop-name">' + esc(it.name) + '</span>' +
          '<span class="shop-q">' + esc(it.amount) + '</span>' +
          (it.partial ? '<span class="shop-sub" data-testid="more">Куплено ' + esc(it.got) + ', докупить ' + esc(it.more) + '</span>' : '') +
          '</span></label></li>';
      }).join('') + '</ul>';
    }).join('');
    var homeBlock = list.home.length ? '<aside class="home-check"><span class="home-k">' + ICON.home + 'Проверьте, есть ли дома:</span> ' +
      '<span data-testid="home-list">' + esc(list.home.map(lower).join(', ')) + '</span></aside>' : '';
    return '<h1 class="page-title">Список покупок</h1>' +
      '<p class="lead">Для ' + n + ' ' + plural(n, ['блюда', 'блюд', 'блюд']) + ' на ' + guestsText(state.guests) + '. Нажимайте на продукт, когда купите его.</p>' +
      '<p class="progress" data-testid="progress">Куплено: <b>' + got + '</b> из ' + total + '</p>' +
      groups + homeBlock +
      '<div class="actions col">' +
      '<button class="btn btn-primary" data-act="share-shop">' + ICON.share + 'Поделиться списком</button>' +
      (anyMark ? '<button class="btn btn-outline" data-act="buy-reset">Снять все галочки</button>' : '') +
      '<a class="btn btn-outline" href="#menu">' + ICON.menu + 'Изменить меню</a></div>';
  }

  function render() {
    var r = parseRoute(location.hash), prev = current;
    current = r;
    if (r.name === 'recipe' && routeKey(r) !== routeKey(prev)) {
      // Открыли из меню — показываем количества на гостей меню.
      var rr = rec(r.id);
      if (r.fromMenu) {
        state.portions[r.id] = rr.whole ? wholeCount(rr, state.guests) : state.guests;
        state.fromMenu[r.id] = true;
      } else if (state.fromMenu[r.id]) {
        delete state.portions[r.id]; delete state.fromMenu[r.id];
      }
    }
    var html;
    if (r.name === 'cat') html = viewCat(r.id);
    else if (r.name === 'recipe') html = viewRecipe(r.id);
    else if (r.name === 'menu') html = viewMenu();
    else if (r.name === 'shop') html = viewShop();
    else html = viewHome();
    app.innerHTML = html;
    app.setAttribute('data-view', r.name);
  }

  // Перерисовать текущий экран, сохранив прокрутку и фокус (на ту же кнопку/галочку).
  function focusKey(el) {
    if (!el || !el.getAttribute || !el.getAttribute('data-act')) return null;
    var key = '[data-act="' + el.getAttribute('data-act') + '"]';
    ['data-id', 'data-name', 'data-i', 'data-v'].forEach(function (a) {
      var v = el.getAttribute(a);
      if (v !== null) key += '[' + a + '="' + String(v).replace(/["\\]/g, '\\$&') + '"]';
    });
    return key;
  }
  function rerender(fallbackKey) {
    var y = window.scrollY, key = focusKey(document.activeElement);
    render();
    window.scrollTo(0, y);
    var el = (key && app.querySelector(key)) || (fallbackKey && app.querySelector(fallbackKey));
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }

  /* ---------- Тексты «Поделиться» ---------- */
  function footer(hash) { return '\n\nРецепты к Новому году — ' + APP_URL + (hash || ''); }

  function recipeText(r) {
    var a = amountOf(r), f = factorOf(r);
    var amount = r.whole ? wholeText(r, a) : 'Порций: ' + a;
    var lines = ['🎄 ' + r.title, 'Время: ' + r.time + (r.wait ? ' ' + r.wait : '') + ' · ' + amount, '', 'Ингредиенты:'];
    var lastG = null;
    r.ingredients.forEach(function (ing) {
      if ((ing.group || '') !== lastG) { lastG = ing.group || ''; if (lastG) lines.push(lastG + ':'); }
      lines.push('• ' + ing.name + ' — ' + fmtIng(ing, f));
    });
    lines.push('', 'Как готовить:');
    r.steps.forEach(function (s, k) { lines.push((k + 1) + '. ' + s); });
    lines.push('', 'Совет: ' + r.tip);
    return lines.join('\n') + footer('#r/' + r.id);
  }
  function menuText() {
    var lines = ['🎄 Наше меню на Новый год (на ' + guestsText(state.guests) + '):', ''];
    D.CATEGORIES.forEach(function (c) {
      var ids = state.menu.filter(function (id) { return rec(id).cat === c.id; });
      if (!ids.length) return;
      lines.push(c.title + ': ' + ids.map(function (id) { return rec(id).title; }).join(', '));
    });
    return lines.join('\n') + footer('');
  }
  function shopText() {
    var list = buildShopping(state.menu, state.guests, state.bought);
    var left = list.items.filter(function (it) { return !it.bought; });
    var partial = left.length < list.items.length;
    var lines = ['🛒 Список покупок к новогоднему столу (' + guestsText(state.guests) + ')' + (partial ? ' — ещё купить:' : ':')];
    D.DEPARTMENTS.forEach(function (d) {
      var dl = left.filter(function (it) { return it.dept === d.id; });
      if (!dl.length) return;
      lines.push('', d.title + ':');
      dl.forEach(function (it) { lines.push('• ' + it.name + ' — ' + (it.partial ? 'докупить ' + it.more : it.amount)); });
    });
    if (!left.length) lines.push('', 'Всё куплено!');
    if (list.home.length) lines.push('', 'Проверьте, есть ли дома: ' + list.home.map(lower).join(', ') + '.');
    return lines.join('\n') + footer('');
  }

  /* ---------- Плашка, копирование, окно ---------- */
  var toastEl = document.getElementById('toast');
  var toastTimer = null, toastUndo = null;
  function toast(msg, undo) {
    toastUndo = undo || null;
    toastEl.innerHTML = '<span class="toast-msg">' + esc(msg) + '</span>' +
      (undo ? '<button type="button" class="toast-undo" data-toast-undo>Вернуть</button>' : '');
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 5000 : 3200);
  }
  function hideToast() { toastEl.classList.remove('show'); toastUndo = null; }
  toastEl.addEventListener('click', function (e) {
    if (e.target.closest('[data-toast-undo]') && toastUndo) { var u = toastUndo; hideToast(); u(); }
  });

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  var modal = document.getElementById('copy-modal');
  var modalReturn = null;
  function showManualCopy(text) {
    modalReturn = document.activeElement;
    var ta = modal.querySelector('textarea');
    ta.value = text;
    modal.hidden = false;
    ta.focus();
    ta.select();
  }
  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    if (modalReturn && modalReturn.focus && document.contains(modalReturn)) modalReturn.focus();
    modalReturn = null;
  }
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.getElementById('copy-close').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key === 'Tab') { // фокус держится в окне
      var f = Array.prototype.slice.call(modal.querySelectorAll('textarea, button'));
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  function copyText(text) {
    function done() { toast('Скопировано — вставьте в сообщение'); }
    function fallback() { if (legacyCopy(text)) done(); else showManualCopy(text); }
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); return; }
    } catch (e) { /* дальше */ }
    fallback();
  }
  function share(title, text) {
    window.__lastShare = text; // для автотеста
    if (navigator.share) {
      try {
        navigator.share({ title: title, text: text }).catch(function (err) {
          if (err && err.name === 'AbortError') return; // человек сам закрыл окно
          copyText(text);
        });
        return;
      } catch (e) { /* дальше */ }
    }
    copyText(text);
  }

  /* ---------- Действия ---------- */
  var lastMenuTap = dict();
  function menuLocked(id) {
    var now = Date.now();
    if (lastMenuTap[id] && now - lastMenuTap[id] < 600) return true;
    lastMenuTap[id] = now;
    return false;
  }
  function addToMenu(id, at) {
    if (state.menu.indexOf(id) >= 0) return;
    if (typeof at === 'number' && at >= 0 && at <= state.menu.length) state.menu.splice(at, 0, id);
    else state.menu.push(id);
  }
  function removeFromMenu(id, fallbackKey) {
    var k = state.menu.indexOf(id);
    if (k < 0) return;
    state.menu.splice(k, 1);
    pruneBought(); save(); rerender(fallbackKey);
    toast('Убрано: ' + rec(id).title, function () {
      addToMenu(id, k); save(); rerender();
    });
  }

  var actions = {
    'menu-add': function (el) {
      var id = el.getAttribute('data-id');
      if (menuLocked(id)) return;
      addToMenu(id); save(); rerender('[data-act="menu-del"][data-id="' + id + '"]'); toast('Добавлено в меню');
    },
    'menu-del': function (el) {
      var id = el.getAttribute('data-id');
      if (menuLocked(id)) return;
      removeFromMenu(id, '[data-act="menu-add"][data-id="' + id + '"]');
    },
    'menu-remove': function (el) { removeFromMenu(el.getAttribute('data-id'), '[data-act="guests+"]'); },
    'ready-menu': function () {
      state.menu = D.READY_MENU.slice();
      save(); rerender(); window.scrollTo(0, 0); toast('Готовое меню собрано');
    },
    'por-': function (el) { changeAmount(el.getAttribute('data-id'), -1); },
    'por+': function (el) { changeAmount(el.getAttribute('data-id'), 1); },
    'guests-': function () { setGuests(state.guests - 1); },
    'guests+': function () { setGuests(state.guests + 1); },
    'guests-set': function (el) { setGuests(+el.getAttribute('data-v')); },
    'step': function (el) {
      var id = el.getAttribute('data-id'), k = +el.getAttribute('data-i');
      var arr = (state.steps[id] || []).slice(), pos = arr.indexOf(k);
      if (pos >= 0) arr.splice(pos, 1); else arr.push(k);
      if (arr.length) state.steps[id] = arr; else delete state.steps[id];
      save(); rerender();
    },
    'steps-reset': function (el) { delete state.steps[el.getAttribute('data-id')]; save(); rerender('.step'); },
    'buy-reset': function () { state.bought = dict(); save(); rerender('[data-act="share-shop"]'); },
    'share-recipe': function (el) { var r = rec(el.getAttribute('data-id')); share(r.title, recipeText(r)); },
    'share-menu': function () { share('Наше меню на Новый год', menuText()); },
    'share-shop': function () { share('Список покупок', shopText()); }
  };
  function setGuests(v) {
    state.guests = clamp(v, MIN_PEOPLE, MAX_PEOPLE);
    save(); rerender();
  }
  function changeAmount(id, d) {
    var r = rec(id);
    state.portions[id] = clamp(amountOf(r) + d, 1, r.whole ? MAX_WHOLE : MAX_PEOPLE);
    delete state.fromMenu[id];
    rerender();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el && el.tagName !== 'INPUT' && own(actions, el.getAttribute('data-act'))) {
      e.preventDefault();
      actions[el.getAttribute('data-act')](el);
      return;
    }
    var a = e.target.closest('a[href^="#"]');
    if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      go(a.getAttribute('href'));
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('data-act') === 'buy') {
      var name = el.getAttribute('data-name');
      if (el.checked) {
        var v = needs(state.menu, state.guests).get(name);
        if (v) state.bought[name] = roundNeed(name, v);
      } else delete state.bought[name];
      save(); rerender();
    }
  });
  backBtn.addEventListener('click', function () { goBack(); });
  window.addEventListener('popstate', function (e) {
    render();
    window.scrollTo(0, e.state && e.state.scroll ? e.state.scroll : 0);
  });
  window.addEventListener('hashchange', function () {
    if (routeKey(parseRoute(location.hash)) !== routeKey(current)) { render(); window.scrollTo(0, 0); }
  });

  load();
  render();

  // Для автотеста и проверяющих.
  window.NYR = { buildShopping: buildShopping, fmtIng: fmtIng, fmtShop: fmtShop, state: state, menuFactor: menuFactor, parseRoute: parseRoute };
})();
