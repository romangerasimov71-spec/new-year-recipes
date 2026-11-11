/* Новогодний стол: рецепты — логика приложения. */
(function () {
  'use strict';

  var D = window.NYR_DATA;
  var ART = window.NYR_ART;
  var PF = window.Platform || null;
  var AN = window.Analytics || { event: function () {}, once: function () {}, ready: function () {}, init: function () {} };
  var CFG = window.APP_CONFIG || {};
  var LEGACY_KEY = 'nyr.v1'; // сохранение прототипа (localStorage) — переносится один раз
  // Ключи хранилища площадки (во ВК/ОК — облако человека, у ВК предел 4 КБ на ключ; без площадки — localStorage).
  var K = { menu: 'nyr_menu', bought: 'nyr_bought', steps: 'nyr_steps', plan: 'nyr_plan', visits: 'nyr_visits' };
  var KEY_LIST = [K.menu, K.bought, K.steps, K.plan, K.visits];
  var VALUE_MAX = 4000;
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
  // Разобрать сохранённое (формат прототипа: {menu, guests, bought, steps}); всё чужое и битое пропускаем.
  function applyState(s) {
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
  // Служебное: открытый план, заходы, «в избранное», подсказка первого запуска.
  var meta = { plan: null, visits: { n: 0, day: 0, fav: '', favShown: 0, intro: 0 } };

  function packBought() {
    var o = {};
    Object.keys(state.bought).forEach(function (name) {
      var b = state.bought[name];
      o[name] = [b.mass, b.vol, b.pcs, b.sp].map(function (v) { return Math.round(v * 1000) / 1000; });
    });
    return o;
  }
  function unpackBought(o) {
    if (!isObj(o)) return null;
    var out = {};
    Object.keys(o).forEach(function (name) {
      var v = o[name];
      if (Array.isArray(v)) out[name] = { mass: v[0], vol: v[1], pcs: v[2], sp: v[3] };
    });
    return out;
  }
  function legacyRead() {
    try {
      var raw = window.localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      window.localStorage.removeItem(LEGACY_KEY);
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  // Прочитанное при запуске (Platform.load) — в state и meta.
  function applyLoaded(data) {
    data = isObj(data) ? data : {};
    var legacy = legacyRead();
    if (legacy) applyState(legacy);
    else {
      var m = isObj(data[K.menu]) ? data[K.menu] : {};
      applyState({ menu: m.m, guests: m.g, steps: data[K.steps], bought: unpackBought(data[K.bought]) });
    }
    var p = data[K.plan];
    if (isObj(p) && typeof p.day === 'number' && typeof p.menu === 'string') {
      meta.plan = { day: p.day, menu: p.menu, t: TABLE_HOURS.indexOf(p.t) >= 0 ? p.t : DEFAULT_TABLE };
    }
    var v = data[K.visits];
    if (isObj(v)) {
      meta.visits = {
        n: Math.min(100000, Math.max(0, Math.round(num(v.n)))), day: Math.round(num(v.day)),
        fav: v.fav === 'added' || v.fav === 'declined' ? v.fav : '', favShown: Math.round(num(v.favShown)),
        intro: v.intro ? 1 : 0
      };
    }
    if (legacy) save();
  }

  // Сохранение: изменённые ключи собираются и уходят одним вызовом через 300 мс
  // (и сразу — когда приложение сворачивают или закрывают).
  var dirty = {}, saveTimer = null, lastSaved = {};
  function fit(obj) { // у ВК предел 4 КБ на значение — лишнее (самые старые записи) отбрасываем
    var keys = Object.keys(obj);
    while (keys.length && JSON.stringify(obj).length > VALUE_MAX) delete obj[keys.shift()];
    return obj;
  }
  function snapshot(k) {
    if (k === K.menu) return { m: state.menu, g: state.guests };
    if (k === K.bought) return fit(packBought());
    if (k === K.steps) return fit(Object.assign({}, state.steps));
    if (k === K.plan) return meta.plan;
    if (k === K.visits) return meta.visits;
    return null;
  }
  function save(keys) {
    (keys || [K.menu, K.bought, K.steps]).forEach(function (k) { dirty[k] = true; });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 300);
  }
  function flushSave() {
    clearTimeout(saveTimer); saveTimer = null;
    var out = {}, any = false;
    Object.keys(dirty).forEach(function (k) {
      var v = snapshot(k), str = JSON.stringify(v);
      if (str !== lastSaved[k]) { out[k] = v; lastSaved[k] = str; any = true; }
    });
    dirty = {};
    if (!any) return;
    if (PF) PF.save(out);
    else {
      try { Object.keys(out).forEach(function (k) { window.localStorage.setItem(k, JSON.stringify(out[k])); }); } catch (e) { /* ничего страшного */ }
    }
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
  // Слова для порций: у напитков — кружки и стаканы, у десертов в банке — баночки.
  function portionForms(r) { return r.portion || PORTION; }
  function portionsOf(r, n) { return n + ' ' + plural(n, portionForms(r)); }
  /* ---------- Разделы ----------
     Базовые разделы — плитки на главной; «Модный стол» (featured) — плашка «Новинка».
     Модное блюдо (cat: 'trendy') показывается и в своём базовом разделе (alsoIn) — после классики. */
  var BASE_CATS = D.CATEGORIES.filter(function (c) { return !c.featured; });
  var FEATURED = D.CATEGORIES.filter(function (c) { return c.featured; });
  function recipesIn(id) {
    var own = D.RECIPES.filter(function (r) { return r.cat === id; });
    return own.concat(D.RECIPES.filter(function (r) { return r.alsoIn === id && r.cat !== id; }));
  }
  // «4–5 порций»: форма слова — по последнему числу.
  function portionsWord(t) { return plural(+String(t).split('–').pop(), PORTION); }
  function wholeText(r, k) {
    var t = servesText(r).split('–').map(function (x) { return String(k * +x); }).join('–');
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
    zoom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m15.5 15.5 5 5M10.5 7.5v6M7.5 10.5h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="currentColor"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7M6 9.5V20h12V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m8.5 14.5 2.2 2.2 4.6-4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="2" fill="currentColor"/><path d="m4 18 5-5 3 3 3-3 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 16V5a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
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
    if (path === 'plan') return { name: 'plan' };
    if (path === 'about') return { name: 'about' };
    return { name: 'home' };
  }
  function routeKey(r) { return r ? r.name + (r.id ? '/' + r.id : '') + (r.fromMenu ? '?m' : '') : ''; }
  function parentHash(r) {
    if (r.name === 'recipe') return r.fromMenu ? '#menu' : '#c/' + rec(r.id).cat;
    if (r.name === 'shop' || r.name === 'plan') return '#menu';
    return '';
  }
  var current = null;

  function urlFor(hash) { return hash ? hash : location.pathname + location.search; }
  function go(hash) {
    if (hash === '#' || hash === '#/') hash = '';
    bannerHold = false; // первый экран первого запуска закончился — баннер можно
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
    bannerHold = false;
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
    var y = r.whole ? wholeText(r, 1) : 'на ' + portionsOf(r, r.serves);
    return nb(r.time) + ' · ' + nb(r.level) + ' · ' + nb(y).replace('\u00a0—\u00a0', '\u00a0— ');
  }

  /* ---------- Фото блюд (Higgsfield) ----------
     img/photo/full/<id>.webp — 960×720, img/photo/thumb/<id>.webp — 480×360, всё 4:3.
     Если фото не загрузилось — на его месте рисунок из art.js (data-fb: dish:<id>, cat:<id>, hero). */
  var PHOTO = 'img/photo/';
  function photo(id, size, alt, fb, first, extra) {
    var w = size === 'full' ? 960 : 480;
    return '<img class="photo" src="' + PHOTO + size + '/' + id + '.webp"' + (extra || '') +
      ' alt="' + esc(alt) + '" width="' + w + '" height="' + (w * 3 / 4) + '"' +
      (first ? ' decoding="async"' : ' loading="lazy" decoding="async"') +
      ' data-fb="' + fb + '" onerror="NYR_PHOTO_FAIL(this)">';
  }
  function fallbackArt(fb) {
    var k = fb.split(':');
    if (k[0] === 'cat') return ART.cat(k[1]);
    if (k[0] === 'hero') return ART.hero();
    return ART.dish(k[1]);
  }
  window.NYR_PHOTO_FAIL = function (img) {
    var box = img.parentNode;
    if (!box) return;
    box.classList.add('photo-failed');
    box.innerHTML = fallbackArt(img.getAttribute('data-fb') || '');
  };
  // photo: false в данных — фото ещё нет: сразу рисунок, файл не запрашиваем.
  function dishPhoto(r, size, first) { return r.photo === false ? ART.dish(r.id) : photo(r.id, size, r.title, 'dish:' + r.id, first); }
  function catPhoto(c, size) { return c.photo === false ? ART.cat(c.id) : photo('cat-' + c.id, size, c.title, 'cat:' + c.id, false); }

  /* ---------- Фото шагов ----------
     img/photo/steps/full/<id>-<N>.webp (960×720) и img/photo/steps/thumb/<id>-<N>.webp (480×360), N — номер шага. */
  function stepPhotoNums(r) {
    var v = r.stepPhotos, out = [];
    if (typeof v === 'number') for (var n = 1; n <= Math.min(v, r.steps.length); n++) out.push(n);
    else if (Array.isArray(v)) v.forEach(function (n) { if (n >= 1 && n <= r.steps.length && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  function stepPhotoSrc(r, k, size) { return PHOTO + 'steps/' + size + '/' + r.id + '-' + (k + 1) + '.webp'; }
  function stepAlt(r, k) {
    var t = r.steps[k];
    if (t.length > 70) t = t.slice(0, 70).replace(/[\s,—–-]+[^\s]*$/, '') + '…';
    return 'Шаг ' + (k + 1) + ': ' + t;
  }
  function stepPhotoButton(r, k) {
    return '<button class="step-photo" type="button" data-act="step-photo" data-id="' + r.id + '" data-i="' + k + '" aria-label="Открыть фото крупно: шаг ' + (k + 1) + '">' +
      '<img src="' + stepPhotoSrc(r, k, 'thumb') + '" alt="' + esc(stepAlt(r, k)) + '" width="480" height="360" loading="lazy" decoding="async" onerror="NYR_STEP_PHOTO_FAIL(this)">' +
      '<span class="step-photo-zoom" aria-hidden="true">' + ICON.zoom + 'Крупнее</span></button>';
  }
  // Фото шага не загрузилось — убираем блок фото целиком.
  window.NYR_STEP_PHOTO_FAIL = function (img) {
    var b = img.closest ? img.closest('.step-photo') : img.parentNode, li = b && b.parentNode;
    if (!b || !li) return;
    li.removeChild(b);
    li.classList.remove('has-photo');
  };

  /* ---------- Листание главного фото рецепта ----------
     У рецепта gallery: N — всего кадров вместе с главным. Кадр 1 — главное фото img/photo/<size>/<id>.webp,
     кадры 2…N — img/photo/gallery/<size>/<id>-<n>.webp (960×720 и 480×360).
     Кадр 1 грузится сразу, кадр 2 — после показа страницы, остальные — когда до них близко.
     Кадр, который не загрузился, выпадает из ленты; если не загрузилось ничего — рисунок, как у всех. */
  var GAL_CAPTION = { 1: 'Готовое блюдо', 2: 'Крупно', 3: 'Порция', 4: 'За столом', 5: 'Подача' };
  var galMem = dict(); // id → { pos, failed: [номера кадров], loaded: [номера кадров] } — только в памяти
  function galCount(r) {
    var n = r.gallery;
    return typeof n === 'number' && n >= 2 && r.photo !== false ? Math.min(Math.floor(n), 12) : 0;
  }
  function galState(id) { return galMem[id] || (galMem[id] = { pos: 0, failed: [], loaded: [] }); }
  function galFrames(r) {
    var g = galState(r.id), out = [];
    for (var n = 1; n <= galCount(r); n++) if (g.failed.indexOf(n) < 0) out.push(n);
    return out;
  }
  function galSrc(id, n, size) { return n === 1 ? PHOTO + size + '/' + id + '.webp' : PHOTO + 'gallery/' + size + '/' + id + '-' + n + '.webp'; }
  function galCaption(n) { return GAL_CAPTION[n] || 'Фото ' + n; }
  function galAlt(r, n) { return n === 1 ? r.title : r.title + ' — ' + galCaption(n).toLowerCase(); }
  function galDots(count, pos) {
    var s = '';
    for (var k = 0; k < count; k++) s += '<span class="gal-dot' + (k === pos ? ' on' : '') + '"></span>';
    return s;
  }
  // Главное фото на странице рецепта: обычное фото или лента с листанием.
  function recipeHero(r) {
    if (!galCount(r)) return '<div class="r-hero">' + dishPhoto(r, 'full', true) + '</div>';
    var frames = galFrames(r), g = galState(r.id);
    if (!frames.length) return '<div class="r-hero photo-failed">' + ART.dish(r.id) + '</div>';
    var pos = g.pos = clamp(g.pos, 0, frames.length - 1), many = frames.length > 1;
    var slides = frames.map(function (n, k) {
      var cur = k === pos;
      if (cur && g.loaded.indexOf(n) < 0) g.loaded.push(n);
      return '<button class="gal-slide" type="button" data-act="gal-open" data-id="' + r.id + '" data-n="' + n + '"' +
        (cur ? '' : ' tabindex="-1" aria-hidden="true"') + ' aria-label="Открыть фото крупно: ' + esc(galAlt(r, n)) + '">' +
        '<img class="photo" ' + (g.loaded.indexOf(n) >= 0 ? 'src' : 'data-src') + '="' + galSrc(r.id, n, 'full') + '" alt="' + esc(galAlt(r, n)) + '"' +
        ' width="960" height="720" decoding="async" draggable="false" onerror="NYR_GAL_FAIL(this)"></button>';
    }).join('');
    return '<div class="r-gal" data-gal="' + r.id + '">' +
      '<div class="r-hero gal" role="group" aria-roledescription="листание фото" aria-label="Фото блюда: ' + esc(r.title) + '">' +
        '<div class="gal-view"><div class="gal-track" style="transform:translateX(' + (-pos * 100) + '%)">' + slides + '</div></div>' +
        '<button class="gal-arrow gal-prev" type="button" data-act="gal-prev" data-id="' + r.id + '" aria-label="Предыдущее фото"' +
          (pos === 0 ? ' disabled' : '') + (many ? '' : ' hidden') + '>‹</button>' +
        '<button class="gal-arrow gal-next" type="button" data-act="gal-next" data-id="' + r.id + '" aria-label="Следующее фото"' +
          (pos === frames.length - 1 ? ' disabled' : '') + (many ? '' : ' hidden') + '>›</button>' +
      '</div>' +
      '<div class="gal-bar"' + (many ? '' : ' hidden') + '><span class="gal-dots" aria-hidden="true">' + galDots(frames.length, pos) + '</span>' +
        '<span class="gal-count" data-testid="gal-count" aria-live="polite">' + (pos + 1) + ' из ' + frames.length + '</span></div>' +
    '</div>';
  }
  function galRoot() { return app.querySelector('.r-gal'); }
  function galSlides(root) { return Array.prototype.slice.call(root.querySelectorAll('.gal-slide')); }
  function galLoadSlide(root, s) {
    var img = s && s.querySelector('img[data-src]');
    if (!img) return;
    var g = galState(root.getAttribute('data-gal')), n = +s.getAttribute('data-n');
    if (g.loaded.indexOf(n) < 0) g.loaded.push(n);
    img.setAttribute('src', img.getAttribute('data-src'));
    img.removeAttribute('data-src');
  }
  function galLoadAround(root, pos) {
    var slides = galSlides(root);
    [pos, pos + 1, pos - 1].forEach(function (p) { if (p >= 0 && p < slides.length) galLoadSlide(root, slides[p]); });
  }
  // Показать кадр pos (с плавной доводкой; instant — сразу, без анимации).
  function galShow(pos, instant) {
    var root = galRoot();
    if (!root) return;
    var g = galState(root.getAttribute('data-gal')), slides = galSlides(root), n = slides.length;
    if (!n) return;
    var was = g.pos;
    pos = g.pos = clamp(pos, 0, n - 1);
    var gid = root.getAttribute('data-gal');
    if (!instant && pos !== was && !swiped[gid]) { swiped[gid] = true; AN.event('gallery_swiped', { recipe_id: gid }); }
    var track = root.querySelector('.gal-track');
    if (instant) track.classList.add('dragging'); else track.classList.remove('dragging');
    track.style.transform = 'translateX(' + (-pos * 100) + '%)';
    if (instant) { void track.offsetWidth; track.classList.remove('dragging'); }
    slides.forEach(function (s, k) {
      if (k === pos) { s.removeAttribute('tabindex'); s.removeAttribute('aria-hidden'); }
      else { s.setAttribute('tabindex', '-1'); s.setAttribute('aria-hidden', 'true'); }
    });
    var prev = root.querySelector('.gal-prev'), next = root.querySelector('.gal-next'), bar = root.querySelector('.gal-bar');
    var focusLost = document.activeElement === prev && pos === 0 || document.activeElement === next && pos === n - 1;
    prev.disabled = pos === 0; next.disabled = pos === n - 1;
    prev.hidden = next.hidden = bar.hidden = n < 2;
    root.querySelector('.gal-dots').innerHTML = galDots(n, pos);
    root.querySelector('.gal-count').textContent = (pos + 1) + ' из ' + n;
    if (focusLost) slides[pos].focus({ preventScroll: true });
    galLoadAround(root, pos);
  }
  // Кадр не загрузился: убрать из ленты (и запомнить, чтобы не показывать после перерисовки).
  function galDrop(id, n) {
    var g = galState(id);
    if (g.failed.indexOf(n) < 0) g.failed.push(n);
    var root = app.querySelector('.r-gal[data-gal="' + id + '"]');
    if (!root) return;
    var slides = galSlides(root), s = root.querySelector('.gal-slide[data-n="' + n + '"]'), k = slides.indexOf(s);
    if (k < 0) return;
    var hadFocus = s.contains(document.activeElement);
    s.parentNode.removeChild(s);
    if (slides.length === 1) { // не загрузилось ничего — рисунок вместо фото, как у рецептов без листания
      var box = document.createElement('div');
      box.className = 'r-hero photo-failed';
      box.innerHTML = ART.dish(id);
      root.parentNode.replaceChild(box, root);
      return;
    }
    galShow(k < g.pos ? g.pos - 1 : g.pos, true);
    if (hadFocus) galSlides(root)[g.pos].focus({ preventScroll: true });
  }
  window.NYR_GAL_FAIL = function (img) {
    var s = img.closest ? img.closest('.gal-slide') : null, src = img.getAttribute('src') || '';
    if (!s) return;
    if (src.indexOf('/full/') >= 0) { img.setAttribute('src', src.replace('/full/', '/thumb/')); return; } // сначала маленькое
    var root = s.closest('.r-gal');
    if (root) galDrop(root.getAttribute('data-gal'), +s.getAttribute('data-n'));
  };
  // После показа страницы — подгрузить соседний кадр (когда текущий загрузился).
  function galInit() {
    var root = galRoot();
    if (!root) return;
    var g = galState(root.getAttribute('data-gal')), cur = galSlides(root)[g.pos], img = cur && cur.querySelector('img');
    if (!img) return;
    var go = function () { if (root.isConnected !== false && document.contains(root)) galLoadAround(root, g.pos); };
    if (img.complete) setTimeout(go, 0); else { img.addEventListener('load', go); img.addEventListener('error', go); }
  }

  /* ---------- Даты: «Блюдо дня», счётчик до Нового года, план по дням ---------- */
  // Для проверок можно подменить «сегодня»: window.__NYR_TODAY = '2026-12-30' (до запуска).
  function today() {
    var t = window.__NYR_TODAY;
    if (typeof t === 'string' && /^\d{4}-\d\d-\d\d$/.test(t)) { var p = t.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
    return new Date();
  }
  function dayNum(d) { d = d || today(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function daysToNewYear() { var d = today(); return dayNum(new Date(d.getFullYear() + 1, 0, 1, 12)) - dayNum(d); }
  var DAYS_W = ['день', 'дня', 'дней'];
  // Одно блюдо на день, одинаковое у всех: порядок перемешан один раз (постоянное зерно), дальше по кругу.
  var DAY_ORDER = (function () {
    var ids = D.RECIPES.map(function (r) { return r.id; }).sort(), seed = 20261231;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), x = ids[i]; ids[i] = ids[j]; ids[j] = x; }
    return ids;
  })();
  function dishOfDay() { var n = dayNum(); return rec(DAY_ORDER[((n % DAY_ORDER.length) + DAY_ORDER.length) % DAY_ORDER.length]); }

  function countdownHtml() {
    var n = daysToNewYear();
    if (n > 61 || n < 1) return '';
    var t = n === 1 ? 'Новый год — уже этой ночью!' : 'До Нового года ' + n + ' ' + plural(n, DAYS_W);
    return '<span class="hero-count" data-testid="countdown">' + esc(t) + '</span>';
  }
  function dayDishHtml() {
    var r = dishOfDay();
    if (!r) return '';
    return '<a class="day-dish" href="#r/' + r.id + '" data-src="day" data-testid="day-dish">' +
      '<span class="day-dish-art">' + dishPhoto(r, 'thumb', false) + '</span>' +
      '<span class="day-dish-body"><span class="tag tag-day">' + ICON.star + 'Блюдо дня</span>' +
      '<span class="day-dish-title">' + esc(r.title) + '</span>' +
      '<span class="rcard-meta">' + metaLine(r) + '</span>' +
      '<span class="day-dish-note">Завтра — новое блюдо</span></span></a>';
  }
  // Первый запуск: коротко — как пользоваться, и метка возраста.
  function introHtml() {
    if (meta.visits.intro || meta.visits.n > 1) return '';
    return '<section class="card intro" data-testid="intro"><h2>Как пользоваться</h2><ol class="intro-list">' +
      '<li>Откройте рецепт и нажмите <b>«Добавить в меню»</b>.</li>' +
      '<li><b>Список покупок</b> соберётся сам — на нужное число гостей.</li>' +
      '<li>В меню можно получить <b>план готовки по дням</b>.</li></ol>' +
      '<p class="note">Приложение для всех возрастов — <b class="age">' + esc(CFG.AGE || '0+') + '</b></p>' +
      '<button class="btn btn-secondary" data-act="intro-ok">Понятно</button></section>';
  }
  // «В избранное / на главный экран» — с 3-го захода, только во ВК; отказался — больше не предлагаем.
  var favShownNow = false;
  function favHtml() {
    var v = meta.visits, kinds = PF && PF.favoriteKinds ? PF.favoriteKinds() : [];
    if (!kinds.length || v.fav || v.n < (CFG.FAVORITES_FROM_VISIT || 3) || (v.favShown >= 3 && !favShownNow)) return '';
    if (!favShownNow) { favShownNow = true; v.favShown++; save([K.visits]); AN.event('fav_offer_shown', { kinds: kinds.join('_') }); }
    return '<section class="card fav" data-testid="fav-offer"><h2>Пригодится к празднику</h2>' +
      '<p>Добавьте «Новогодний стол» в избранное — меню и список покупок будут под рукой.</p>' +
      '<div class="actions">' +
      '<button class="btn btn-primary" data-act="fav-add" data-kind="favorites">' + ICON.star + 'В избранное</button>' +
      (kinds.indexOf('home') >= 0 ? '<button class="btn btn-secondary" data-act="fav-add" data-kind="home">' + ICON.home + 'На главный экран</button>' : '') +
      '</div><button class="btn btn-link" data-act="fav-no">Нет, спасибо</button></section>';
  }

  function viewHome() {
    setHeader('Новогодний стол', false);
    var n = state.menu.length;
    var tiles = BASE_CATS.map(function (c) {
      var cnt = recipesIn(c.id).length;
      return '<a class="tile" href="#c/' + c.id + '">' +
        '<span class="tile-art">' + catPhoto(c, 'thumb') + '</span>' +
        '<span class="tile-name">' + esc(c.title) + '</span>' +
        '<span class="tile-sub">' + cnt + ' ' + plural(cnt, RECIPE_W) + '</span></a>';
    }).join('');
    // Плашка «Модный стол» — сразу под кнопками меню и покупок, над плитками разделов.
    var banners = FEATURED.map(function (c) {
      var cnt = recipesIn(c.id).length;
      return '<a class="feature" href="#c/' + c.id + '" data-testid="feature-' + c.id + '">' +
        '<span class="feature-art">' + catPhoto(c, 'thumb') + '</span>' +
        '<span class="feature-body"><span class="feature-new">Новинка</span>' +
        '<span class="feature-name">' + esc(c.title) + '</span>' +
        '<span class="feature-sub">' + esc(c.sub || '') + (c.sub ? ' · ' : '') + cnt + '\u00a0' + plural(cnt, RECIPE_W) + '</span></span>' +
        '<span class="feature-go" aria-hidden="true">\u203A</span></a>';
    }).join('');
    return '<section class="hero">' +
      '<div class="hero-art">' + countdownHtml() + photo('hero', 'thumb', 'Праздничный новогодний стол', 'hero', true,
        ' srcset="' + PHOTO + 'thumb/hero.webp 480w, ' + PHOTO + 'full/hero.webp 960w" sizes="(min-width: 600px) 300px, 100vw" fetchpriority="high"') + '</div>' +
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
      '</div>' + banners + introHtml() + favHtml() + dayDishHtml() +
      '<h2 class="sec-title">Выберите раздел</h2>' +
      '<nav class="tiles" aria-label="Разделы">' + tiles + '</nav>' +
      '<footer class="app-foot"><a class="btn btn-link" href="#about">О приложении</a><span class="age-mark" aria-label="Возраст: ' + esc(CFG.AGE || '0+') + '">' + esc(CFG.AGE || '0+') + '</span></footer>';
  }

  function rcard(r, k, catId) {
    var inMenu = state.menu.indexOf(r.id) >= 0, trendy = r.cat !== catId;
    return '<li><a class="rcard" href="#r/' + r.id + '">' +
      '<span class="rcard-art">' + dishPhoto(r, 'thumb', k < 4) + '</span>' +
      '<span class="rcard-body"><span class="rcard-title">' + esc(r.title) + '</span>' +
      '<span class="rcard-meta">' + metaLine(r) + '</span>' +
      (trendy || inMenu ? '<span class="tags">' + (trendy ? '<span class="tag tag-trendy">Модное</span>' : '') +
        (inMenu ? '<span class="tag">' + ICON.check + 'В моём меню</span>' : '') + '</span>' : '') +
      '</span></a></li>';
  }
  function viewCat(id) {
    var c = CATS.get(id);
    setHeader(c.title, true);
    var list = recipesIn(id), html, k = 0;
    if (c.groups) {
      // «Модный стол»: подзаголовки по базовым разделам; напитки — свой подзаголовок.
      html = c.groups.map(function (g) {
        var part = list.filter(function (r) { return (r.alsoIn || 'drinks') === g.id; });
        if (!part.length) return '';
        return '<h2 class="sec-title">' + esc(g.title) + '</h2><ul class="rlist">' +
          part.map(function (r) { return rcard(r, k++, id); }).join('') + '</ul>';
      }).join('');
    } else {
      html = '<ul class="rlist">' + list.map(function (r) { return rcard(r, k++, id); }).join('') + '</ul>';
    }
    return '<h1 class="page-title">' + esc(c.title) + '</h1>' + (c.sub ? '<p class="lead cat-sub">' + esc(c.sub) + '</p>' : '') + html;
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
    var withPhoto = stepPhotoNums(r);
    var steps = r.steps.map(function (s, k) {
      var isDone = done.indexOf(k) >= 0, ph = withPhoto.indexOf(k + 1) >= 0;
      // Шаг с фото: текст — кнопка «Сделано» (как у всех шагов), фото — отдельная кнопка «открыть крупно».
      return '<li class="step-li' + (ph ? ' has-photo' : '') + (isDone ? ' done' : '') + '">' +
        '<button class="step' + (isDone ? ' done' : '') + '" data-act="step" data-id="' + r.id + '" data-i="' + k + '" aria-pressed="' + isDone + '">' +
        '<span class="step-num">' + (k + 1) + '</span>' +
        '<span class="step-text">' + esc(s) + '</span>' +
        '<span class="step-done">' + ICON.check + 'Сделано</span></button>' +
        (ph ? stepPhotoButton(r, k) : '') + '</li>';
    }).join('');
    var max = r.whole ? MAX_WHOLE : MAX_PEOPLE;
    var label = r.whole ? 'Сколько:' : cap(portionForms(r)[2]) + ':';
    var under = r.whole ? '<p class="note strong" data-testid="whole-note">' + esc(wholeText(r, a)) + '</p>' : '';
    if (state.fromMenu[r.id]) under += '<p class="note from-menu" data-testid="from-menu">' + (r.whole ? 'Хватит ' : 'Количества ') + 'на ' + guestsText(state.guests) + ', как в вашем меню.</p>';
    var yieldTxt = r.whole ? wholeText(r, 1) : portionsOf(r, r.serves);
    return '<div class="r-top">' + recipeHero(r) + '<div class="r-head">' +
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
      '<section class="card"><h2>Как готовить</h2><p class="hint">Нажмите на шаг, когда сделаете его, — он отметится.' +
      (withPhoto.length ? ' Нажмите на фото — оно откроется крупно.' : '') + '</p>' +
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
    return 'на ' + portionsOf(r, state.guests);
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
          '<span class="mitem-art">' + dishPhoto(r, 'thumb', false) + '</span>' +
          '<span class="mitem-body"><span class="mitem-title">' + esc(r.title) + '</span>' +
          '<span class="mitem-meta">' + esc(dishAmount(r)) + '</span></span></a>' +
          '<button class="btn btn-small" data-act="menu-remove" data-id="' + id + '" aria-label="Убрать «' + esc(r.title) + '» из меню">Убрать</button></li>';
      }).join('') + '</ul>';
    }).join('');
    var n = state.menu.length;
    return '<h1 class="page-title">Моё меню на праздник</h1>' +
      '<section class="card guests-card">' + guestsStepper() +
      '<p class="note">Все блюда пересчитаны на ' + guestsText(state.guests) + '. В меню ' + n + ' ' + plural(n, DISH) + '.</p></section>' +
      howManyHtml() +
      groups +
      '<div class="actions col">' +
      '<a class="btn btn-primary" href="#shop">' + ICON.cart + 'Список покупок</a>' +
      '<button class="btn btn-secondary" data-act="share-menu">' + ICON.share + 'Поделиться меню</button>' +
      '<button class="btn btn-outline" data-act="postcard">' + ICON.card + 'Открытка с меню</button>' +
      '<a class="btn btn-outline" href="#">' + ICON.plus + 'Добавить ещё блюда</a></div>' +
      planCardHtml();
  }

  /* ---------- Подсказка «сколько блюд» ---------- */
  // Обычная норма на число гостей: [от, до] — салаты, горячее, закуски, сладкое. Напитки не считаем.
  function norms(g) {
    return {
      salads: g <= 3 ? [1, 2] : g <= 8 ? [2, 3] : g <= 14 ? [3, 4] : [4, 5],
      hot: g <= 8 ? [1, 1] : g <= 16 ? [1, 2] : [2, 2],
      snacks: g <= 3 ? [1, 1] : g <= 6 ? [2, 2] : g <= 10 ? [2, 3] : g <= 16 ? [3, 4] : [4, 5],
      sweets: g <= 10 ? [1, 1] : [1, 2]
    };
  }
  // Родительный падеж после «хватает …»: 1 салата, 2–3 салатов.
  var NORM_WORDS = {
    salads: { gen: ['салата', 'салатов'], add: ['салат', 'салата', 'салатов'], title: 'Салаты' },
    hot: { gen: ['горячего', 'горячих'], add: ['горячее', 'горячих', 'горячих'], title: 'Горячее' },
    snacks: { gen: ['закуски', 'закусок'], add: ['закуску', 'закуски', 'закусок'], title: 'Закуски' },
    sweets: { gen: ['десерта', 'десертов'], add: ['десерт', 'десерта', 'десертов'], title: 'Сладкое' }
  };
  function baseCat(r) { return r.cat === 'trendy' ? (r.alsoIn || 'drinks') : r.cat; }
  function rangeText(a) { return a[0] === a[1] ? String(a[0]) : a[0] + '–' + a[1]; }
  function howManyHtml() {
    var g = state.guests, nm = norms(g), have = { salads: 0, hot: 0, snacks: 0, sweets: 0 };
    state.menu.forEach(function (id) { var c = baseCat(rec(id)); if (own(have, c)) have[c]++; });
    var order = ['salads', 'hot', 'snacks', 'sweets'], parts = [], rows = '', missing = 0;
    order.forEach(function (c) {
      var a = nm[c], w = NORM_WORDS[c];
      parts.push(rangeText(a) + ' ' + (a[1] === 1 ? w.gen[0] : w.gen[1]));
      var ok = have[c] >= a[0], need = a[0] - have[c];
      if (!ok) missing++;
      rows += '<li class="' + (ok ? 'ok' : 'need') + '">' + (ok ? ICON.check : '<span class="hm-dot" aria-hidden="true"></span>') +
        '<span class="hm-k">' + w.title + ':</span> <span class="hm-v">' + (have[c] ? 'есть ' + have[c] : 'пока нет') +
        (ok ? '' : ' — <a href="#c/' + c + '">можно добавить ' + need + ' ' + plural(need, w.add) + '</a>') + '</span></li>';
    });
    var list = parts.slice(0, -1).join(', ') + ' и ' + parts[parts.length - 1];
    return '<section class="card howmany" data-testid="howmany"><h2>Сколько блюд нужно</h2>' +
      '<p>На ' + guestsText(g) + ' обычно хватает ' + list + '.</p>' +
      '<ul class="hm-list">' + rows + '</ul>' +
      '<p class="note">' + (missing ? 'Это только подсказка — решать вам.' : 'Блюд хватает на всех гостей.') + '</p></section>';
  }

  /* ---------- План готовки по дням (за рекламу) ---------- */
  var TABLE_HOURS = [19, 20, 21, 22, 23], DEFAULT_TABLE = 21;
  var PLAN_DAYS = [29, 30, 31];
  function menuKey() { return state.menu.slice().sort().join(','); }
  // План открыт для этого меню; если меню поменяли в тот же день, когда открыли, — пересчёт без новой рекламы.
  function planOpen() {
    var p = meta.plan;
    if (!p || !state.menu.length) return false;
    var key = menuKey();
    if (p.menu === key) return true;
    if (p.day === dayNum()) { p.menu = key; save([K.plan]); return true; }
    return false;
  }
  function planAvailable() { return planOpen() || !!(PF && PF.rewardedAvailable && PF.rewardedAvailable()); }
  function tableHour() { return meta.plan && TABLE_HOURS.indexOf(meta.plan.t) >= 0 ? meta.plan.t : DEFAULT_TABLE; }
  function hhmm(min) { min = Math.max(0, min); return Math.floor(min / 60) + ':' + ('0' + (min % 60)).slice(-2); }
  function planDays() {
    var T = tableHour() * 60, days = { 29: [], 30: [], 31: [] };
    var order = D.CATEGORIES.map(function (c) { return c.id; });
    var ids = state.menu.slice().sort(function (a, b) { return order.indexOf(baseCatOrder(rec(a))) - order.indexOf(baseCatOrder(rec(b))); });
    ids.forEach(function (id) {
      var r = rec(id), p = r.prep;
      if (!p) return;
      if (p.note) {
        if (p.daysBefore >= 2) days[29].push({ r: r, text: p.note });
        else if (p.daysBefore === 1) days[30].push({ r: r, text: p.note });
        else days[31].push({ r: r, text: p.note, at: T - (p.noteBefore || 0) });
      }
      if (p.then) days[30].push({ r: r, text: p.then });
      if (p.final) days[31].push({ r: r, text: p.final, at: T - (p.before || 0) });
    });
    days[31].forEach(function (t) { t.at = Math.floor(Math.max(0, t.at) / 15) * 15; });
    days[31].sort(function (a, b) { return a.at - b.at; });
    return days;
  }
  function baseCatOrder(r) { var c = baseCat(r); return c === 'drinks' ? 'trendy' : c; }
  function dayTitle(d) {
    var dt = new Date(today().getMonth() === 0 ? today().getFullYear() - 1 : today().getFullYear(), 11, d, 12), wd = '';
    try { wd = dt.toLocaleDateString('ru-RU', { weekday: 'long' }); } catch (e) { wd = ''; }
    var tail = d === 29 ? 'за 2 дня' : d === 30 ? 'накануне' : 'праздник';
    return d + ' декабря' + (wd ? ', ' + wd : '') + ' — ' + tail;
  }
  function planHtml() {
    var days = planDays(), t = tableHour();
    var chips = TABLE_HOURS.map(function (h) {
      return '<button class="chip' + (h === t ? ' on' : '') + '" data-act="table-set" data-v="' + h + '" aria-pressed="' + (h === t) + '">' + h + ':00</button>';
    }).join('');
    var html = '<section class="card plan-time"><div class="chips" role="group" aria-label="Во сколько садитесь за стол">' +
      '<span class="chips-label">За стол в:</span>' + chips + '</div>' +
      '<p class="note">Время 31 декабря — примерное, от часа застолья.</p></section>';
    PLAN_DAYS.forEach(function (d) {
      var list = days[d], items = '';
      if (d === 29) items += '<li class="plan-item plan-shop"><span class="plan-what">' + ICON.cart + '<a href="#shop">Купите продукты по списку покупок</a></span>' +
        '<span class="plan-text">Зелень, икру и свежие огурцы лучше взять 30-го.</span></li>';
      list.forEach(function (it) {
        items += '<li class="plan-item">' + (it.at != null ? '<span class="plan-at">' + hhmm(it.at) + '</span>' : '') +
          '<span class="plan-what"><a href="#r/' + it.r.id + '" data-src="plan">' + esc(it.r.title) + '</a></span>' +
          '<span class="plan-text">' + esc(it.text) + '</span></li>';
      });
      if (d === 31) items += '<li class="plan-item plan-table"><span class="plan-at">' + t + ':00</span><span class="plan-what">Садимся за стол. С Новым годом!</span></li>';
      if (!list.length && d === 30) items += '<li class="plan-item plan-free"><span class="plan-text">Из вашего меню заранее готовить нечего — отдыхайте.</span></li>';
      html += '<section class="plan-day" data-day="' + d + '"><h2 class="sec-title">' + esc(dayTitle(d)) + '</h2><ol class="plan-list">' + items + '</ol></section>';
    });
    return html;
  }
  function planCardHtml() {
    if (!state.menu.length) return '';
    if (planOpen()) {
      return '<section class="card plan-card" data-testid="plan-card"><h2>План готовки по дням</h2>' +
        '<p>Что делать 29, 30 и 31 декабря — для блюд вашего меню.</p>' +
        '<a class="btn btn-secondary" href="#plan" data-src="menu">' + ICON.cal + 'Открыть план по дням</a></section>';
    }
    if (!planAvailable()) return '';
    AN.once('plan_offer_shown', { source: 'menu' });
    return '<section class="card plan-card" data-testid="plan-card"><h2>План готовки по дням</h2>' +
      '<p class="plan-offer">Посмотрите рекламу — и получите план: что готовить 29, 30 и 31 декабря.</p>' +
      '<button class="btn btn-primary" id="planAdBtn" data-act="plan-ad" data-src="menu">' + ICON.cal + 'Составить план по дням</button>' +
      planNoticeHtml() + '</section>';
  }
  var planNotice = null;
  function planNoticeHtml() {
    if (!planNotice) return '';
    return '<p class="notice notice-' + planNotice.kind + '" role="status">' + esc(planNotice.text) + '</p>';
  }
  function viewPlan() {
    setHeader('План по дням', true);
    var n = state.menu.length;
    if (!n) {
      return '<h1 class="page-title">План готовки по дням</h1>' +
        '<div class="empty"><p>План строится из блюд вашего меню. Сначала добавьте блюда.</p></div>' +
        '<div class="actions col"><a class="btn btn-primary" href="#menu">' + ICON.menu + 'Перейти к меню</a></div>';
    }
    if (!planOpen()) {
      return '<h1 class="page-title">План готовки по дням</h1>' +
        '<section class="card plan-card"><p class="plan-offer">Посмотрите рекламу — и получите план: что готовить 29, 30 и 31 декабря.</p>' +
        '<p class="note">В плане будут все ' + n + ' ' + plural(n, DISH) + ' вашего меню: что можно сделать заранее и что — в последний момент, с примерным временем.</p>' +
        (planAvailable() ? '<button class="btn btn-primary" id="planAdBtn" data-act="plan-ad" data-src="plan">' + ICON.cal + 'Составить план по дням</button>'
          : '<p class="notice notice-fail">Реклама сейчас недоступна, поэтому план открыть нельзя. Загляните позже.</p>') +
        planNoticeHtml() + '</section>' +
        '<div class="actions col"><a class="btn btn-outline" href="#menu">' + ICON.menu + 'Назад к меню</a></div>';
    }
    return '<h1 class="page-title">План готовки по дням</h1>' +
      (planNotice && planNotice.kind === 'ok' ? planNoticeHtml() : '') +
      '<p class="lead">Для ' + n + ' ' + plural(n, ['блюда', 'блюд', 'блюд']) + ' вашего меню на ' + guestsText(state.guests) + '.</p>' +
      planHtml() +
      '<div class="actions col">' +
      '<button class="btn btn-secondary" data-act="share-plan">' + ICON.share + 'Поделиться планом</button>' +
      '<a class="btn btn-outline" href="#menu">' + ICON.menu + 'Назад к меню</a></div>';
  }

  /* ---------- О приложении ---------- */
  function supportLink() {
    var sp = CFG.SUPPORT || {}, id = PF ? PF.id : '';
    var url = id === 'ok' ? sp.ok : id === 'vk' ? sp.vk : (sp.vk || sp.ok);
    if (url && /^https:\/\//.test(url)) return { href: url, text: url.replace(/^https:\/\//, '') };
    if (sp.email && /^[^@\s]+@[^@\s]+$/.test(sp.email)) return { href: 'mailto:' + sp.email, text: sp.email };
    return null;
  }
  function viewAbout() {
    setHeader('О приложении', true);
    var sl = supportLink(), age = CFG.AGE || '0+';
    return '<h1 class="page-title">О приложении</h1>' +
      '<section class="card about"><h2>Новогодний стол: рецепты</h2>' +
      '<p>Рецепты к Новому году по шагам: салаты, горячее, закуски, сладкое и «Модный стол». ' +
      'Меню на праздник, список покупок, план готовки по дням и открытка с меню.</p>' +
      '<p>Все рецепты и фотографии сделаны для этого приложения.</p>' +
      '<p><span class="age-mark">' + esc(age) + '</span> Подходит для всех возрастов. Звука в приложении нет.</p></section>' +
      '<section class="card support" data-testid="support"><h2>Вопросы и пожелания</h2>' +
      (sl ? '<p>Пишите нам: <a class="support-link" href="' + esc(sl.href) + '" target="_blank" rel="noopener">' + esc(sl.text) + '</a></p>'
        : '<p>Пишите нам: <span class="support-wait">адрес поддержки скоро появится здесь</span>.</p>') +
      '<p class="note">Отвечаем в течение недели.</p></section>' +
      '<p class="note version">Версия ' + esc(CFG.version || '') + '</p>' +
      '<div class="actions col"><a class="btn btn-outline" href="#">' + ICON.home + 'На главную</a></div>';
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

  function render(fromHistory) {
    var r = parseRoute(location.hash), prev = current;
    current = r;
    var changed = routeKey(r) !== routeKey(prev);
    if (r.name === 'recipe' && routeKey(r) !== routeKey(prev)) {
      // Открыли из меню — показываем количества на гостей меню.
      var rr = rec(r.id);
      if (r.fromMenu) {
        state.portions[r.id] = rr.whole ? wholeCount(rr, state.guests) : state.guests;
        state.fromMenu[r.id] = true;
      } else if (state.fromMenu[r.id]) {
        delete state.portions[r.id]; delete state.fromMenu[r.id];
      }
      galState(r.id).pos = 0; // открыли рецепт заново — лента с главного фото
    }
    var html;
    if (r.name === 'cat') html = viewCat(r.id);
    else if (r.name === 'recipe') html = viewRecipe(r.id);
    else if (r.name === 'menu') html = viewMenu();
    else if (r.name === 'shop') html = viewShop();
    else if (r.name === 'plan') html = viewPlan();
    else if (r.name === 'about') html = viewAbout();
    else html = viewHome();
    app.innerHTML = html;
    app.setAttribute('data-view', r.name);
    galInit();
    if (changed && !fromHistory) trackView(r, prev);
    pendingSrc = null;
    updateBanner();
  }

  /* ---------- Отметки для статистики: экраны ---------- */
  var pendingSrc = null, swiped = dict();
  var SRC_BY_PREV = { cat: 'cat', menu: 'menu', plan: 'plan', home: 'day', recipe: 'recipe', shop: 'shop', about: 'about' };
  function trackView(r, prev) {
    if (r.name === 'recipe') {
      var rr = rec(r.id);
      AN.event('recipe_opened', { recipe_id: rr.id, cat: rr.cat, base_cat: baseCat(rr), source: pendingSrc || (prev ? SRC_BY_PREV[prev.name] || 'other' : 'link') });
    } else if (r.name === 'shop') {
      AN.event('shop_opened', { dishes: state.menu.length, guests: state.guests });
    } else if (r.name === 'plan') {
      if (planOpen()) AN.event('plan_opened', { source: pendingSrc || (prev ? 'menu' : 'link'), dishes: state.menu.length });
      else if (state.menu.length) AN.event('plan_offer_shown', { source: prev ? 'plan' : 'link' });
    }
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
  // Ссылка на приложение для текстов «поделиться». ВК: vk.com/app…#r/olivier; ОК: ok.ru/game/… (без #);
  // внутри ВК/ОК, пока адрес не вписан в config.js, ссылки нет (никаких github.io внутри площадки).
  function linkFor(hash) {
    var u = PF ? PF.appUrl() : ((CFG.APP_URL && CFG.APP_URL.web) || location.href.split('#')[0].split('?')[0]);
    if (!u) return '';
    if (PF && PF.id === 'ok') return u;
    return u + (hash || '');
  }
  function footer(hash) {
    var u = linkFor(hash);
    return '\n\nРецепты к Новому году — ' + (u || 'приложение «Новогодний стол: рецепты»');
  }

  function recipeText(r) {
    var a = amountOf(r), f = factorOf(r);
    var amount = r.whole ? wholeText(r, a) : cap(portionForms(r)[2]) + ': ' + a;
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
  function planText() {
    var days = planDays(), t = tableHour();
    var lines = ['📅 План готовки к Новому году (' + guestsText(state.guests) + ', за стол в ' + t + ':00)'];
    PLAN_DAYS.forEach(function (d) {
      lines.push('', dayTitle(d) + ':');
      if (d === 29) lines.push('• Купить продукты по списку покупок');
      days[d].forEach(function (it) { lines.push('• ' + (it.at != null ? hhmm(it.at) + ' ' : '') + it.r.title + ': ' + it.text); });
      if (d === 30 && !days[d].length) lines.push('• Заранее готовить нечего — отдыхаем');
      if (d === 31) lines.push('• ' + t + ':00 Садимся за стол. С Новым годом!');
    });
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
    updateBanner();
  }
  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    if (modalReturn && modalReturn.focus && document.contains(modalReturn)) modalReturn.focus();
    modalReturn = null;
    updateBanner();
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
  /* ---------- Просмотр фото крупно (фото шагов и кадры листания главного фото) ----------
     Тёмный фон, фото по центру, текст снизу (в альбоме — справа), «✕ Закрыть», стрелки и свайп.
     Открытие кладёт запись в историю: системная «назад» закрывает просмотр и оставляет на рецепте. */
  // V: { kind: 'steps' | 'gal', el, img, r, list, pos, ret, pushed }
  //   steps — list: номера шагов с фото (с 0); gal — list: номера кадров ленты (с 1).
  var V = null;
  function viewerSrc(v, size) { return v.kind === 'gal' ? galSrc(v.r.id, v.list[v.pos], size) : stepPhotoSrc(v.r, v.list[v.pos], size); }
  function viewerEl() {
    var el = document.getElementById('viewer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'viewer'; el.className = 'viewer'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'viewer-count');
    el.innerHTML =
      '<div class="viewer-stage"><img class="viewer-img" alt=""></div>' +
      '<div class="viewer-side">' +
        '<div class="viewer-top"><span id="viewer-count" class="viewer-count"></span>' +
        '<button class="viewer-btn viewer-close" type="button">✕ Закрыть</button></div>' +
        '<p class="viewer-text"></p>' +
        '<div class="viewer-nav">' +
          '<button class="viewer-btn viewer-arrow" type="button" data-dir="-1" aria-label="Предыдущий шаг">‹</button>' +
          '<button class="viewer-btn viewer-arrow" type="button" data-dir="1" aria-label="Следующий шаг">›</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b && b.classList.contains('viewer-close')) { closeViewer(); return; }
      if (b && b.hasAttribute('data-dir')) { viewerStep(+b.getAttribute('data-dir')); return; }
      // Нажатие на тёмный фон (мимо фото, текста и кнопок) закрывает.
      if (e.target === el || e.target.classList.contains('viewer-stage')) closeViewer();
    });
    var sx = 0, sy = 0, st = 0;
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { st = 0; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (!st || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      st = 0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.preventDefault(); viewerStep(dx < 0 ? 1 : -1); }
    });
    el.querySelector('.viewer-img').addEventListener('error', function () {
      if (!V) return;
      // Большое фото не загрузилось — показываем маленькое.
      var img = this, src = img.getAttribute('src'), big = viewerSrc(V, 'full'), small = viewerSrc(V, 'thumb');
      if (src === big) { img.setAttribute('src', small); return; }
      if (src !== small) return; // ошибка от прежнего фото — уже листнули дальше
      if (V.kind !== 'gal') { img.hidden = true; return; } // фото шага: остаётся текст шага
      // Кадр ленты не загрузился совсем — выпадает и из просмотра, и из ленты на странице.
      var n = V.list[V.pos];
      V.list.splice(V.pos, 1);
      galDrop(V.r.id, n);
      if (!V.list.length) { closeViewer(); return; }
      if (V.pos >= V.list.length) V.pos = V.list.length - 1;
      showViewerStep();
    });
    return el;
  }
  function showViewerStep() {
    var r = V.r, k = V.list[V.pos], img = V.img, gal = V.kind === 'gal';
    img.hidden = false;
    img.setAttribute('src', viewerSrc(V, 'full'));
    img.setAttribute('alt', gal ? galAlt(r, k) : stepAlt(r, k));
    V.el.querySelector('.viewer-count').textContent = gal ? (V.pos + 1) + ' из ' + V.list.length : 'Шаг ' + (k + 1) + ' из ' + r.steps.length;
    var text = V.el.querySelector('.viewer-text');
    text.textContent = gal ? galCaption(k) : r.steps[k];
    text.classList.toggle('viewer-caption', gal);
    var arrows = V.el.querySelectorAll('.viewer-arrow');
    arrows[0].disabled = V.pos === 0;
    arrows[1].disabled = V.pos === V.list.length - 1;
    arrows[0].setAttribute('aria-label', gal ? 'Предыдущее фото' : 'Предыдущий шаг');
    arrows[1].setAttribute('aria-label', gal ? 'Следующее фото' : 'Следующий шаг');
    V.el.querySelector('.viewer-nav').hidden = V.list.length < 2;
    // Соседние фото — заранее, чтобы листалось без ожидания.
    [V.pos - 1, V.pos + 1].forEach(function (p) {
      if (p >= 0 && p < V.list.length) (new Image()).src = viewerSrc({ kind: V.kind, r: r, list: V.list, pos: p }, 'full');
    });
  }
  function openViewerWith(kind, r, list, pos, from) {
    var el = viewerEl();
    V = { kind: kind, el: el, img: el.querySelector('.viewer-img'), r: r, list: list, pos: pos, ret: from, pushed: false };
    showViewerStep();
    el.hidden = false;
    document.documentElement.classList.add('viewer-open');
    AN.event('photo_opened', { kind: kind === 'gal' ? 'gallery' : 'step', recipe_id: r.id, n: kind === 'gal' ? list[pos] : list[pos] + 1 });
    updateBanner();
    try { history.pushState(Object.assign({}, history.state || {}, { viewer: true }), ''); V.pushed = true; } catch (e) { /* без истории — закрытие кнопкой */ }
    el.querySelector('.viewer-close').focus();
  }
  function openViewer(id, k, from) {
    var r = rec(id);
    if (!r) return;
    // Только шаги, у которых фото есть на странице (не загрузившиеся уже убраны).
    var list = Array.prototype.map.call(app.querySelectorAll('.step-photo[data-id="' + id + '"]'), function (b) { return +b.getAttribute('data-i'); });
    if (list.indexOf(k) < 0) return;
    openViewerWith('steps', r, list, list.indexOf(k), from);
  }
  // Нажали на главное фото с листанием — крупно текущий кадр, внутри листаются кадры ленты.
  function openGallery(id, n, from) {
    var r = rec(id), root = app.querySelector('.r-gal[data-gal="' + id + '"]');
    if (!r || !root) return;
    var list = galSlides(root).map(function (s) { return +s.getAttribute('data-n'); });
    if (list.indexOf(n) < 0) return;
    openViewerWith('gal', r, list, list.indexOf(n), from);
  }
  function viewerStep(d) {
    if (!V) return;
    var p = V.pos + d;
    if (p < 0 || p >= V.list.length) return;
    V.pos = p; showViewerStep();
  }
  function hideViewer() {
    var v = V;
    V = null;
    v.el.hidden = true;
    v.img.removeAttribute('src');
    document.documentElement.classList.remove('viewer-open');
    updateBanner();
    var back;
    if (v.kind === 'gal') {
      // Лента на странице встаёт на тот кадр, который смотрели последним; фокус — на него.
      var root = app.querySelector('.r-gal[data-gal="' + v.r.id + '"]');
      if (root && v.list.length) {
        var k = galSlides(root).map(function (s) { return +s.getAttribute('data-n'); }).indexOf(v.list[Math.min(v.pos, v.list.length - 1)]);
        if (k >= 0) galShow(k, true);
        back = galSlides(root)[galState(v.r.id).pos];
      }
    } else {
      // Фокус — на фото того шага, который смотрели последним.
      back = app.querySelector('.step-photo[data-id="' + v.r.id + '"][data-i="' + v.list[v.pos] + '"]');
    }
    back = back || v.ret;
    if (back && document.contains(back)) back.focus({ preventScroll: false });
    return v;
  }
  function closeViewer() {
    if (!V) return;
    var v = hideViewer();
    if (v.pushed) { viewerSkipPop = true; history.back(); }
  }
  var viewerSkipPop = false;
  // Вызывается из popstate: «назад» при открытом просмотре только закрывает его.
  function viewerOnPop() {
    if (viewerSkipPop) { viewerSkipPop = false; return true; }
    if (V) { hideViewer(); return true; }
    return false;
  }
  document.addEventListener('keydown', function (e) {
    if (!V) return;
    if (e.key === 'Escape') { e.preventDefault(); closeViewer(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); viewerStep(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); viewerStep(1); return; }
    if (e.key === 'Tab') { // фокус держится внутри просмотра
      var f = Array.prototype.filter.call(V.el.querySelectorAll('button'), function (b) { return !b.disabled && b.offsetParent !== null; });
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      if (f.length) f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });

  /* ---------- Листание главного фото: палец, мышь, клавиши ----------
     Палец влево/вправо — лента едет за пальцем и доводится до ближайшего кадра.
     Палец вверх/вниз — обычная прокрутка страницы (touch-action: pan-y), лента не трогается. */
  var galDrag = null, galNoClickUntil = 0;
  document.addEventListener('pointerdown', function (e) {
    // Тянуть можно за любое место фото, в том числе начиная со стрелки.
    var hero = e.target.closest ? e.target.closest('.r-gal .r-hero') : null;
    if (!hero || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var root = hero.closest('.r-gal'), view = hero.querySelector('.gal-view'), n = galSlides(root).length;
    if (n < 2) return;
    galDrag = { view: view, root: root, track: view.querySelector('.gal-track'), id: e.pointerId, x: e.clientX, y: e.clientY,
      t: Date.now(), w: view.clientWidth || 1, n: n, on: false, dx: 0 };
  });
  document.addEventListener('pointermove', function (e) {
    var d = galDrag;
    if (!d || e.pointerId !== d.id) return;
    var dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) { galDrag = null; return; } // больше вверх-вниз — это прокрутка страницы
      d.on = true;
      d.track.classList.add('dragging');
      try { d.view.setPointerCapture(e.pointerId); } catch (err) { /* и без захвата работает */ }
      galLoadAround(d.root, galState(d.root.getAttribute('data-gal')).pos);
    }
    var pos = galState(d.root.getAttribute('data-gal')).pos;
    if ((pos === 0 && dx > 0) || (pos === d.n - 1 && dx < 0)) dx = dx / 3; // на краю — упруго, дальше не едет
    d.dx = dx;
    d.track.style.transform = 'translateX(calc(' + (-pos * 100) + '% + ' + Math.round(dx) + 'px))';
    if (e.cancelable) e.preventDefault();
  });
  function galDragEnd(e, cancel) {
    var d = galDrag;
    if (!d || e.pointerId !== d.id) return;
    galDrag = null;
    if (!d.on) return;
    galNoClickUntil = Date.now() + 400; // после перетаскивания нажатие не открывает фото крупно
    if (!document.contains(d.root)) return;
    var pos = galState(d.root.getAttribute('data-gal')).pos, v = d.dx / Math.max(1, Date.now() - d.t), go = 0;
    if (!cancel && (Math.abs(d.dx) > d.w * 0.2 || (Math.abs(d.dx) > 30 && Math.abs(v) > 0.3))) go = d.dx < 0 ? 1 : -1;
    galShow(pos + go);
  }
  document.addEventListener('pointerup', function (e) { galDragEnd(e, false); });
  document.addEventListener('pointercancel', function (e) { galDragEnd(e, true); });
  window.addEventListener('click', function (e) {
    if (Date.now() < galNoClickUntil && e.target.closest && e.target.closest('.r-gal')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // Клавиши ← → на странице рецепта листают ленту (если не открыт просмотр или окно).
  document.addEventListener('keydown', function (e) {
    if (V || !modal.hidden || (S && !S.el.hidden) || adBusy || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var root = galRoot();
    if (!root) return;
    e.preventDefault();
    galShow(galState(root.getAttribute('data-gal')).pos + (e.key === 'ArrowRight' ? 1 : -1));
  });

  function copyText(text) {
    function done() { toast('Скопировано — вставьте в сообщение'); }
    function fallback() { if (legacyCopy(text)) done(); else showManualCopy(text); }
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); return; }
    } catch (e) { /* дальше */ }
    fallback();
  }
  // Поделиться: вне ВК/ОК — как в прототипе (системное окно телефона, иначе копирование);
  // во ВК и ОК — своё окно: «Поделиться» самой площадки, «Скопировать текст» (+ открытка для меню).
  // info: { what: 'recipe' | 'menu' | 'shop' | 'plan', id?, hash? }
  function shareMark(info, channel) {
    var ev = { channel: channel, what: info.what };
    if (info.id) ev.recipe_id = info.id;
    AN.event('share_clicked', ev);
  }
  function share(title, text, info, opener) {
    info = info || { what: 'recipe' };
    window.__lastShare = text; // для автотеста
    if (PF && PF.nativeShareChannel && PF.nativeShareChannel()) { openShareSheet(title, text, info, opener); return; }
    if (navigator.share) {
      try {
        shareMark(info, 'system');
        navigator.share({ title: title, text: text }).catch(function (err) {
          if (err && err.name === 'AbortError') return; // человек сам закрыл окно
          copyText(text);
        });
        return;
      } catch (e) { /* дальше */ }
    }
    shareMark(info, 'copy');
    copyText(text);
  }
  function openShareSheet(title, text, info, opener) {
    var ch = PF.nativeShareChannel();
    var body = document.createElement('div');
    body.innerHTML = '<p class="share-preview"></p><div class="sheet-actions">' +
      '<button class="btn btn-primary" type="button" data-sh="native">' + ICON.share + (ch === 'ok' ? 'Поделиться в Одноклассниках' : 'Поделиться ВКонтакте') + '</button>' +
      '<button class="btn btn-outline" type="button" data-sh="copy">' + ICON.copy + 'Скопировать текст</button>' +
      (info.what === 'menu' ? '<button class="btn btn-outline" type="button" data-sh="card">' + ICON.card + 'Открытка с меню</button>' : '') +
      '</div>';
    body.querySelector('.share-preview').textContent = text.length > 400 ? text.slice(0, 400) + '…' : text;
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sh]');
      if (!b) return;
      var k = b.getAttribute('data-sh');
      if (k === 'native') {
        shareMark(info, ch);
        PF.shareNative({ text: text, url: linkFor(info.hash || '') }).catch(function () { /* закрыли окно площадки */ });
        closeSheet();
      } else if (k === 'copy') {
        shareMark(info, 'copy');
        closeSheet();
        copyText(text);
      } else if (k === 'card') {
        closeSheet(true);
        openPostcard(opener);
      }
    });
    openSheet(title === 'Список покупок' ? 'Поделиться списком' : 'Поделиться', body, opener);
  }

  /* ---------- Окно (поделиться во ВК/ОК, открытка) ----------
     Тёмный фон, крупный заголовок и «✕ Закрыть»; Escape, нажатие на фон и системная «назад» закрывают. */
  var S = null; // { el, ret, pushed }
  function sheetEl() {
    var el = document.getElementById('sheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'sheet'; el.className = 'modal sheet'; el.hidden = true;
    el.innerHTML = '<div class="modal-box sheet-box" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
      '<div class="sheet-head"><h2 id="sheet-title"></h2><button class="sheet-close" type="button">✕ Закрыть</button></div>' +
      '<div class="sheet-body"></div></div>';
    el.addEventListener('click', function (e) { if (e.target === el) closeSheet(); });
    el.querySelector('.sheet-close').addEventListener('click', function () { closeSheet(); });
    document.body.appendChild(el);
    return el;
  }
  function openSheet(title, body, opener, cls) {
    var el = sheetEl(), keep = S && S.pushed;
    if (S) S = null;
    el.querySelector('#sheet-title').textContent = title;
    var b = el.querySelector('.sheet-body');
    b.innerHTML = ''; b.appendChild(body);
    el.className = 'modal sheet' + (cls ? ' ' + cls : '');
    el.hidden = false;
    S = { el: el, ret: opener || document.activeElement, pushed: keep };
    if (!keep) { try { history.pushState(Object.assign({}, history.state || {}, { sheet: true }), ''); S.pushed = true; } catch (e) { /* без истории */ } }
    el.querySelector('.sheet-close').focus();
    updateBanner();
  }
  function hideSheet() {
    var s = S;
    if (!s) return null;
    S = null;
    s.el.hidden = true;
    s.el.querySelector('.sheet-body').innerHTML = '';
    if (s.ret && s.ret.focus && document.contains(s.ret)) s.ret.focus({ preventScroll: true });
    updateBanner();
    return s;
  }
  // keepHistory — окно сразу сменится другим (поделиться → открытка): запись в истории оставляем.
  function closeSheet(keepHistory) {
    if (!S) return;
    if (keepHistory) { S.el.hidden = true; return; }
    var s = hideSheet();
    if (s && s.pushed) { sheetSkipPop = true; history.back(); }
  }
  var sheetSkipPop = false;
  function sheetOnPop() {
    if (sheetSkipPop) { sheetSkipPop = false; return true; }
    if (S) { hideSheet(); return true; }
    return false;
  }
  document.addEventListener('keydown', function (e) {
    if (!S || S.el.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(S.el.querySelectorAll('button, a[href], img[tabindex]'), function (b) { return !b.disabled && b.offsetParent !== null; });
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      if (f.length) f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });

  /* ---------- Открытка-картинка меню (canvas) ---------- */
  function loadImg(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrapText(ctx, text, maxW, maxLines) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last.replace(/[\s,.:;—-]+$/, '') + '…';
    }
    return lines;
  }
  function drawStar(ctx, x, y, r, color) {
    ctx.save(); ctx.fillStyle = color; ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y - Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function postcardDishes() {
    var order = D.CATEGORIES.map(function (c) { return c.id; });
    return state.menu.slice().sort(function (a, b) { return order.indexOf(baseCatOrder(rec(a))) - order.indexOf(baseCatOrder(rec(b))); }).map(rec);
  }
  // Рисует открытку. withPhotos=false — без фото (если браузер не дал прочитать картинку).
  function makePostcard(withPhotos) {
    var dishes = postcardDishes(), n = dishes.length;
    var cols = n <= 4 ? 2 : n <= 9 ? 3 : 4, maxCells = cols * (cols === 4 ? 4 : 3);
    var shown = n > maxCells ? dishes.slice(0, maxCells - 1) : dishes, more = n - shown.length;
    var cells = shown.length + (more ? 1 : 0), rows = Math.ceil(cells / cols);
    var W = 1080, pad = 48, gap = 28, cw = (W - pad * 2 - gap * (cols - 1)) / cols, ph = Math.round(cw * 0.75);
    var fs = cols === 2 ? 34 : cols === 3 ? 28 : 24, th = Math.round(fs * 1.25) * 2 + 18;
    var top = 330, H = top + rows * (ph + th + gap) + 170;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#FBF4EA'); bg.addColorStop(1, '#F1E1CB');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // шапка: красная, с гирляндой и звёздами
    ctx.fillStyle = '#9E2B25'; ctx.fillRect(0, 0, W, 230);
    for (var gx = 0; gx < W; gx += 42) { ctx.fillStyle = ['#C8902E', '#2E5E45', '#FFFFFF'][(gx / 42) % 3]; ctx.fillRect(gx, 230, 14 * 3, 10); }
    [[70, 60, 16], [1010, 70, 18], [150, 170, 10], [930, 175, 12], [540, 30, 9]].forEach(function (st) { drawStar(ctx, st[0], st[1], st[2], '#F3D27A'); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 66px Georgia, "Times New Roman", serif';
    ctx.fillText('Наше меню', W / 2, 105);
    ctx.font = 'bold 54px Georgia, "Times New Roman", serif';
    ctx.fillText('на Новый год', W / 2, 172);
    ctx.fillStyle = '#5E4E43';
    ctx.font = '600 36px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText('на ' + guestsText(state.guests) + ' · ' + n + ' ' + plural(n, DISH), W / 2, 302);
    var imgs = withPhotos ? shown.map(function (r) { return loadImg(PHOTO + 'thumb/' + r.id + '.webp'); }) : shown.map(function () { return Promise.resolve(null); });
    return Promise.all(imgs).then(function (list) {
      shown.forEach(function (r, i) {
        var col = i % cols, row = Math.floor(i / cols), x = pad + col * (cw + gap), y = top + 20 + row * (ph + th + gap);
        ctx.save();
        ctx.shadowColor = 'rgba(80,40,20,.18)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
        roundRect(ctx, x, y, cw, ph + th, 22); ctx.fillStyle = '#FFFFFF'; ctx.fill();
        ctx.restore();
        ctx.save(); roundRect(ctx, x, y, cw, ph, 22); ctx.clip();
        if (list[i]) ctx.drawImage(list[i], x, y, cw, ph);
        else { ctx.fillStyle = '#EBD9C1'; ctx.fillRect(x, y, cw, ph); drawStar(ctx, x + cw / 2, y + ph / 2, ph / 5, '#C8902E'); }
        ctx.restore();
        ctx.fillStyle = '#2A1F1A';
        ctx.font = 'bold ' + fs + 'px Georgia, "Times New Roman", serif';
        wrapText(ctx, r.title, cw - 24, 2).forEach(function (ln, k) { ctx.fillText(ln, x + cw / 2, y + ph + fs * 1.15 + 6 + k * fs * 1.25); });
      });
      if (more) {
        var i2 = shown.length, x2 = pad + (i2 % cols) * (cw + gap), y2 = top + 20 + Math.floor(i2 / cols) * (ph + th + gap);
        roundRect(ctx, x2, y2, cw, ph + th, 22); ctx.fillStyle = '#F8E1DD'; ctx.fill();
        ctx.fillStyle = '#7A1F1A'; ctx.font = 'bold ' + (fs + 6) + 'px Georgia, serif';
        ctx.fillText('и ещё ' + more, x2 + cw / 2, y2 + (ph + th) / 2 - 4);
        ctx.font = '600 ' + fs + 'px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.fillText(plural(more, DISH), x2 + cw / 2, y2 + (ph + th) / 2 + fs + 6);
      }
      // подпись приложения и ёлочка
      var fy = H - 84;
      ctx.fillStyle = '#2E5E45';
      ctx.beginPath(); ctx.moveTo(W / 2 - 250, fy - 34); ctx.lineTo(W / 2 - 230, fy - 2); ctx.lineTo(W / 2 - 270, fy - 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W / 2 - 250, fy - 46); ctx.lineTo(W / 2 - 234, fy - 20); ctx.lineTo(W / 2 - 266, fy - 20); ctx.closePath(); ctx.fill();
      drawStar(ctx, W / 2 - 250, fy - 50, 8, '#C8902E');
      ctx.fillStyle = '#7A1F1A';
      ctx.font = 'bold 40px Georgia, "Times New Roman", serif';
      ctx.fillText('Новогодний стол: рецепты', W / 2 + 22, fy);
      ctx.fillStyle = '#5E4E43';
      ctx.font = '28px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText('рецепты по шагам, меню и список покупок', W / 2, fy + 44);
      return c;
    });
  }
  function canvasUrl(c) { try { return c.toDataURL('image/png'); } catch (e) { return ''; } }
  function openPostcard(opener) {
    if (!state.menu.length) return;
    AN.event('share_clicked', { channel: 'postcard', what: 'menu' });
    makePostcard(true).then(function (c) {
      var url = canvasUrl(c);
      if (!url) return makePostcard(false).then(function (c2) { return { c: c2, url: canvasUrl(c2) }; });
      return { c: c, url: url };
    }).then(function (res) { showPostcard(res.c, res.url, opener); });
  }
  function showPostcard(canvas, url, opener) {
    var social = !!(PF && PF.isSocial), fileName = 'menu-novyi-god.png';
    var body = document.createElement('div');
    body.className = 'postcard-body';
    body.innerHTML = '<img class="postcard-img" alt="Открытка: наше меню на Новый год">' +
      '<div class="sheet-actions">' +
      '<button class="btn btn-primary" type="button" data-pc="save">' + ICON.save + 'Сохранить открытку</button>' +
      (social && PF.nativeShareChannel() ? '<button class="btn btn-outline" type="button" data-pc="native">' + ICON.share + (PF.id === 'ok' ? 'Поделиться в Одноклассниках' : 'Поделиться ВКонтакте') + '</button>' : '') +
      '</div><p class="note postcard-hint">Открытку можно отправить в сообщении или поставить в пост.</p>';
    var img = body.querySelector('.postcard-img'), acts = body.querySelector('.sheet-actions');
    img.src = url;
    var file = null;
    if (!social && navigator.canShare && typeof File === 'function' && canvas.toBlob) {
      try {
        canvas.toBlob(function (b) {
          if (!b) return;
          try {
            var f = new File([b], fileName, { type: 'image/png' });
            if (navigator.canShare({ files: [f] })) {
              file = f;
              var sb = document.createElement('button');
              sb.type = 'button'; sb.className = 'btn btn-outline'; sb.setAttribute('data-pc', 'send');
              sb.innerHTML = ICON.share + 'Отправить открытку';
              acts.appendChild(sb);
            }
          } catch (e) { /* без отправки файлом */ }
        }, 'image/png');
      } catch (e) { /* без отправки файлом */ }
    }
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pc]');
      if (!b) return;
      var k = b.getAttribute('data-pc');
      if (k === 'save') {
        // Во ВК и ОК скачивание файла часто не работает — открытка на весь экран, сохранить долгим нажатием.
        if (social) { AN.event('postcard_saved', { method: 'fullscreen' }); showPostcardFull(canvas, url, opener); return; }
        var a = document.createElement('a');
        a.href = url; a.download = fileName; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        AN.event('postcard_saved', { method: 'download' });
        toast('Открытка сохраняется в загрузки');
      } else if (k === 'send' && file) {
        navigator.share({ files: [file], title: 'Наше меню на Новый год' })
          .then(function () { AN.event('postcard_saved', { method: 'share_file' }); }, function () { /* передумал */ });
      } else if (k === 'native') {
        shareMark({ what: 'menu' }, PF.id);
        PF.shareNative({ text: menuText(), url: linkFor('') }).catch(function () { /* закрыли окно площадки */ });
      }
    });
    openSheet('Открытка с меню', body, opener, 'sheet-postcard');
  }
  function showPostcardFull(canvas, url, opener) {
    var body = document.createElement('div');
    body.className = 'postcard-full';
    var desktop = !!(window.matchMedia && matchMedia('(pointer: fine)').matches);
    body.innerHTML = '<img class="postcard-full-img" alt="Открытка: наше меню на Новый год">' +
      '<p class="note postcard-full-hint">' + (desktop ? 'Нажмите на открытку правой кнопкой мыши и выберите «Сохранить изображение как…».'
        : 'Нажмите на открытку и удерживайте палец, чтобы сохранить её.') + '</p>' +
      '<button class="btn btn-outline" type="button" data-pc="back">‹ Назад к открытке</button>';
    body.querySelector('img').src = url;
    body.querySelector('[data-pc="back"]').addEventListener('click', function () { showPostcard(canvas, url, opener); });
    openSheet('Сохранить открытку', body, opener, 'sheet-full');
  }

  /* ---------- Реклама за план ---------- */
  var adBusy = false, adGrants = 0, cancelledByBack = false;
  var AD_FAIL_TEXT = {
    closed: 'Реклама закрыта раньше конца — план не открылся. Можно попробовать ещё раз.',
    error: 'Реклама не загрузилась. Попробуйте ещё раз чуть позже.',
    timeout: 'Рекламы сейчас нет. Попробуйте ещё раз чуть позже.'
  };
  // Окно «Загружаем рекламу…»: остальное не нажимается, есть «Отмена».
  function adWaitOverlay() {
    var box = document.createElement('div');
    box.className = 'ad-wait'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Загружаем рекламу');
    box.innerHTML = '<div class="ad-wait-box"><div class="spinner" aria-hidden="true"></div><p role="status">Загружаем рекламу…</p>' +
      '<button type="button" class="btn btn-outline">Отмена</button></div>';
    var cancel = box.querySelector('button');
    cancel.addEventListener('click', function () { if (PF) PF.cancelRewarded(); });
    function trap(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (PF) PF.cancelRewarded(); }
      else if (e.key === 'Tab') { e.preventDefault(); cancel.focus(); }
    }
    document.addEventListener('keydown', trap, true);
    document.body.appendChild(box);
    document.body.classList.add('is-ad-wait');
    var main = document.querySelector('main'), hdr = document.querySelector('.hdr');
    if (main) main.setAttribute('inert', '');
    if (hdr) hdr.setAttribute('inert', '');
    cancel.focus();
    return function () {
      document.removeEventListener('keydown', trap, true);
      box.remove();
      document.body.classList.remove('is-ad-wait');
      if (main) main.removeAttribute('inert');
      if (hdr) hdr.removeAttribute('inert');
    };
  }
  function onPlanScreens() { var n = parseRoute(location.hash).name; return n === 'menu' || n === 'plan'; }
  function planMessage(kind, text) {
    if (!onPlanScreens()) { planNotice = null; return; }
    planNotice = { kind: kind, text: text };
    rerender('#planAdBtn');
  }
  function grantPlan(src, late) {
    adGrants++;
    meta.plan = { day: dayNum(), menu: menuKey(), t: tableHour() };
    save([K.plan]); flushSave();
    AN.event('plan_unlocked', { source: src, late: !!late });
    hideToast();
    planNotice = { kind: 'ok', text: 'Готово! План по дням открыт для вашего меню.' };
    if (S) closeSheet();
    if (parseRoute(location.hash).name === 'plan') { rerender(); window.scrollTo(0, 0); }
    else if (parseRoute(location.hash).name === 'menu') go('#plan');
    else planNotice = null; // ушёл на другой экран — план уже сохранён, сообщать некуда
  }
  function startPlanAd(src) {
    if (adBusy || !PF || planOpen() || !state.menu.length) return;
    adBusy = true;
    cancelledByBack = false;
    planNotice = null;
    updateBanner();
    var done = adWaitOverlay();
    PF.showRewarded({
      placement: 'plan',
      // Реклама опоздала (открылась после «не загрузилась» или «Отмены»): досмотрел до конца — план открывается.
      onLateOpen: function () { planNotice = null; hideToast(); var nn = document.querySelector('.notice'); if (nn) nn.remove(); },
      onLateReward: function () { if (!planOpen() && state.menu.length) grantPlan(src, true); },
      onLateFail: function (reason) {
        AN.event('ad_reward_failed', { reason: reason, late: true });
        toast(AD_FAIL_TEXT[reason] || AD_FAIL_TEXT.error);
        planMessage('fail', AD_FAIL_TEXT[reason] || AD_FAIL_TEXT.error);
      }
    }).then(function (res) {
      done();
      adBusy = false;
      updateBanner();
      if (res && res.ok) { grantPlan(src, false); return; }
      var reason = res && AD_FAIL_TEXT[res.reason] ? res.reason : 'error';
      AN.event('ad_reward_failed', { reason: reason, late: false });
      if (cancelledByBack) { planNotice = null; return; } // ушёл «Назад» — сообщать некому
      toast(AD_FAIL_TEXT[reason]);
      planMessage('fail', AD_FAIL_TEXT[reason]);
      var b = document.getElementById('planAdBtn');
      if (b) b.focus({ preventScroll: true });
    });
  }

  /* ---------- Баннер внизу ----------
     Не на первом экране первого запуска (пока человек не ушёл с него или не нажал «Понятно»),
     не в крупном просмотре фото, не в окне, не пока ждём рекламу. Место под баннер — снизу страницы. */
  var ready = false, bannerHold = false;
  function updateBanner() {
    if (!PF || !PF.banner) return;
    var on = ready && !bannerHold && !V && modal.hidden && !(S && !S.el.hidden) && !adBusy;
    if (on) PF.banner.show(); else PF.banner.hide();
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
      AN.event('menu_added', { recipe_id: id, cat: rec(id).cat, base_cat: baseCat(rec(id)), dishes: state.menu.length });
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
      AN.event('menu_ready_used', { dishes: state.menu.length });
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
    'step-photo': function (el) { openViewer(el.getAttribute('data-id'), +el.getAttribute('data-i'), el); },
    'gal-open': function (el) { openGallery(el.getAttribute('data-id'), +el.getAttribute('data-n'), el); },
    'gal-prev': function () { var root = galRoot(); if (root) galShow(galState(root.getAttribute('data-gal')).pos - 1); },
    'gal-next': function () { var root = galRoot(); if (root) galShow(galState(root.getAttribute('data-gal')).pos + 1); },
    'steps-reset': function (el) { delete state.steps[el.getAttribute('data-id')]; save(); rerender('.step'); },
    'buy-reset': function () { state.bought = dict(); save(); rerender('[data-act="share-shop"]'); },
    'share-recipe': function (el) { var r = rec(el.getAttribute('data-id')); share(r.title, recipeText(r), { what: 'recipe', id: r.id, hash: '#r/' + r.id }, el); },
    'share-menu': function (el) { share('Наше меню на Новый год', menuText(), { what: 'menu' }, el); },
    'share-shop': function (el) { share('Список покупок', shopText(), { what: 'shop' }, el); },
    'share-plan': function (el) { share('План готовки к Новому году', planText(), { what: 'plan' }, el); },
    'postcard': function (el) { openPostcard(el); },
    'plan-ad': function (el) { startPlanAd(el.getAttribute('data-src') || 'menu'); },
    'table-set': function (el) {
      if (!meta.plan) return;
      meta.plan.t = +el.getAttribute('data-v');
      save([K.plan]); rerender();
    },
    'intro-ok': function () {
      meta.visits.intro = 1; save([K.visits]);
      bannerHold = false;
      rerender('[data-act="menu-add"], .big-btn'); updateBanner();
    },
    'fav-add': function (el) {
      var kind = el.getAttribute('data-kind');
      PF.addTo(kind).then(function (ok) {
        AN.event('fav_result', { result: ok ? 'added' : 'failed', kind: kind });
        if (ok) { meta.visits.fav = 'added'; save([K.visits]); toast(kind === 'home' ? 'Добавлено на главный экран' : 'Добавлено в избранное'); }
        if (parseRoute(location.hash).name === 'home') rerender('.big-btn');
      });
    },
    'fav-no': function () {
      meta.visits.fav = 'declined'; save([K.visits]);
      AN.event('fav_result', { result: 'declined' });
      rerender('.big-btn');
    }
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
      if (S) closeSheet();
      if (a.getAttribute('data-src')) pendingSrc = a.getAttribute('data-src');
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
    // «Назад», пока ждём рекламу, — это «Отмена».
    if (adBusy && PF && PF.isWaitingRewarded && PF.isWaitingRewarded()) { cancelledByBack = true; planNotice = null; PF.cancelRewarded(); }
    if (sheetOnPop()) return;
    if (viewerOnPop()) return;
    bannerHold = false;
    render(true);
    window.scrollTo(0, e.state && e.state.scroll ? e.state.scroll : 0);
  });
  window.addEventListener('hashchange', function () {
    if (routeKey(parseRoute(location.hash)) !== routeKey(current)) { render(); window.scrollTo(0, 0); }
  });

  /* ---------- Запуск ----------
     Площадка (Playgama Bridge: не дольше 8 с) → сохранённое (хранилище площадки или localStorage) → экран. */
  function readLocal() {
    var out = {};
    KEY_LIST.forEach(function (k) { try { var v = window.localStorage.getItem(k); out[k] = v == null ? null : JSON.parse(v); } catch (e) { out[k] = null; } });
    return out;
  }
  function start() {
    var boot = PF ? PF.init({ timeoutMs: 8000, deadlineMs: 10000, localPrefix: '' }) : Promise.resolve(null);
    boot.then(function () {
      AN.init(PF && PF.hasBridge ? PF.bridge : null, { appVersion: CFG.version || '' });
      return PF ? PF.load(KEY_LIST) : readLocal();
    }).then(applyLoaded, function () { applyLoaded({}); }).then(function () {
      var v = meta.visits, returning = v.n > 0 || state.menu.length > 0;
      v.n++; v.day = dayNum();
      save([K.visits]);
      bannerHold = v.n === 1 && !v.intro; // первый запуск: на первом экране баннера нет
      // Ссылка из ВК: всё после # в адресе приложения приходит как payload (#r/olivier).
      var pl = PF && PF.payload;
      if (!location.hash && typeof pl === 'string' && /^(r|c)\/[\w-]+$|^(menu|shop|plan|about)$/.test(pl)) {
        try { history.replaceState(null, '', '#' + pl); } catch (e) { /* без истории */ }
      }
      AN.event('app_opened', { entry: parseRoute(location.hash).name, returning: returning, visit: Math.min(v.n, 10) });
      ready = true;
      render();
      if (PF) PF.gameReady();
      AN.ready();
    });
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });
  window.addEventListener('pagehide', flushSave);
  start();

  // Для автотеста и проверяющих.
  window.NYR = {
    buildShopping: buildShopping, fmtIng: fmtIng, fmtShop: fmtShop, state: state, menuFactor: menuFactor, parseRoute: parseRoute,
    meta: meta, planDays: planDays, planOpen: planOpen, dishOfDay: dishOfDay, daysToNewYear: daysToNewYear, norms: norms,
    makePostcard: makePostcard, linkFor: linkFor, flushSave: flushSave,
    isReady: function () { return ready; }, adGrants: function () { return adGrants; }, adBusy: function () { return adBusy; }
  };
})();
