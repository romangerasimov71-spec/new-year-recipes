/* Новогодний стол: рецепты — логика приложения. */
(function () {
  'use strict';

  var D = window.NYR_DATA;
  var ART = window.NYR_ART;
  var APP_URL = 'https://romangerasimov71-spec.github.io/new-year-recipes/';
  var STORE_KEY = 'nyr.v1';
  var MIN_PEOPLE = 1, MAX_PEOPLE = 40;

  var byId = {};
  D.RECIPES.forEach(function (r) { byId[r.id] = r; });
  var catById = {};
  D.CATEGORIES.forEach(function (c) { catById[c.id] = c; });

  /* ---------- Сохранение ---------- */
  var state = { menu: [], guests: 6, bought: {}, steps: {}, portions: {} };
  function load() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (Array.isArray(s.menu)) state.menu = s.menu.filter(function (id) { return byId[id]; });
      if (typeof s.guests === 'number') state.guests = clamp(Math.round(s.guests), MIN_PEOPLE, MAX_PEOPLE);
      if (s.bought && typeof s.bought === 'object') state.bought = s.bought;
      if (s.steps && typeof s.steps === 'object') state.steps = s.steps;
    } catch (e) { /* без хранилища тоже работаем */ }
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
  var GUEST = ['гостя', 'гостей', 'гостей'];
  var RECIPE_W = ['рецепт', 'рецепта', 'рецептов'];
  var WHOLE_FORMS = { 'торт': ['торт', 'торта', 'тортов'], 'пирог': ['пирог', 'пирога', 'пирогов'] };
  function guestsText(n) { return n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'гостя' : 'гостей'); }

  /* ---------- Количества ---------- */
  var EPS = 1e-9;
  function numStr(x) {
    // 1.25 -> "1,25", 2 -> "2"
    var s = (Math.round(x * 100) / 100).toString();
    return s.replace('.', ',');
  }
  function halfStr(x) {
    // 0.5 -> "½", 1.5 -> "1½"
    var whole = Math.floor(x + EPS), frac = x - whole;
    if (frac > 0.25 && frac < 0.75) return (whole ? whole : '') + '½';
    return String(Math.round(x));
  }
  function roundStep(v, mode) {
    // В рецепте мелочь (ваниль, специи) точнее; в магазине — до 10 г / 50 г.
    var step = mode === 'shop' ? (v < 200 ? 10 : 50) : (v < 20 ? 1 : (v < 200 ? 10 : 50));
    var r = mode === 'shop' ? Math.ceil(v / step - EPS) * step : Math.round(v / step) * step;
    return Math.max(step, r);
  }
  function fmtMetric(v, mode, small, big) {
    var r = roundStep(v, mode);
    if (r >= 1000) return numStr(r / 1000) + ' ' + big;
    return r + ' ' + small;
  }
  function fmtPcs(n, mode) {
    if (mode === 'shop') return Math.max(1, Math.ceil(n - 0.001)) + ' шт';
    if (n < 2) return halfStr(Math.max(0.5, Math.round(n * 2) / 2)) + ' шт';
    return Math.round(n) + ' шт';
  }
  function fmtSpoon(n, unit, mode) {
    var r = mode === 'shop' ? Math.ceil(n * 2 - 0.001) / 2 : Math.round(n * 2) / 2;
    return halfStr(Math.max(0.5, r)) + ' ' + unit;
  }
  // Одна строка рецепта.
  function fmtIng(ing, factor) {
    var q = ing.qty * factor;
    switch (ing.unit) {
      case 'г': return fmtMetric(q, 'recipe', 'г', 'кг');
      case 'кг': return fmtMetric(q * 1000, 'recipe', 'г', 'кг');
      case 'мл': return fmtMetric(q, 'recipe', 'мл', 'л');
      case 'л': return fmtMetric(q * 1000, 'recipe', 'мл', 'л');
      case 'шт': return fmtPcs(q, 'recipe');
      case 'ст. л.': case 'ч. л.': return fmtSpoon(q, ing.unit, 'recipe');
      default: return 'по вкусу';
    }
  }

  function menuFactor(r, guests) {
    if (r.whole) return Math.max(1, Math.ceil(guests / r.serves - EPS));
    return guests / r.serves;
  }

  // Список покупок: складываем одинаковые продукты.
  function buildShopping(menuIds, guests) {
    var items = {}, order = [];
    menuIds.forEach(function (id) {
      var r = byId[id]; if (!r) return;
      var f = menuFactor(r, guests);
      r.ingredients.forEach(function (ing) {
        if (D.NO_BUY[ing.name]) return;
        var it = items[ing.name];
        if (!it) {
          it = items[ing.name] = { name: ing.name, dept: D.DEPT[ing.name] || 'other',
            mass: 0, vol: 0, pcs: 0, st: 0, ch: 0, taste: false };
          order.push(ing.name);
        }
        var q = ing.qty * f;
        switch (ing.unit) {
          case 'г': it.mass += q; break;
          case 'кг': it.mass += q * 1000; break;
          case 'мл': it.vol += q; break;
          case 'л': it.vol += q * 1000; break;
          case 'шт': it.pcs += q; break;
          case 'ст. л.': it.st += q; break;
          case 'ч. л.': it.ch += q; break;
          default: it.taste = true;
        }
      });
    });
    return order.map(function (n) {
      var it = items[n], parts = [];
      if (it.mass > 0) parts.push(fmtMetric(it.mass, 'shop', 'г', 'кг'));
      if (it.vol > 0) parts.push(fmtMetric(it.vol, 'shop', 'мл', 'л'));
      if (it.pcs > 0) parts.push(fmtPcs(it.pcs, 'shop'));
      if (it.st > 0 && it.ch > 0) {
        var tsp = it.st * 3 + it.ch;
        parts.push(tsp >= 3 ? fmtSpoon(tsp / 3, 'ст. л.', 'shop') : fmtSpoon(tsp, 'ч. л.', 'shop'));
      } else if (it.st > 0) parts.push(fmtSpoon(it.st, 'ст. л.', 'shop'));
      else if (it.ch > 0) parts.push(fmtSpoon(it.ch, 'ч. л.', 'shop'));
      if (it.taste) parts.push(parts.length ? 'немного по вкусу' : 'по вкусу');
      return { name: it.name, dept: it.dept, amount: parts.join(' + ') };
    });
  }

  /* ---------- Значки (всегда рядом с подписью) ---------- */
  var ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="currentColor"/><circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="19" r="3" fill="currentColor"/><path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" stroke="currentColor" stroke-width="2"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="9" cy="19" r="1.8" fill="currentColor"/><circle cx="17" cy="19" r="1.8" fill="currentColor"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="currentColor"/></svg>'
  };

  /* ---------- Маршруты ---------- */
  function parseRoute(hash) {
    var h = (hash || '').replace(/^#\/?/, '');
    var m;
    if ((m = /^c\/([\w-]+)$/.exec(h)) && catById[m[1]]) return { name: 'cat', id: m[1] };
    if ((m = /^r\/([\w-]+)$/.exec(h)) && byId[m[1]]) return { name: 'recipe', id: m[1] };
    if (h === 'menu') return { name: 'menu' };
    if (h === 'shop') return { name: 'shop' };
    return { name: 'home' };
  }
  function routeKey(r) { return r.name + (r.id ? '/' + r.id : ''); }
  function parentHash(r) {
    if (r.name === 'recipe') return '#c/' + byId[r.id].cat;
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

  function metaLine(r) {
    var nb = function (t) { return esc(t).replace(/ /g, '\u00a0'); };
    return nb(r.time) + ' · ' + nb(r.level) + ' · ' + nb('на ' + r.serves + ' ' + plural(r.serves, PORTION));
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
      '<h2 class="sec-title">Выберите раздел</h2>' +
      '<nav class="tiles" aria-label="Разделы">' + tiles + '</nav>' +
      '<div class="home-actions">' +
      '<a class="big-btn primary" href="#menu">' + ICON.menu +
      '<span class="big-btn-text">Моё меню на праздник</span>' +
      '<span class="badge" data-testid="menu-count">' + (n ? n + ' ' + plural(n, DISH) : 'пусто') + '</span></a>' +
      '<a class="big-btn" href="#shop">' + ICON.cart +
      '<span class="big-btn-text">Список покупок</span>' +
      '<span class="badge">' + (n ? 'по ' + n + ' ' + plural(n, ['блюду', 'блюдам', 'блюдам']) : 'пусто') + '</span></a>' +
      '</div>';
  }

  function viewCat(id) {
    var c = catById[id];
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

  function portionsOf(r) { return state.portions[r.id] || r.serves; }

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

  function menuButton(r) {
    var inMenu = state.menu.indexOf(r.id) >= 0;
    return inMenu
      ? '<button class="btn btn-outline" data-act="menu-toggle" data-id="' + r.id + '">' + ICON.check + 'В меню · Убрать из меню</button>'
      : '<button class="btn btn-primary" data-act="menu-toggle" data-id="' + r.id + '">' + ICON.plus + 'Добавить в меню</button>';
  }

  function viewRecipe(id) {
    var r = byId[id];
    setHeader(r.title, true);
    var p = portionsOf(r), factor = p / r.serves;
    var done = state.steps[r.id] || [];
    var steps = r.steps.map(function (s, k) {
      var isDone = done.indexOf(k) >= 0;
      return '<li><button class="step' + (isDone ? ' done' : '') + '" data-act="step" data-id="' + r.id + '" data-i="' + k + '" aria-pressed="' + isDone + '">' +
        '<span class="step-num">' + (k + 1) + '</span>' +
        '<span class="step-text">' + esc(s) + '</span>' +
        '<span class="step-done">' + ICON.check + 'Сделано</span></button></li>';
    }).join('');
    var wholeNote = r.whole ? '<p class="note">Рецепт на один ' + esc(r.whole) + ' — ' + r.serves + ' ' + plural(r.serves, PORTION) + '.</p>' : '';
    return '<div class="r-hero">' + ART.dish(r.id) + '</div>' +
      '<h1 class="page-title">' + esc(r.title) + '</h1>' +
      '<ul class="facts">' +
      '<li><span class="fact-k">Время</span><span class="fact-v">' + esc(r.time) + (r.wait ? ' <span class="wait">' + esc(r.wait) + '</span>' : '') + '</span></li>' +
      '<li><span class="fact-k">Сложность</span><span class="fact-v">' + esc(r.level) + '</span></li>' +
      '<li><span class="fact-k">Выход</span><span class="fact-v">' + r.serves + ' ' + plural(r.serves, PORTION) + (r.note ? ' (' + esc(r.note) + ')' : '') + '</span></li>' +
      '</ul>' +
      '<div class="actions">' + menuButton(r) +
      '<button class="btn btn-secondary" data-act="share-recipe" data-id="' + r.id + '">' + ICON.share + 'Поделиться</button></div>' +
      '<section class="card"><h2>Ингредиенты</h2>' +
      '<div class="stepper" role="group" aria-label="Количество порций"><span class="stepper-label">Порций:</span>' +
      '<button class="round" data-act="por-" data-id="' + r.id + '" aria-label="Меньше порций"' + (p <= MIN_PEOPLE ? ' disabled' : '') + '>−</button>' +
      '<output class="stepper-val" data-testid="portions">' + p + '</output>' +
      '<button class="round" data-act="por+" data-id="' + r.id + '" aria-label="Больше порций"' + (p >= MAX_PEOPLE ? ' disabled' : '') + '>+</button></div>' +
      wholeNote + ingredientList(r, factor) + '</section>' +
      '<section class="card"><h2>Как готовить</h2><p class="hint">Нажмите на шаг, когда сделаете его, — он отметится.</p>' +
      '<ol class="steps">' + steps + '</ol>' +
      (done.length ? '<button class="btn btn-link" data-act="steps-reset" data-id="' + r.id + '">Снять все отметки</button>' : '') +
      '</section>' +
      '<aside class="tip"><span class="tip-k">' + ICON.star + 'Совет хозяйке</span><p>' + esc(r.tip) + '</p></aside>' +
      '<div class="actions">' + menuButton(r) +
      '<button class="btn btn-secondary" data-act="share-recipe" data-id="' + r.id + '">' + ICON.share + 'Поделиться рецептом</button></div>';
  }

  function guestsStepper() {
    var g = state.guests;
    return '<div class="stepper big" role="group" aria-label="Число гостей"><span class="stepper-label">Гостей:</span>' +
      '<button class="round" data-act="guests-" aria-label="Меньше гостей"' + (g <= MIN_PEOPLE ? ' disabled' : '') + '>−</button>' +
      '<output class="stepper-val" data-testid="guests">' + g + '</output>' +
      '<button class="round" data-act="guests+" aria-label="Больше гостей"' + (g >= MAX_PEOPLE ? ' disabled' : '') + '>+</button></div>';
  }

  function dishAmount(r) {
    if (r.whole) {
      var k = menuFactor(r, state.guests), f = WHOLE_FORMS[r.whole] || [r.whole, r.whole, r.whole];
      return k + ' ' + plural(k, f) + ' по ' + r.serves + ' ' + plural(r.serves, PORTION);
    }
    return 'на ' + state.guests + ' ' + plural(state.guests, PORTION);
  }

  function viewMenu() {
    setHeader('Моё меню', true);
    if (!state.menu.length) {
      return '<h1 class="page-title">Моё меню на праздник</h1>' +
        '<div class="empty">' + '<div class="empty-art">' + ART.empty() + '</div>' +
        '<p>В меню пока нет блюд. Откройте любой рецепт и нажмите «Добавить в меню».</p>' +
        '<p>Или соберите готовое праздничное меню одним нажатием: два салата, горячее, закуска и сладкое.</p></div>' +
        '<div class="actions col">' +
        '<button class="btn btn-primary" data-act="ready-menu">' + ICON.star + 'Готовое меню</button>' +
        '<a class="btn btn-secondary" href="#">Выбрать блюда самому</a></div>';
    }
    var groups = D.CATEGORIES.map(function (c) {
      var ids = state.menu.filter(function (id) { return byId[id].cat === c.id; });
      if (!ids.length) return '';
      return '<h2 class="sec-title">' + esc(c.title) + '</h2><ul class="mlist">' + ids.map(function (id) {
        var r = byId[id];
        return '<li class="mitem"><a class="mitem-link" href="#r/' + id + '">' +
          '<span class="mitem-art">' + ART.dish(id) + '</span>' +
          '<span class="mitem-body"><span class="mitem-title">' + esc(r.title) + '</span>' +
          '<span class="mitem-meta">' + dishAmount(r) + '</span></span></a>' +
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
    var items = buildShopping(state.menu, state.guests);
    var total = items.length, got = items.filter(function (it) { return state.bought[it.name]; }).length;
    var n = state.menu.length;
    var groups = D.DEPARTMENTS.map(function (d) {
      var list = items.filter(function (it) { return it.dept === d.id; });
      if (!list.length) return '';
      return '<h2 class="sec-title">' + esc(d.title) + '</h2><ul class="shop">' + list.map(function (it) {
        var b = !!state.bought[it.name];
        return '<li class="' + (b ? 'bought' : '') + '"><label class="chk">' +
          '<input type="checkbox" data-act="buy" data-name="' + esc(it.name) + '"' + (b ? ' checked' : '') + '>' +
          '<span class="box" aria-hidden="true">' + ICON.check + '</span>' +
          '<span class="shop-name">' + esc(it.name) + '</span>' +
          '<span class="shop-q">' + esc(it.amount) + '</span></label></li>';
      }).join('') + '</ul>';
    }).join('');
    return '<h1 class="page-title">Список покупок</h1>' +
      '<p class="lead">Для ' + n + ' ' + plural(n, ['блюда', 'блюд', 'блюд']) + ' на ' + guestsText(state.guests) + '. Нажимайте на продукт, когда купите его.</p>' +
      '<p class="progress" data-testid="progress">Куплено: <b>' + got + '</b> из ' + total + '</p>' +
      groups +
      '<div class="actions col">' +
      '<button class="btn btn-primary" data-act="share-shop">' + ICON.share + 'Поделиться списком</button>' +
      (got ? '<button class="btn btn-outline" data-act="buy-reset">Снять все галочки</button>' : '') +
      '<a class="btn btn-outline" href="#menu">' + ICON.menu + 'Изменить меню</a></div>';
  }

  function render() {
    var r = parseRoute(location.hash);
    current = r;
    var html;
    if (r.name === 'cat') html = viewCat(r.id);
    else if (r.name === 'recipe') html = viewRecipe(r.id);
    else if (r.name === 'menu') html = viewMenu();
    else if (r.name === 'shop') html = viewShop();
    else html = viewHome();
    app.innerHTML = html;
    app.setAttribute('data-view', r.name);
  }

  // Перерисовать текущий экран, сохранив прокрутку и фокус.
  function rerender() {
    var y = window.scrollY, a = document.activeElement, key = null;
    if (a && a.getAttribute && a.getAttribute('data-act')) {
      key = '[data-act="' + a.getAttribute('data-act') + '"]' + (a.getAttribute('data-id') ? '[data-id="' + a.getAttribute('data-id') + '"]' : '');
    }
    render();
    window.scrollTo(0, y);
    if (key) {
      var el = app.querySelector(key);
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  /* ---------- Тексты «Поделиться» ---------- */
  function footer(hash) { return '\n\nРецепты к Новому году — ' + APP_URL + (hash || ''); }

  function recipeText(r) {
    var p = portionsOf(r), f = p / r.serves;
    var lines = ['🎄 ' + r.title, 'Время: ' + r.time + (r.wait ? ' ' + r.wait : '') + ' · Порций: ' + p, '', 'Ингредиенты:'];
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
    var lines = ['🎄 Моё новогоднее меню на ' + guestsText(state.guests)];
    D.CATEGORIES.forEach(function (c) {
      var ids = state.menu.filter(function (id) { return byId[id].cat === c.id; });
      if (!ids.length) return;
      lines.push('', c.title + ':');
      ids.forEach(function (id) { lines.push('• ' + byId[id].title + ' — ' + APP_URL + '#r/' + id); });
    });
    return lines.join('\n') + footer('');
  }
  function shopText() {
    var items = buildShopping(state.menu, state.guests);
    var left = items.filter(function (it) { return !state.bought[it.name]; });
    var partial = left.length > 0 && left.length < items.length;
    var use = left.length ? left : items;
    var lines = ['🛒 Список покупок к новогоднему столу (' + guestsText(state.guests) + ')' + (partial ? ' — ещё купить:' : '')];
    D.DEPARTMENTS.forEach(function (d) {
      var list = use.filter(function (it) { return it.dept === d.id; });
      if (!list.length) return;
      lines.push('', d.title + ':');
      list.forEach(function (it) { lines.push('• ' + it.name + ' — ' + it.amount); });
    });
    return lines.join('\n') + footer('');
  }

  /* ---------- Поделиться / скопировать ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); t.hidden = true; }, 3200);
  }
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
  function showManualCopy(text) {
    var m = document.getElementById('copy-modal');
    m.querySelector('textarea').value = text;
    m.hidden = false;
    m.querySelector('textarea').focus();
    m.querySelector('textarea').select();
  }
  function copyText(text) {
    function done() { toast('Скопировано — вставьте в сообщение'); }
    function fallback() { if (legacyCopy(text)) done(); else showManualCopy(text); }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
        return;
      }
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
  function toggleMenu(id) {
    var k = state.menu.indexOf(id);
    if (k >= 0) { state.menu.splice(k, 1); toast('Убрано из меню'); }
    else { state.menu.push(id); toast('Добавлено в меню'); }
    save(); rerender();
  }

  var actions = {
    'menu-toggle': function (el) { toggleMenu(el.getAttribute('data-id')); },
    'menu-remove': function (el) {
      var id = el.getAttribute('data-id'), k = state.menu.indexOf(id);
      if (k >= 0) state.menu.splice(k, 1);
      save(); rerender(); toast('Убрано из меню');
    },
    'ready-menu': function () {
      state.menu = D.READY_MENU.slice();
      save(); rerender(); window.scrollTo(0, 0); toast('Готовое меню собрано');
    },
    'por-': function (el) { changePortions(el.getAttribute('data-id'), -1); },
    'por+': function (el) { changePortions(el.getAttribute('data-id'), 1); },
    'guests-': function () { state.guests = clamp(state.guests - 1, MIN_PEOPLE, MAX_PEOPLE); save(); rerender(); },
    'guests+': function () { state.guests = clamp(state.guests + 1, MIN_PEOPLE, MAX_PEOPLE); save(); rerender(); },
    'step': function (el) {
      var id = el.getAttribute('data-id'), k = +el.getAttribute('data-i');
      var arr = state.steps[id] || [], pos = arr.indexOf(k);
      if (pos >= 0) arr.splice(pos, 1); else arr.push(k);
      if (arr.length) state.steps[id] = arr; else delete state.steps[id];
      save(); rerender();
    },
    'steps-reset': function (el) { delete state.steps[el.getAttribute('data-id')]; save(); rerender(); },
    'buy-reset': function () { state.bought = {}; save(); rerender(); },
    'share-recipe': function (el) { var r = byId[el.getAttribute('data-id')]; share(r.title, recipeText(r)); },
    'share-menu': function () { share('Моё новогоднее меню', menuText()); },
    'share-shop': function () { share('Список покупок', shopText()); }
  };
  function changePortions(id, d) {
    var r = byId[id];
    state.portions[id] = clamp(portionsOf(r) + d, MIN_PEOPLE, MAX_PEOPLE);
    rerender();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el && el.tagName !== 'INPUT' && actions[el.getAttribute('data-act')]) {
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
      if (el.checked) state.bought[name] = true; else delete state.bought[name];
      save(); rerender();
    }
  });
  backBtn.addEventListener('click', function () { goBack(); });
  document.getElementById('copy-close').addEventListener('click', function () {
    document.getElementById('copy-modal').hidden = true;
  });
  window.addEventListener('popstate', function (e) {
    render();
    var y = e.state && e.state.scroll ? e.state.scroll : 0;
    window.scrollTo(0, y);
  });
  window.addEventListener('hashchange', function () {
    if (routeKey(parseRoute(location.hash)) !== routeKey(current)) { render(); window.scrollTo(0, 0); }
  });

  load();
  render();

  // Для автотеста и проверяющих.
  window.NYR = { buildShopping: buildShopping, fmtIng: fmtIng, state: state, menuFactor: menuFactor };
})();
