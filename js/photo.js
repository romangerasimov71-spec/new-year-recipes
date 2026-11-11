/* Новогодний стол: рецепты — «сцена» с фото вверху рецепта (проба на оливье).
   Слои кадра 4:5: пустая тарелка (plate) → продукты (ingredients, 2–3 полосы) → готовое блюдо (done) → подписи.
   Листаешь вниз — продукты падают в тарелку, проявляется готовое блюдо; вверх — обратно.
   Кнопка «Смешать» проигрывает то же за 1,8 с. Двигаем только transform и opacity, кадры — через requestAnimationFrame.
   Пока фото не загрузились (или если не загрузились совсем) — рисованная картинка блюда.
   Общий код: чтобы добавить фото другому рецепту, достаточно поля photo в js/recipes.js. */
(function () {
  'use strict';

  var FILES = ['plate.webp', 'ingredients.webp', 'done.webp'];
  var PLAY_MS = 1800, BACK_MS = 400;
  var SCROLL_FRAC = 0.7;          // прогресс 0 → 1 за 70 % высоты экрана прокрутки
  var HOLD_RELEASE = 40;          // после кнопки: прокрутка вверх на 40 px отдаёт сцену прокрутке
  var TXT_PLAY = '▶︎ Смешать', TXT_AGAIN = '↺ Ещё раз';
  var HINT = 'Листайте вниз — продукты упадут в тарелку';

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var loads = Object.create(null); // dir → Promise
  var S = null;                    // текущая сцена на экране
  var ticking = false;
  var lastVW = 0, lastVH = 0;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function reduced() { return !!(mq && mq.matches); }

  /* ---------- Разметка ---------- */
  function thumb(r) {
    if (!r.photo || !r.photo.thumb) return '';
    return '<img class="thumb-photo" src="' + esc(r.photo.dir + r.photo.thumb) + '" alt="" width="360" height="270" ' +
      'loading="lazy" decoding="async" data-ph-thumb="' + esc(r.id) + '" onerror="NYR_PHOTO.thumbFail(this)">';
  }
  function thumbFail(img) {
    var id = img.getAttribute('data-ph-thumb');
    if (window.NYR_ART && img.parentNode) img.outerHTML = window.NYR_ART.dish(id);
  }

  // Кнопка «Смешать». where: 'pin' — под сценой; 'side' — рядом с названием (когда сцена слева: альбом, компьютер).
  function controls(r, where) {
    return '<div class="ph-ctl ph-ctl-' + where + '"><button class="btn btn-primary ph-btn" type="button" data-act="ph-play" data-id="' +
      esc(r.id) + '">' + TXT_PLAY + '</button>' + (where === 'side' ? '<p class="ph-side-hint">' + HINT + '</p>' : '') + '</div>';
  }

  function scene(r) {
    var ph = r.photo;
    var bands = (ph.bands && ph.bands.length ? ph.bands : [{}]).map(function (b, k) {
      var st = 'transform-origin:' + (b.cx || 50) + '% ' + (b.cy || 30) + '%';
      if (b.clip) st += ';-webkit-clip-path:' + b.clip + ';clip-path:' + b.clip;
      return '<img class="ph-img ph-band" alt="" draggable="false" data-k="' + k + '" style="' + st + '">';
    }).join('');
    var fit = ph.fit ? ' style="transform:translate(' + ph.fit.x + '%,' + ph.fit.y + '%) scale(' + ph.fit.s + ')"' : '';
    var labels = (ph.labels || []).map(function (l, k) {
      return '<span class="ph-lbl" data-k="' + k + '">' + esc(l.text) + '</span>';
    }).join('');
    return '<div class="ph" data-ph="' + esc(r.id) + '">' +
      '<div class="ph-pin">' +
        '<div class="ph-stage" role="img" aria-label="' + esc(ph.alt || r.title) + '">' +
          '<div class="ph-svg" aria-hidden="true">' + window.NYR_ART.dish(r.id) + '</div>' +
          '<div class="ph-layers" aria-hidden="true">' +
            '<img class="ph-img ph-plate" alt="" draggable="false">' + bands +
            '<img class="ph-img ph-done" alt="" draggable="false"' + fit + '>' +
            '<div class="ph-labels"><svg class="ph-lines" xmlns="http://www.w3.org/2000/svg"></svg>' + labels + '</div>' +
            '<div class="ph-hint">' + HINT + '</div>' +
          '</div>' +
        '</div>' +
        controls(r, 'pin') +
      '</div></div>';
  }

  /* ---------- Загрузка ---------- */
  function loadOne(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () {
        if (im.decode) im.decode().then(function () { res(im); }, function () { res(im); });
        else res(im);
      };
      im.onerror = function () { rej(new Error('photo ' + url)); };
      im.src = url;
    });
  }
  function load(ph) {
    if (!loads[ph.dir]) {
      loads[ph.dir] = Promise.all(FILES.map(function (f) { return loadOne(ph.dir + f); }));
      loads[ph.dir].then(function () { loads[ph.dir].ok = true; }, function () { loads[ph.dir].failed = true; });
    }
    return loads[ph.dir];
  }

  /* ---------- Подключение к экрану ---------- */
  // Вызывается после каждой перерисовки экрана. keep — сцена, которая была на экране до перерисовки:
  // если это тот же рецепт, возвращаем её на место (картинки и положение анимации сохраняются).
  function mount(app, recipeById) {
    var el = app.querySelector('.ph');
    if (!el) { S = null; return; }
    var id = el.getAttribute('data-ph');
    if (S && S.id === id && S.el !== el) {
      el.parentNode.replaceChild(S.el, el);
      grabControls(); layout(); apply(S.p, true);
      return;
    }
    var r = recipeById(id);
    if (!r || !r.photo) return;
    S = {
      el: el, id: id, ph: r.photo, ready: false, p: 0, shown: -1, mode: 'scroll', tween: null, holdY: 0,
      bands: [].slice.call(el.querySelectorAll('.ph-band')),
      done: el.querySelector('.ph-done'), labels: el.querySelector('.ph-labels'), hint: el.querySelector('.ph-hint'),
      btns: [], hints: [], btnTxt: '',
      startY: 0, dist: 1
    };
    var mine = S, pr = load(r.photo);
    if (pr.ok) ready(mine);
    else if (!pr.failed) pr.then(function () { ready(mine); }, function () { fail(mine); });
    else fail(mine);
  }

  function fail(s) { if (s === S) s.el.classList.add('ph-failed'); }

  function ready(s) {
    if (s !== S) return;
    var dir = s.ph.dir;
    s.el.querySelector('.ph-plate').src = dir + 'plate.webp';
    s.bands.forEach(function (b) { b.src = dir + 'ingredients.webp'; });
    s.done.src = dir + 'done.webp';
    s.ready = true;
    s.el.classList.add('ph-ready');
    setTimeout(function () { if (s.el) s.el.classList.add('ph-svg-off'); }, 400);
    grabControls();
    var before = s.el.offsetHeight, wasY = window.pageYOffset, above = s.el.getBoundingClientRect().bottom < 0;
    layout();
    // Сцену удлинили, а человек уже пролистал её ниже — сдвигаем прокрутку, чтобы текст под ним не прыгнул.
    var grow = s.el.offsetHeight - before;
    if (grow > 0 && above) window.scrollTo(0, wasY + grow);
    s.shown = -1;
    if (reduced()) apply(s.p, true); else frame(performance.now());
  }

  /* ---------- Размеры (только при открытии и смене размера окна) ---------- */
  function setVars() {
    var root = document.documentElement, w = window.innerWidth, h = window.innerHeight;
    // Высоту экрана обновляем только при заметной смене (поворот), а не когда у браузера прячется адресная строка.
    if (w !== lastVW || Math.abs(h - lastVH) > 120) {
      lastVW = w; lastVH = h;
      root.style.setProperty('--vh', h + 'px');
    }
    var hdr = document.querySelector('.hdr');
    if (hdr) root.style.setProperty('--hdr-h', hdr.offsetHeight + 'px');
    return hdr ? hdr.offsetHeight : 0;
  }

  function layout() {
    if (!S || !S.ready) return;
    var el = S.el, hdrH = setVars();
    S.reduce = reduced();
    el.classList.toggle('ph-static', S.reduce);
    el.style.height = '';
    if (!S.reduce) {
      var pin = el.querySelector('.ph-pin'), pinH = pin.offsetHeight;
      var docTop = el.getBoundingClientRect().top + window.pageYOffset;
      var vh = lastVH || window.innerHeight;
      S.dist = Math.max(120, SCROLL_FRAC * vh);
      S.startY = Math.max(0, docTop - hdrH - 0.3 * vh);
      // Сцена «прилипает» к верху, пока прогресс не дойдёт до 1.
      var extra = S.startY + S.dist - (docTop - hdrH);
      el.style.height = (pinH + Math.max(0, extra)) + 'px';
    }
    layoutLabels();
  }

  // Плашки подписей: слева или справа у края кадра, на высоте своей группы; тонкая линия — к центру группы.
  function layoutLabels() {
    var stage = S.el.querySelector('.ph-stage'), W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    var pills = S.el.querySelectorAll('.ph-lbl');
    var m = Math.max(5, Math.round(W * 0.02)), gap = 5, off = 9;
    var items = (S.ph.labels || []).map(function (l, k) {
      var el = pills[k], w = el.offsetWidth, h = el.offsetHeight;
      var tx = l.x / 100 * W, ty = l.y / 100 * H;
      var x = l.side === 'right' ? W - m - w : m;
      var over = tx > x - 6 && tx < x + w + 6;          // плашка закрыла бы саму группу — ставим её над группой
      return { el: el, w: w, h: h, tx: tx, ty: ty, x: x, y: over ? ty - off - h : ty - h / 2, over: over, side: l.side };
    });
    ['left', 'right'].forEach(function (side) {
      var list = items.filter(function (it) { return (it.side === 'right') === (side === 'right'); })
        .sort(function (a, b) { return a.y - b.y; });
      for (var pass = 0; pass < 3; pass++) {
        for (var i = 0; i < list.length; i++) {
          var it = list[i], prev = list[i - 1];
          if (it.y < m) it.y = m;
          if (prev && it.y < prev.y + prev.h + gap) {
            it.y = prev.y + prev.h + gap;
            if (it.over && it.y + it.h > it.ty - 2) it.y = it.ty + off;   // не влезла над группой — под неё
          }
        }
        for (var j = list.length - 1; j >= 0; j--) {
          var a = list[j], next = list[j + 1];
          if (a.y + a.h > H - m) a.y = H - m - a.h;
          if (next && a.y + a.h + gap > next.y) a.y = next.y - gap - a.h;
        }
      }
    });
    var lines = '';
    items.forEach(function (it) {
      it.el.style.left = Math.round(it.x) + 'px';
      it.el.style.top = Math.round(it.y) + 'px';
      var ax, ay;
      if (it.over) { ax = Math.min(Math.max(it.tx, it.x + 12), it.x + it.w - 12); ay = it.ty < it.y ? it.y : it.y + it.h; }
      else { ax = it.side === 'right' ? it.x : it.x + it.w; ay = it.y + it.h / 2; }
      lines += '<line x1="' + ax.toFixed(1) + '" y1="' + ay.toFixed(1) + '" x2="' + it.tx.toFixed(1) + '" y2="' + it.ty.toFixed(1) + '"/>' +
        '<circle cx="' + it.tx.toFixed(1) + '" cy="' + it.ty.toFixed(1) + '" r="3.5"/>';
    });
    var svg = S.el.querySelector('.ph-lines');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = lines;
  }

  /* ---------- Кадр анимации ---------- */
  function apply(p, force) {
    if (!S || !S.ready) return;
    if (!force && Math.abs(p - S.shown) < 0.0005) return;
    S.shown = p;
    var cfg = S.ph.bands && S.ph.bands.length ? S.ph.bands : [{ cx: 50, cy: 30, y: 75, s: 0.5, from: 0, to: 0.7 }];
    var toX = S.ph.toX != null ? S.ph.toX : 50;
    // Готовое блюдо проявляется поверх (кадр done непрозрачный и закрывает продукты), продукты гаснут под ним.
    var fade = 1 - smooth((p - 0.7) / 0.2);
    for (var k = 0; k < S.bands.length; k++) {
      var b = cfg[k] || cfg[0], img = S.bands[k];
      if (S.reduce) img.style.transform = 'none';
      else {
        // Вниз — с ускорением (t²), к центру и в размер горки — чуть раньше (t^1,5).
        var t = clamp01((p - b.from) / (b.to - b.from)), e = t * t, eh = t * Math.sqrt(t);
        var tx = (toX - b.cx) * eh, ty = (b.y - b.cy) * e, sc = 1 - (1 - b.s) * eh;
        img.style.transform = 'translate3d(' + tx.toFixed(2) + '%,' + ty.toFixed(2) + '%,0) scale(' + sc.toFixed(4) + ')';
      }
      img.style.opacity = fade.toFixed(3);
    }
    S.done.style.opacity = smooth((p - 0.6) / 0.32).toFixed(3);
    var lo = 1 - clamp01(p / 0.1);
    S.labels.style.opacity = lo.toFixed(3);
    S.labels.style.visibility = lo > 0 ? '' : 'hidden';
    var ho = S.reduce ? 0 : 1 - clamp01(p / 0.05);
    for (var h = 0; h < S.hints.length; h++) {
      S.hints[h].style.opacity = ho.toFixed(3);
      S.hints[h].style.visibility = ho > 0 ? '' : 'hidden';
    }
    var txt = p >= 0.999 ? TXT_AGAIN : TXT_PLAY;
    if (txt !== S.btnTxt) {
      S.btnTxt = txt;
      for (var i = 0; i < S.btns.length; i++) S.btns[i].textContent = txt;
    }
  }

  // Кнопки и подсказки (под сценой и рядом с названием) — находим один раз после перерисовки экрана.
  function grabControls() {
    if (!S) return;
    var app = S.el.ownerDocument;
    S.btns = [].slice.call(app.querySelectorAll('[data-act="ph-play"][data-id="' + S.id + '"]'));
    S.hints = [S.hint].concat([].slice.call(app.querySelectorAll('.ph-side-hint')));
    S.btnTxt = '';
    S.btns.forEach(function (b) { b.parentNode.classList.toggle('ph-on', S.ready); });
  }

  function scrollP() { return clamp01((window.pageYOffset - S.startY) / S.dist); }

  function frame(now) {
    ticking = false;
    if (!S || !S.ready) return;
    var more = false, y = window.pageYOffset;
    if (S.tween) {
      var tw = S.tween, t = (now - tw.t0) / tw.dur;
      if (t >= 1) {
        S.p = tw.to; S.tween = null;
        if (tw.then) { startTween(tw.then.to, tw.then.dur); more = true; }
        else { S.mode = 'hold'; S.holdY = y; }
      } else { S.p = tw.from + (tw.to - tw.from) * Math.max(0, t); more = true; }
    } else if (!S.reduce) {
      var sp = scrollP();
      if (S.mode === 'hold') {
        if (y > S.holdY) S.holdY = y;
        if (y < S.holdY - HOLD_RELEASE) S.mode = 'catch';
      }
      if (S.mode === 'catch') {
        S.p += (sp - S.p) * 0.22;
        if (Math.abs(sp - S.p) < 0.004) { S.p = sp; S.mode = 'scroll'; } else more = true;
      } else if (S.mode === 'scroll') S.p = sp;
    }
    apply(S.p);
    if (more) tick();
  }
  function tick() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

  function startTween(to, dur, then) {
    S.tween = { from: S.p, to: to, t0: performance.now(), dur: dur, then: then || null };
    tick();
  }

  function play() {
    if (!S || !S.ready) return;
    if (S.reduce) {             // без движения: просто смена кадра
      S.p = S.p >= 0.5 ? 0 : 1; apply(S.p, true); return;
    }
    if (S.tween) return;
    if (S.p >= 0.999) startTween(0, BACK_MS, { to: 1, dur: PLAY_MS });
    else startTween(1, Math.max(500, PLAY_MS * (1 - S.p)));
  }

  window.addEventListener('scroll', function () { if (S && S.ready && !S.reduce) tick(); }, { passive: true });
  window.addEventListener('resize', function () {
    if (!S || !S.ready) return;
    // У телефона при прокрутке прячется адресная строка и приходит resize — сцену из-за этого не пересчитываем.
    if (window.innerWidth === lastVW && Math.abs(window.innerHeight - lastVH) <= 120) return;
    layout(); S.shown = -1; tick();
  });
  if (mq) {
    var onMq = function () { if (S && S.ready) { layout(); if (S.reduce) { S.tween = null; S.p = S.p >= 0.5 ? 1 : 0; } apply(S.p, true); } };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  window.NYR_PHOTO = { scene: scene, controls: controls, thumb: thumb, thumbFail: thumbFail, mount: mount, play: play,
    state: function () { return S ? { id: S.id, ready: S.ready, p: S.p, mode: S.mode, reduce: !!S.reduce, startY: S.startY, dist: S.dist } : null; } };
})();
