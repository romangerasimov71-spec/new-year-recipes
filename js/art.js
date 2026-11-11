/* Новогодний стол: рецепты — иллюстрации кодом (инлайн-SVG).
   Плоский стиль, тёплые цвета, посуда и лёгкие новогодние детали.
   Никаких внешних картинок. */
(function () {
  'use strict';

  /* ---------- Основа ---------- */
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function E(cx, cy, rx, ry, fill, x) { return '<ellipse cx="' + f(cx) + '" cy="' + f(cy) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + fill + '"' + (x || '') + '/>'; }
  function C(cx, cy, r, fill, x) { return '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="' + fill + '"' + (x || '') + '/>'; }
  function P(d, fill, x) { return '<path d="' + d + '" fill="' + fill + '"' + (x || '') + '/>'; }
  function R(x, y, w, h, rx, fill, ex) { return '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx="' + f(rx) + '" fill="' + fill + '"' + (ex || '') + '/>'; }
  function G(tr, inner) { return '<g transform="' + tr + '">' + inner + '</g>'; }
  function st(color, w) { return ' stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"'; }
  function rot(a, x, y) { return ' transform="rotate(' + f(a) + ' ' + f(x) + ' ' + f(y) + ')"'; }

  // Точки внутри эллипса (top: только верхняя половина — для «горки» салата).
  function inEllipse(rand, cx, cy, rx, ry, top) {
    var a = rand() * Math.PI * (top ? 1 : 2), u = Math.sqrt(rand());
    return [cx + Math.cos(a) * rx * u, cy - Math.sin(a) * ry * u];
  }

  var COL = {
    plate: '#FFFDF8', rim: '#E7DAC6', well: '#F3EADC', shadow: 'rgba(90,50,20,.13)',
    dill: '#4F8E3A', fir: '#2E5E45', fir2: '#3F7A58', red: '#C0392B', gold: '#D9A441',
    mayo: '#FFF8E7', egg: '#FFFFFF', yolk: '#F6C445', carrot: '#EE8A3A', potato: '#F4E4B0',
    pea: '#76AE3F', pickle: '#86A33A', beet: '#7E2448', wood: '#C8925A', wood2: '#A8743F'
  };
  var BG = { salads: '#E6EEDB', hot: '#F7E0CC', snacks: '#F4E8C8', sweets: '#F6DFDF', trendy: '#E2E9F3', other: '#F4E7D6' };

  /* ---------- Детали ---------- */
  function shadow(cx, cy, rx, ry) { return E(cx, cy, rx, ry, COL.shadow); }
  function plateSide(cx, cy, rx, ry) {
    return shadow(cx, cy + 5, rx, ry) + E(cx, cy, rx, ry, COL.rim) + E(cx, cy - 1.5, rx - 2.5, ry - 2.5, COL.plate) +
      E(cx, cy, rx * 0.7, ry * 0.64, COL.well);
  }
  function plateTop(cx, cy, rx, ry) {
    return shadow(cx + 3, cy + 5, rx, ry) + E(cx, cy, rx, ry, COL.rim) + E(cx, cy - 1, rx - 3, ry - 3, COL.plate) +
      E(cx, cy, rx * 0.74, ry * 0.74, COL.well) + E(cx, cy - 1, rx * 0.72, ry * 0.72, COL.plate);
  }
  function dill(x, y, s, a) {
    return G('translate(' + f(x) + ' ' + f(y) + ') rotate(' + (a || 0) + ') scale(' + (s || 1) + ')',
      P('M0 0V-18M0-4l-6-5M0-4l6-5M0-9l-5-5M0-9l5-5M0-14l-4-4M0-14l4-4', 'none', st(COL.dill, 1.8)));
  }
  function parsley(x, y, s) {
    return G('translate(' + f(x) + ' ' + f(y) + ') scale(' + (s || 1) + ')',
      C(0, 0, 4, '#4E9A3C') + C(4, -3, 3.6, '#5DAA45') + C(-4, -3, 3.6, '#5DAA45') + C(0, -6, 3.4, '#4E9A3C') + P('M0 0v6', 'none', st('#3D7A2E', 1.4)));
  }
  function pea(x, y, r) { r = r || 3.2; return C(x, y, r, COL.pea) + C(x - r * 0.35, y - r * 0.35, r * 0.35, '#B5DB7C'); }
  function cube(x, y, s, color, a) {
    return R(x - s / 2, y - s / 2, s, s, 1.4, color, rot(a, x, y)) +
      R(x - s / 2, y - s / 2, s, s * 0.3, 1, 'rgba(255,255,255,.35)', rot(a, x, y));
  }
  function steam(x, y, n) {
    var out = '';
    for (var k = 0; k < (n || 3); k++) {
      var sx = x + k * 16;
      out += P('M' + sx + ' ' + y + 'c-6-7 6-11 0-18s6-11 0-18', 'none', st('rgba(255,255,255,.85)', 3.2));
    }
    return out;
  }
  // Линии (сеточка майонеза) внутри эллипса.
  function chords(cx, cy, rx, ry, ang, gap, color, w) {
    var dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, d = '', m = Math.max(rx, ry);
    for (var s = -m + gap / 2; s < m; s += gap) {
      var px = s * nx, py = s * ny;
      var A = dx * dx / (rx * rx) + dy * dy / (ry * ry);
      var B = 2 * (px * dx / (rx * rx) + py * dy / (ry * ry));
      var Cc = px * px / (rx * rx) + py * py / (ry * ry) - 1;
      var disc = B * B - 4 * A * Cc;
      if (disc <= 0) continue;
      var t1 = (-B - Math.sqrt(disc)) / (2 * A) * 0.92, t2 = (-B + Math.sqrt(disc)) / (2 * A) * 0.92;
      d += 'M' + f(cx + px + t1 * dx) + ' ' + f(cy + py + t1 * dy) + 'L' + f(cx + px + t2 * dx) + ' ' + f(cy + py + t2 * dy);
    }
    return P(d, 'none', st(color, w));
  }
  // Ветка ели с шариком — в правом верхнем углу каждой картинки.
  function fir() {
    var out = P('M248 6 L196 30', 'none', st('#6B4A2A', 2.4));
    for (var k = 0; k < 9; k++) {
      var t = k / 8, x = 248 - 52 * t, y = 6 + 24 * t;
      out += P('M' + f(x) + ' ' + f(y) + 'l-7-9M' + f(x) + ' ' + f(y) + 'l-3 11', 'none', st(k % 2 ? COL.fir : COL.fir2, 2.6));
    }
    out += P('M214 22v12', 'none', st('#B08A3A', 1.2)) + R(211, 32, 6, 4, 1, COL.gold) + C(214, 43, 7.5, COL.red) +
      C(211.5, 40.5, 2.2, 'rgba(255,255,255,.6)');
    return out;
  }
  function snow(rand) {
    var out = '';
    for (var k = 0; k < 14; k++) out += C(rand() * 240, rand() * 180, 1 + rand() * 1.6, 'rgba(255,255,255,.75)');
    return out;
  }
  function frame(bg, label, inner, seed) {
    return '<svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + label +
      '"><rect x="-400" y="-60" width="1040" height="300" fill="' + bg + '"/>' +
      snow(rng(seed || 7)) + inner + fir() + '</svg>';
  }

  // Салатник сбоку: горка салата (fill) и корпус миски.
  function bowl(o) {
    var cx = o.cx || 120, top = o.top || 98, w = o.w || 150, h = o.h || 52, rx = w / 2, ry = w * 0.13;
    var L = cx - rx, Rr = cx + rx;
    var out = shadow(cx, top + h + 4, rx * 0.75, 9);
    out += E(cx, top, rx, ry, o.inner || '#E9DCC6');
    out += o.mound || '';
    var body = 'M' + f(L) + ' ' + f(top) + 'A' + f(rx) + ' ' + f(ry) + ' 0 0 0 ' + f(Rr) + ' ' + f(top) +
      'C' + f(Rr) + ' ' + f(top + h * 0.85) + ' ' + f(cx + rx * 0.45) + ' ' + f(top + h) + ' ' + f(cx) + ' ' + f(top + h) +
      'C' + f(cx - rx * 0.45) + ' ' + f(top + h) + ' ' + f(L) + ' ' + f(top + h * 0.85) + ' ' + f(L) + ' ' + f(top) + 'Z';
    out += P(body, o.color || '#FDF8F0');
    out += P('M' + f(L + 6) + ' ' + f(top + 14) + 'C' + f(L + 30) + ' ' + f(top + h * 0.9) + ' ' + f(cx - 10) + ' ' + f(top + h - 2) + ' ' + f(cx) + ' ' + f(top + h - 2), 'none', st('rgba(255,255,255,.35)', 4));
    if (o.band) out += P('M' + f(L + 4) + ' ' + f(top + 9) + 'A' + f(rx - 4) + ' ' + f(ry) + ' 0 0 0 ' + f(Rr - 4) + ' ' + f(top + 9), 'none', st(o.band, 3.2));
    if (o.dots) for (var k = 1; k < 10; k++) {
      var a = Math.PI * k / 10, x = cx - Math.cos(a) * (rx - 8), y = top + 9 + Math.sin(a) * ry + 9;
      out += C(x, y, 2.2, o.dots);
    }
    out += E(cx, top, rx, ry, 'none', st(o.rimCol || '#E1D0B6', 2.2));
    return out;
  }
  // Горка из кусочков: base — цвет горки; pieces — функция (rand, x, y).
  function mound(cx, top, rx, hgt, base, n, piece, seed) {
    var rand = rng(seed), out = P('M' + f(cx - rx) + ' ' + f(top) + 'Q' + f(cx) + ' ' + f(top - hgt * 2) + ' ' + f(cx + rx) + ' ' + f(top) + 'Z', base);
    out += E(cx, top, rx, rx * 0.17, base);
    var pts = [];
    for (var k = 0; k < n; k++) pts.push(inEllipse(rand, cx, top - 2, rx - 8, hgt - 4, true));
    pts.sort(function (a, b) { return a[1] - b[1]; });
    pts.forEach(function (p, k) { out += piece(rand, p[0], p[1], k); });
    return out;
  }
  // Цилиндр слоями (шуба, шарлотка): layers снизу вверх [{h, color}].
  function layered(cx, bottom, rx, ry, layers, line) {
    var out = shadow(cx, bottom + 4, rx + 4, ry), y = bottom;
    layers.forEach(function (l) {
      var y2 = y - l.h;
      out += P('M' + f(cx - rx) + ' ' + f(y) + 'A' + f(rx) + ' ' + f(ry) + ' 0 0 0 ' + f(cx + rx) + ' ' + f(y) +
        'L' + f(cx + rx) + ' ' + f(y2) + 'A' + f(rx) + ' ' + f(ry) + ' 0 0 1 ' + f(cx - rx) + ' ' + f(y2) + 'Z', l.color);
      if (line) out += P('M' + f(cx - rx) + ' ' + f(y2) + 'A' + f(rx) + ' ' + f(ry) + ' 0 0 0 ' + f(cx + rx) + ' ' + f(y2), 'none', st(line, 1.6));
      y = y2;
    });
    return { svg: out, top: y };
  }
  function platter(cx, cy, rx, ry) {
    return shadow(cx, cy + 6, rx, ry) + E(cx, cy, rx, ry, COL.rim) + E(cx, cy - 1.5, rx - 3, ry - 3, COL.plate) +
      E(cx, cy, rx - 14, ry - 10, COL.well) + E(cx, cy - 1, rx - 16, ry - 12, COL.plate);
  }
  function board(x, y, w, h) {
    var out = shadow(x + w / 2 + 3, y + h + 3, w / 2 + 6, 8) + R(x, y, w, h, 14, COL.wood) +
      R(x + w - 2, y + h / 2 - 9, 26, 18, 9, COL.wood) + C(x + w + 16, y + h / 2, 3.5, BG.other);
    for (var k = 1; k < 4; k++) out += P('M' + (x + 10) + ' ' + (y + k * h / 4) + 'q' + (w / 2) + ' ' + (k % 2 ? 4 : -4) + ' ' + (w - 20) + ' 0', 'none', st(COL.wood2, 1.2) + ' opacity=".5"');
    return out;
  }
  function apple(x, y, r, color) {
    return C(x, y, r, color || '#C8352B') + C(x - r * 0.4, y - r * 0.35, r * 0.28, 'rgba(255,255,255,.35)') +
      P('M' + f(x) + ' ' + f(y - r * 0.8) + 'l1.5-5', 'none', st('#6B4A2A', 2)) +
      P('M' + f(x + 1.5) + ' ' + f(y - r * 0.8 - 4) + 'q6-4 9 1q-6 3-9-1z', '#5D9B3C');
  }
  function lemonHalf(x, y, r) {
    var out = C(x, y, r, '#F2C230') + C(x, y, r - 2.2, '#FBE38A');
    for (var k = 0; k < 8; k++) {
      var a = k * Math.PI / 4;
      out += P('M' + f(x) + ' ' + f(y) + 'L' + f(x + Math.cos(a) * (r - 2.5)) + ' ' + f(y + Math.sin(a) * (r - 2.5)), 'none', st('#F2C230', 1.2));
    }
    return out;
  }
  function tomato(x, y, r) { return C(x, y, r, '#D9412F') + C(x - r * 0.35, y - r * 0.35, r * 0.3, 'rgba(255,255,255,.4)') + P('M' + f(x - 3) + ' ' + f(y - r + 1) + 'l3 2 3-2', 'none', st('#3E7A2E', 1.6)); }

  /* ---------- Детали «Модного стола» ---------- */
  function star(x, y, r, fill, ex, inner) {
    var d = '';
    for (var p = 0; p < 10; p++) { var a = -Math.PI / 2 + p * Math.PI / 5, rr = p % 2 ? r * (inner || 0.45) : r; d += (p ? 'L' : 'M') + f(x + Math.cos(a) * rr) + ' ' + f(y + Math.sin(a) * rr); }
    return P(d + 'Z', fill, ex);
  }
  function mandarin(x, y, r) {
    return C(x, y, r, '#F2891E') + C(x + r * 0.2, y + r * 0.25, r * 0.8, '#EC7E14', ' opacity=".5"') +
      C(x - r * 0.38, y - r * 0.38, r * 0.26, 'rgba(255,255,255,.4)') + C(x + r * 0.1, y - r * 0.86, r * 0.12, '#6E8A3A') +
      P('M' + f(x + r * 0.15) + ' ' + f(y - r * 0.9) + 'q' + f(r * 0.5) + ' ' + f(-r * 0.55) + ' ' + f(r * 0.95) + ' ' + f(-r * 0.15) + 'q' + f(-r * 0.5) + ' ' + f(r * 0.4) + ' ' + f(-r * 0.95) + ' ' + f(r * 0.15) + 'z', '#4E8E3A');
  }
  // Кружок цитруса: color — кожура, pulp — мякоть.
  function citrusSlice(x, y, r, color, pulp) {
    var out = C(x, y, r, color || '#F2891E') + C(x, y, r - 1.8, '#FFF2D6') + C(x, y, r - 3, pulp || '#F7A440');
    for (var k = 0; k < 8; k++) {
      var a = k * Math.PI / 4;
      out += P('M' + f(x) + ' ' + f(y) + 'L' + f(x + Math.cos(a) * (r - 3)) + ' ' + f(y + Math.sin(a) * (r - 3)), 'none', st('#FFE3B0', 1));
    }
    return out;
  }
  function rosemary(x, y, len, a) {
    var out = P('M0 0L' + len + ' 0', 'none', st('#5B6E3A', 1.4));
    for (var k = 2; k < len; k += 3.2) out += P('M' + f(k) + ' 0l2.5-4M' + f(k) + ' 0l2.5 4', 'none', st('#3F6B3E', 1.6));
    return G('translate(' + f(x) + ' ' + f(y) + ') rotate(' + (a || 0) + ')', out);
  }
  function leaf(x, y, l, w, a, color) { return E(x, y, l, w, color, rot(a, x, y)) + P('M' + f(x - l * 0.8) + ' ' + f(y) + 'H' + f(x + l * 0.8), 'none', st('rgba(255,255,255,.35)', 0.9) + rot(a, x, y)); }
  function olive(x, y, r) { return C(x, y, r, '#2B2622') + C(x, y, r * 0.35, '#4A3A30') + C(x - r * 0.4, y - r * 0.45, r * 0.25, 'rgba(255,255,255,.45)'); }
  function cherryTom(x, y, r) { return C(x, y, r, '#D9412F') + C(x - r * 0.35, y - r * 0.35, r * 0.3, 'rgba(255,255,255,.45)'); }
  function sparkle(x, y, r, color) { return P('M' + f(x) + ' ' + f(y - r) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(x + r) + ' ' + f(y) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(x) + ' ' + f(y + r) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(x - r) + ' ' + f(y) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(x) + ' ' + f(y - r) + 'Z', color || '#F2C230'); }
  // Прозрачный стакан/банка: слои снизу вверх [[высота, цвет]], top — что сверху.
  function glassCup(x, bottom, w, h, layers, top, opt) {
    opt = opt || {};
    var out = shadow(x, bottom + 3, w * 0.55, 4), y = bottom - 3, L = x - w / 2;
    out += R(L, bottom - h, w, h, opt.r || 6, 'rgba(214,236,244,.55)');
    layers.forEach(function (l, k) {
      out += R(L + 3, y - l[0], w - 6, l[0], k === 0 ? (opt.r || 6) - 2 : 0, l[1]);
      if (l[2]) out += P('M' + f(L + 3) + ' ' + f(y - l[0]) + 'h' + f(w - 6), 'none', st(l[2], 1.6));
      y -= l[0];
    });
    out += E(x, y, w / 2 - 3, 3.5, layers.length ? layers[layers.length - 1][1] : 'none');
    out += top ? top(y) : '';
    out += R(L, bottom - h, w, h, opt.r || 6, 'none', st('#A9C9D6', 2)) + E(x, bottom - h, w / 2, 3.5, 'none', st('#A9C9D6', 2)) +
      R(L + 4, bottom - h + 6, 3.5, h - 14, 1.7, 'rgba(255,255,255,.6)');
    return out;
  }
  function mug(x, bottom, w, h, body, liquid, top) {
    var L = x - w / 2, out = shadow(x, bottom + 3, w * 0.6, 5);
    out += P('M' + f(x + w / 2 - 2) + ' ' + f(bottom - h + 12) + 'q22 0 20 18t-20 18', 'none', st(body, 6));
    out += R(L, bottom - h, w, h, 10, body) + E(x, bottom - h, w / 2, 6, body) + E(x, bottom - h + 1, w / 2 - 4, 4.4, liquid);
    out += R(L + 5, bottom - h + 10, 4, h - 22, 2, 'rgba(255,255,255,.25)');
    return out + (top ? top(bottom - h + 1) : '');
  }

  /* ---------- Блюда ---------- */
  var DISHES = {
    olivier: function () {
      var colors = [COL.potato, '#FBF3D0', COL.carrot, COL.pickle, '#E8A09A', COL.egg, '#E8A09A', COL.potato];
      var m = mound(120, 100, 70, 46, '#F3E3B4', 64, function (rand, x, y, k) {
        if (k % 4 === 3) return pea(x, y, 3.3);
        return cube(x, y, 7 + rand() * 2, colors[k % colors.length], rand() * 40 - 20);
      }, 11);
      return bowl({ top: 100, w: 156, h: 54, mound: m + dill(124, 58, 1.2, 10), color: '#FDF8F0', band: COL.red, dots: COL.gold });
    },
    shuba: function () {
      var out = plateSide(120, 140, 100, 28);
      var l = layered(120, 136, 72, 20, [
        { h: 10, color: '#BFA79D' }, { h: 11, color: COL.potato }, { h: 9, color: COL.carrot },
        { h: 9, color: '#FBF2D0' }, { h: 13, color: '#8A2650' }
      ], COL.mayo);
      out += l.svg + E(120, l.top, 72, 20, '#962E5B') + chords(120, l.top, 70, 18, 0.6, 12, COL.mayo, 2.2) +
        chords(120, l.top, 70, 18, -0.6, 12, COL.mayo, 2.2);
      out += dill(112, l.top + 2, 1.2, -10) + dill(124, l.top + 3, 1.1, 15) + C(102, l.top + 6, 2.5, COL.yolk) + C(140, l.top - 2, 2.5, COL.yolk) + C(130, l.top + 9, 2.2, COL.yolk);
      return out;
    },
    mimosa: function () {
      var rand = rng(5), out = shadow(120, 152, 70, 9);
      out += R(58, 52, 124, 100, 14, 'rgba(214,236,244,.75)');
      var y = 146, layers = [[18, COL.potato], [14, '#D9A58C'], [13, COL.carrot], [12, COL.egg], [8, '#F8DB7A'], [12, '#F7C933']];
      layers.forEach(function (l, k) {
        out += R(62, y - l[0], 116, l[0], k === 0 ? 10 : 0, l[1]);
        if (k) out += R(62, y - 1, 116, 2, 0, COL.mayo);
        y -= l[0];
      });
      out += E(120, y, 58, 9, '#F7C933');
      for (var k = 0; k < 60; k++) { var p = inEllipse(rand, 120, y, 54, 8); out += C(p[0], p[1], 1.3 + rand() * 1.3, k % 2 ? '#E8AE18' : '#FBE07A'); }
      out += R(58, 52, 124, 100, 14, 'none', st('#AFCFD9', 2.4)) + E(120, 52, 62, 9, 'none', st('#AFCFD9', 2.4)) +
        R(66, 60, 6, 80, 3, 'rgba(255,255,255,.55)') + R(170, 64, 3, 70, 1.5, 'rgba(255,255,255,.45)');
      out += dill(120, y - 1, 1.1, 0);
      // веточка мимозы
      out += P('M20 170Q38 140 44 112', 'none', st('#5D8A3A', 2.4));
      for (k = 0; k < 9; k++) out += C(28 + (k % 3) * 7 + rand() * 4, 150 - k * 4.5 + rand() * 4, 3.4, k % 2 ? '#F6D02F' : '#FCE15A');
      return out;
    },
    crab: function () {
      var m = mound(120, 100, 70, 42, '#F7F0DC', 60, function (rand, x, y, k) {
        var t = k % 5, a = rand() * 50 - 25;
        if (t === 0 || t === 2) return R(x - 6, y - 4, 12, 8, 2, '#FFFFFF', rot(a, x, y)) + R(x - 6, y - 4, 12, 3.2, 1.5, '#E2483A', rot(a, x, y));
        if (t === 1) return C(x, y, 2.8, '#F5C518') + C(x - 0.8, y - 0.8, 0.9, '#FFE680');
        if (t === 3) return cube(x, y, 7, '#77AE4A', a);
        return cube(x, y, 7, '#FFF4C4', a);
      }, 21);
      var out = bowl({ top: 100, w: 156, h: 52, mound: m, color: '#E3EEF6', band: '#3E6E9E', rimCol: '#C9D9E6', inner: '#D3E1EC' });
      // целая крабовая палочка рядом
      out += G('rotate(-12 196 150)', R(166, 144, 62, 13, 6.5, '#FFFFFF') + R(166, 144, 62, 6, 3, '#E2483A'));
      return out;
    },
    vinegret: function () {
      var colors = ['#9E2A4F', '#7C1E3D', '#E7B3C0', '#B83A60', COL.carrot, '#8E2448', COL.pickle, '#F2E6E0'];
      var m = mound(120, 100, 70, 42, '#8B2346', 62, function (rand, x, y, k) {
        if (k % 7 === 6) return pea(x, y, 3);
        return cube(x, y, 7 + rand() * 2, colors[k % colors.length], rand() * 40 - 20);
      }, 31);
      return bowl({ top: 100, w: 156, h: 54, mound: m + parsley(122, 62, 1.1), color: '#3D6B4F', band: COL.gold, rimCol: '#2E5640', inner: '#2E5640' });
    },

    'meat-french': function () {
      var rand = rng(41), out = shadow(124, 156, 98, 10);
      out += R(22, 62, 196, 92, 18, '#8C4F2E') + R(10, 92, 18, 28, 7, '#7A4426') + R(212, 92, 18, 28, 7, '#7A4426');
      out += R(32, 70, 176, 76, 12, '#5E331E');
      for (var r = 0; r < 2; r++) for (var c = 0; c < 3; c++) {
        var x = 40 + c * 56, y = 76 + r * 34;
        out += R(x, y, 52, 30, 11, '#E58E2E') + R(x + 2, y + 1, 48, 25, 10, '#F4BC48');
        for (var k = 0; k < 6; k++) out += E(x + 8 + rand() * 36, y + 6 + rand() * 16, 2.5 + rand() * 3, 1.6 + rand() * 2, k % 3 ? '#D9892A' : '#B9661E');
        out += C(x + 14 + rand() * 20, y + 12, 3.2, '#D34B2E', ' opacity=".65"');
      }
      out += parsley(66, 98, 0.9) + parsley(176, 128, 0.9) + steam(84, 58, 4);
      return out;
    },
    chicken: function () {
      var out = platter(120, 132, 104, 40);
      out += lemonHalf(38, 130, 11) + lemonHalf(202, 134, 11) + tomato(62, 152, 7) + tomato(180, 154, 7);
      out += P('M24 144q14-12 30-6M188 120q14-8 26 2', 'none', st('#4F7F3A', 2.6));
      out += P('M30 140l-4-6M38 137l-2-7M46 136l1-7M196 117l-1-7M204 117l2-7', 'none', st('#4F7F3A', 2));
      // тушка
      out += E(120, 116, 58, 32, '#C26E2B') + E(120, 110, 54, 27, '#DA8F42') + E(110, 101, 26, 11, '#EDB063', rot(-10, 110, 101));
      out += E(66, 120, 15, 9, '#B9672A', rot(25, 66, 120)) + E(174, 120, 15, 9, '#B9672A', rot(-25, 174, 120));
      out += P('M84 118q36 14 72 0', 'none', st('rgba(150,80,30,.5)', 2.4));
      // ножки вверх; бумажные «юбочки» ровно на кончиках косточек
      function leg(x, y, a) {
        return G('translate(' + x + ' ' + y + ') rotate(' + a + ')',
          E(0, -12, 13, 19, '#C9772F') + E(-3, -16, 6, 10, '#E9A456') +
          R(-2.8, -38, 5.6, 10, 2.8, '#E9D6B4', st('#C9AE84', 1)) +
          P('M-6.5-34h13v-5l-2-7-2.2 5-2.1-6-2.2 6-2.1-6-2.2 5-2.2-6z', '#FFFFFF', st('#CDBBA0', 1.2)));
      }
      out += leg(102, 100, -28) + leg(138, 100, 28);
      out += steam(98, 50, 3);
      return out;
    },
    duck: function () {
      var out = platter(120, 132, 108, 40);
      function wedge(x, y, a) {
        return G('translate(' + x + ' ' + y + ') rotate(' + a + ')',
          P('M-11 0A11 9 0 0 1 11 0Z', '#FFF1CC') + P('M-11 0A11 9 0 0 1 11 0', 'none', st('#C8352B', 3)) +
          P('M-11 0H11', 'none', st('#F2DFA8', 1.4)) + E(-2.5, -3, 1.2, 2, '#5A3A20') + E(2.5, -3, 1.2, 2, '#5A3A20'));
      }
      out += wedge(34, 132, -20) + wedge(56, 152, 10) + wedge(184, 154, -8) + wedge(208, 134, 22) + wedge(120, 158, 0);
      out += apple(30, 112, 11) + apple(210, 112, 11, '#D24A2E');
      // ножки — у хвостовой части, лежат вдоль тушки
      function leg(x, y, a) {
        return G('translate(' + x + ' ' + y + ') rotate(' + a + ')',
          R(-2.6, -38, 5.2, 12, 2.6, '#E9D6B4', st('#B89A70', 1)) + C(-2.8, -38, 3.2, '#E9D6B4', st('#B89A70', 1)) + C(2.8, -38, 3.2, '#E9D6B4', st('#B89A70', 1)) +
          E(0, -12, 12, 18, '#7E3A1C') + E(-2, -15, 5.5, 10, '#B8662F'));
      }
      // тушка: длиннее курицы, тёмная медовая глазурь
      out += E(124, 114, 68, 30, '#6E3218') + E(124, 109, 64, 25, '#9A4622') +
        E(116, 101, 40, 11, '#C66E36', rot(-4, 116, 101)) + E(110, 99, 18, 5, '#E39A5A', rot(-4, 110, 99));
      out += P('M88 112q36-14 72 0', 'none', st('rgba(70,25,8,.45)', 2.4));
      // крыло спереди
      out += P('M96 116q26 22 64 6q-6 10-26 12q-26 2-38-18z', '#743317') + P('M108 124l8 5M120 127l7 4M132 128l6 3', 'none', st('#B8662F', 1.8));
      // шейка
      out += E(190, 108, 11, 12, '#7E3A1C') + E(192, 105, 6, 6, '#A9542A');
      out += leg(74, 118, -60) + leg(90, 124, -25);
      out += steam(102, 56, 3);
      return out;
    },
    potato: function () {
      var rand = rng(57), out = shadow(120, 162, 102, 8);
      out += R(14, 66, 212, 94, 10, '#55504B') + R(20, 72, 200, 82, 7, '#3C3834') + R(26, 76, 188, 74, 4, '#F1E3C6', rot(-1.5, 120, 113));
      function wedge(x, y, a) {
        var o = P('M-19 0C-12-13 12-13 19 0C12 11-12 11-19 0Z', '#F4C764') + P('M-19 0Q0 3 19 0C12 11-12 11-19 0Z', '#D88A30') +
          P('M-19 0C-12 11 12 11 19 0', 'none', st('#86471A', 3)) + P('M-11-5q11-4 22 0', 'none', st('#FBE3A0', 1.8));
        for (var k = 0; k < 4; k++) o += C(-12 + rand() * 24, -3 + rand() * 6, 0.9, '#86471A');
        return G('translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(a) + ')', o);
      }
      for (var r = 0; r < 3; r++) for (var c = 0; c < 4; c++) {
        out += wedge(52 + c * 44 + (r % 2) * 12 + rand() * 4, 93 + r * 23 + rand() * 3, -30 + rand() * 60);
      }
      function clove(x, y) { return P('M' + x + ' ' + (y - 7) + 'q7 5 4 10q-4 3-8 0q-3-5 4-10z', '#F7EFDE', st('#CDBE9E', 1.2)) + P('M' + x + ' ' + (y - 7) + 'v-3', 'none', st('#B8A27A', 1.4)); }
      out += clove(60, 108) + clove(150, 132) + clove(196, 96);
      out += dill(92, 106, 1, -30) + dill(168, 112, 1, 25) + dill(124, 146, 0.9, 10);
      out += steam(94, 60, 3);
      return out;
    },
    buzhenina: function () {
      var out = board(26, 92, 170, 66);
      // кусок
      out += E(76, 112, 42, 22, '#7E3F22') + E(76, 108, 40, 19, '#9A5530') + E(106, 112, 14, 21, '#ECB7A3') + E(106, 112, 9, 15, '#F3C9B8');
      // ломтики веером
      for (var k = 0; k < 5; k++) {
        var x = 126 + k * 13, y = 120 - k * 2;
        out += E(x, y, 13, 22, '#8E4A28', rot(18, x, y)) + E(x + 1, y, 10.5, 19, '#EDB6A2', rot(18, x + 1, y)) +
          P('M' + (x - 4) + ' ' + (y - 6) + 'q4 6 2 12', 'none', st('#F7D8CB', 1.6));
      }
      out += G('translate(46 146)', E(0, 4, 14, 6, '#E8DCC8') + E(0, 0, 14, 7, '#FFFFFF') + E(0, 0, 10, 4.5, '#E2B32E'));
      out += G('translate(206 150)', E(0, 0, 11, 10, '#F4EBDA') + P('M-4-8q4-6 8 0M0-9v-5', 'none', st('#CDBE9E', 1.6)));
      out += parsley(140, 96, 1);
      return out;
    },

    eggs: function () {
      var out = plateTop(120, 104, 100, 64);
      for (var k = 0; k < 6; k++) {
        var a = k * Math.PI / 3 + 0.3, x = 120 + Math.cos(a) * 52, y = 104 + Math.sin(a) * 31, d = a * 180 / Math.PI + 90;
        out += G('translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(d) + ')',
          E(0, 2, 15, 22, 'rgba(0,0,0,.06)') + E(0, 0, 15, 22, '#FFFFFF') + E(0, 0, 15, 22, 'none', st('#EFE6D6', 1.2)) +
          E(0, 0, 9.5, 14, '#F4BE3E') + P('M-5-8q5-4 10 0M-6-2q6-4 12 0M-6 4q6-4 12 0M-4 10q4-3 8 0', 'none', st('#E0A126', 1.6)) +
          (k % 2 ? C(-2, -2, 2, '#E8482C') + C(2.5, 1, 2, '#E8482C') + C(-1, 3.5, 2, '#D93A22') : P('M0 6V-6M0-1l-4-3M0-1l4-3', 'none', st(COL.dill, 1.4))));
      }
      out += dill(116, 112, 1.2, -20) + dill(124, 112, 1.2, 20) + dill(120, 110, 1.1, 0);
      return out;
    },
    tartlets: function () {
      var rand = rng(71), out = plateSide(120, 142, 104, 28);
      function tart(x, y) {
        var o = P('M' + (x - 22) + ' ' + y + 'L' + (x - 15) + ' ' + (y + 24) + 'H' + (x + 15) + 'L' + (x + 22) + ' ' + y + 'Z', '#D7A056');
        for (var k = -3; k <= 3; k++) o += P('M' + (x + k * 6.3) + ' ' + y + 'l' + (k * -1) + ' 24', 'none', st('#B97E3A', 1.4));
        o += E(x, y, 22, 6, '#C58A44') + E(x, y - 1, 19, 4.6, '#FFF6E0');
        for (k = 0; k < 16; k++) { var p = inEllipse(rand, x, y - 4, 15, 5, true); o += C(p[0], p[1], 2.4, k % 3 ? '#E4512E' : '#F06A3C') + C(p[0] - 0.7, p[1] - 0.8, 0.7, 'rgba(255,255,255,.8)'); }
        return o + dill(x + 6, y - 6, 0.6, 30);
      }
      out += tart(86, 96) + tart(154, 96) + tart(62, 120) + tart(120, 122) + tart(178, 120);
      return out;
    },
    lavash: function () {
      var out = plateTop(120, 104, 100, 64);
      function roll(x, y, r) {
        var o = C(x, y + 2, r, 'rgba(0,0,0,.07)') + C(x, y, r, '#EED39A') + C(x, y, r - 2, '#FFF4DA'), d = '', d2 = '';
        for (var t = 0; t <= 19; t += 0.25) {
          var rr = (r - 3) * t / 19, ax = x + Math.cos(t) * rr, ay = y + Math.sin(t) * rr;
          d += (t ? 'L' : 'M') + f(ax) + ' ' + f(ay);
          var rr2 = Math.max(0, rr - 2.2);
          d2 += (t ? 'L' : 'M') + f(x + Math.cos(t + 0.4) * rr2) + ' ' + f(y + Math.sin(t + 0.4) * rr2);
        }
        return o + P(d, 'none', st('#F0855E', 2.6)) + P(d2, 'none', st('#7DB04E', 1.2)) + C(x, y, r, 'none', st('#D9B36A', 1.6));
      }
      out += roll(84, 88, 22) + roll(132, 80, 22) + roll(166, 108, 22) + roll(120, 124, 22) + roll(76, 128, 20);
      out += dill(160, 140, 1.1, 40) + dill(54, 104, 1, -40);
      return out;
    },
    sprats: function () {
      var out = board(18, 86, 180, 74);
      // открытая банка
      out += G('translate(190 70)', E(0, 3, 30, 17, 'rgba(0,0,0,.12)') + E(0, 0, 30, 17, '#B8BEC4') + E(0, 0, 26, 14, '#C99A46') +
        P('M-18 -4h34M-20 2h38M-16 8h30', 'none', st('#8E5B22', 3)) + P('M-28-8q18-26 52-14', 'none', st('#AEB4BA', 4)));
      function bread(x, y, a) {
        var o = R(-24, -15, 48, 30, 7, '#B97A3A') + R(-21, -12, 42, 24, 5, '#F2D49A') + C(-6, 0, 9, '#7DB04E') + C(-6, 0, 7, '#D7EBB2');
        o += P('M-16 4q16-12 34-6l4-4v12l-4-4q-18 6-34 2z', '#B36E2C') + P('M-14 5q16-10 30-5', 'none', st('#E5A653', 1.6));
        o += P('M-16 -4q16-12 34-6l4-4v12l-4-4q-18 6-34 2z', '#A9632A', ' opacity=".9"') + P('M-14 -3q16-10 30-5', 'none', st('#E5A653', 1.6));
        return G('translate(' + x + ' ' + y + ') rotate(' + a + ')', o) + dill(x + 12, y - 6, 0.6, 30);
      }
      out += bread(58, 110, -6) + bread(112, 124, 3) + bread(166, 114, -4) + bread(76, 142, 4);
      return out;
    },
    holodets: function () {
      var rand = rng(91), out = shadow(110, 160, 96, 9);
      out += R(16, 62, 184, 96, 14, '#D6E8EE') + R(22, 68, 172, 84, 10, '#EBC77E');
      for (var k = 0; k < 26; k++) {
        var x = 30 + rand() * 152, y = 76 + rand() * 66;
        out += E(x, y, 4 + rand() * 4, 2.5 + rand() * 2.5, k % 3 ? '#9A5A3E' : '#B97858', rot(rand() * 180, x, y));
      }
      function star(x, y, r) {
        var d = '';
        for (var p = 0; p < 10; p++) { var a = -Math.PI / 2 + p * Math.PI / 5, rr = p % 2 ? r * 0.45 : r; d += (p ? 'L' : 'M') + f(x + Math.cos(a) * rr) + ' ' + f(y + Math.sin(a) * rr); }
        return P(d + 'Z', '#EE7F2E');
      }
      out += star(52, 92, 8) + star(108, 108, 8) + star(160, 88, 8) + star(140, 134, 8) + star(72, 132, 8);
      out += parsley(84, 96, 0.8) + parsley(134, 102, 0.8) + parsley(176, 126, 0.8) + parsley(44, 122, 0.8);
      // прозрачное янтарное желе поверх
      out += R(22, 68, 172, 84, 10, 'rgba(214,150,52,.42)') + R(22, 68, 172, 12, 6, 'rgba(255,236,180,.5)');
      out += P('M34 82h46M150 146h30M30 144l22-26M60 146l14-16', 'none', st('rgba(255,255,255,.7)', 3)) + P('M176 78l10 10', 'none', st('rgba(255,255,255,.6)', 2.4));
      out += R(16, 62, 184, 96, 14, 'none', st('#A9CAD6', 2.6));
      // горчица и хрен
      out += G('translate(214 150)', E(0, 5, 17, 7, '#D9CBB4') + E(0, 0, 17, 8, '#FFFFFF') + E(0, 0, 13, 5.5, '#D6A522') + P('M2-2l14-16', 'none', st('#C9CDD2', 3)));
      out += G('translate(216 116)', E(0, 5, 15, 6, '#D9CBB4') + E(0, 0, 15, 7, '#FFFFFF') + E(0, 0, 11, 4.6, '#EEDCD6'));
      return out;
    },
    napoleon: function () {
      var rand = rng(101), out = plateSide(116, 144, 100, 28);
      var x0 = 62, x1 = 162, top = 82, bot = 140, n = 8, h = (bot - top) / n;
      for (var k = 0; k < n; k++) {
        out += R(x0, top + k * h, x1 - x0, h, 0, '#E1AC62') + R(x0, top + k * h + h * 0.38, x1 - x0, h * 0.62, 0, '#FFF3D6');
      }
      out += R(x0, top, x1 - x0, bot - top, 3, 'none', st('#D59A4C', 1));
      out += P('M' + x0 + ' ' + top + 'L' + (x0 + 32) + ' ' + (top - 26) + 'H' + (x1 - 14) + 'L' + x1 + ' ' + top + 'Z', '#F2D8A6');
      for (k = 0; k < 70; k++) {
        var tt = rand(), y = top - tt * 26, xa = x0 + 32 * tt, xb = x1 - 14 * tt;
        out += C(xa + rand() * (xb - xa), y, 1 + rand() * 1.4, k % 2 ? '#D9A050' : '#E9C07A');
      }
      out += C(126, 52, 6, '#C2273A') + C(124, 50, 1.8, 'rgba(255,255,255,.6)') + P('M126 46q2-6 8-7', 'none', st('#4F7F3A', 1.6)) + P('M133 39q5-3 8 1q-5 2-8-1z', '#5D9B3C');
      // вилка
      out += G('rotate(-20 200 140)', R(176, 137, 46, 5, 2.5, '#C9CDD2') + R(168, 132, 12, 14, 3, '#C9CDD2') + P('M168 134h-10M168 138h-10M168 142h-10', 'none', st('#C9CDD2', 2)));
      return out;
    },
    sharlotka: function () {
      var rand = rng(111), out = plateSide(116, 144, 104, 28);
      var l = layered(116, 136, 80, 24, [{ h: 22, color: '#C8873C' }], null);
      out += l.svg + E(116, l.top, 80, 24, '#E4A854');
      for (var k = 0; k < 7; k++) {
        var a = k * Math.PI * 2 / 7, x = 116 + Math.cos(a) * 46, y = l.top + Math.sin(a) * 13;
        out += P('M-11 0A11 6 0 0 1 11 0Z', '#F7E1A6', ' transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(a * 57.3 + 90) + ') scale(.8)"');
      }
      for (k = 0; k < 90; k++) { var p = inEllipse(rand, 116, l.top, 74, 21); out += C(p[0], p[1], 0.8 + rand(), 'rgba(255,255,255,.9)'); }
      out += apple(34, 136, 13) + G('translate(204 140)', P('M-12 0A12 12 0 0 1 12 0Z', '#FFF2CC') + P('M-12 0A12 12 0 0 1 12 0', 'none', st('#C8352B', 2.5)) + E(-3, -4, 1.3, 2.2, '#5A3A20') + E(3, -4, 1.3, 2.2, '#5A3A20'));
      return out;
    },
    tiramisu: function () {
      var rand = rng(121), out = plateSide(108, 146, 96, 26);
      var x0 = 60, x1 = 150, top = 84, bot = 140;
      var layers = [[14, '#C68B4E'], [12, '#FBF1DC'], [13, '#B87D44'], [12, '#FBF1DC'], [5, '#6B3E26']], y = bot;
      layers.forEach(function (l) { out += R(x0, y - l[0], x1 - x0, l[0], 0, l[1]); y -= l[0]; });
      out += P('M' + x0 + ' ' + top + 'L' + (x0 + 22) + ' ' + (top - 20) + 'H' + (x1 + 22) + 'L' + x1 + ' ' + top + 'Z', '#7A4A2E');
      out += P('M' + x1 + ' ' + top + 'L' + (x1 + 22) + ' ' + (top - 20) + 'V' + (bot - 20) + 'L' + x1 + ' ' + bot + 'Z', '#E9DCC4');
      for (var k = 0; k < 60; k++) { var tt = rand(); out += C(x0 + 22 * tt + rand() * (x1 - x0), top - 20 * tt, 0.9 + rand(), '#5A3220'); }
      // чашка кофе и зёрна
      out += G('translate(196 122)', E(0, 18, 26, 7, COL.rim) + R(-16, -6, 32, 24, 8, '#FFFFFF') + P('M16 0q12 0 10 9t-12 6', 'none', st('#FFFFFF', 4)) + E(0, -6, 16, 5, '#E9E2D6') + E(0, -6, 13, 3.6, '#5A3220'));
      out += G('rotate(30 40 156)', E(40, 156, 6, 4, '#5A3220') + P('M34 156h12', 'none', st('#2E1A10', 1.2))) + G('rotate(-20 54 162)', E(54, 162, 6, 4, '#6B3E26') + P('M48 162h12', 'none', st('#2E1A10', 1.2)));
      return out;
    },
    kartoshka: function () {
      var rand = rng(131), out = plateSide(120, 142, 104, 28);
      function cake(x, y) {
        var o = P('M' + (x - 18) + ' ' + y + 'L' + (x - 15) + ' ' + (y + 9) + 'H' + (x + 15) + 'L' + (x + 18) + ' ' + y + 'Z', '#F6E1E1');
        for (var k = -3; k <= 3; k++) o += P('M' + (x + k * 5) + ' ' + y + 'l' + (-k * 0.6) + ' 9', 'none', st('#E0B9B9', 1.3));
        o += E(x, y, 18, 4.5, '#E7C3C3');
        o += P('M' + (x - 29) + ' ' + (y - 4) + 'q-3-10 10-12q8-4 18-1q10-4 18 1q9 4 2 12q-6 6-24 5q-20 1-24-5z', '#5E3520');
        o += P('M' + (x - 22) + ' ' + (y - 12) + 'q10-6 20-3q8-3 16 0', 'none', st('#7A4A2C', 4));
        for (k = 0; k < 22; k++) o += C(x - 24 + rand() * 48, y - 14 + rand() * 12, 0.8, k % 2 ? '#A0714D' : '#4A2816');
        o += E(x - 14, y - 10, 2.6, 3.2, '#FFF1D6') + E(x - 2, y - 13, 2.6, 3.2, '#FFF1D6') + E(x + 11, y - 10, 2.6, 3.2, '#FFF1D6');
        return o;
      }
      out += cake(86, 106) + cake(156, 104) + cake(58, 134) + cake(120, 138) + cake(182, 134);
      for (var k = 0; k < 8; k++) out += C(34 + rand() * 170, 150 + rand() * 8, 1.1, '#7A4A2E');
      return out;
    },
    gingerbread: function () {
      var out = plateTop(120, 106, 102, 62), ic = st('#FFFFFF', 2.2);
      // человечек
      out += G('translate(120 104)',
        C(0, -26, 12, '#C47A3A') + P('M-10-14h20l18 8-4 8-12-4 6 30-9 4-8-16-8 16-9-4 6-30-12 4-4-8z', '#C47A3A') +
        C(-4, -28, 1.8, '#3A2414') + C(4, -28, 1.8, '#3A2414') + P('M-5-22q5 4 10 0', 'none', ic) +
        C(0, -6, 2, COL.red) + C(0, 2, 2, '#2E8A4E') + C(0, 10, 2, COL.red) +
        P('M14-6l4 2M18-5l3 1M-14-6l-4 2M-18-5l-3 1M-8 26l4 2M8 26l-4 2', 'none', ic));
      // звезда
      var s = '';
      for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 9 : 20; s += (k ? 'L' : 'M') + f(58 + Math.cos(a) * r) + ' ' + f(102 + Math.sin(a) * r); }
      out += P(s + 'Z', '#C47A3A') + P(s + 'Z', 'none', st('#FFFFFF', 2) + ' transform="translate(58 102) scale(.78) translate(-58 -102)"');
      // ёлочка
      out += P('M182 78l18 26h-8l12 18h-44l12-18h-8z', '#B86E33') + R(178, 122, 8, 8, 1, '#B86E33') +
        P('M172 102q10 4 20 0M168 120q14 5 28 0', 'none', ic) + C(182, 90, 2, COL.red) + C(176, 110, 2, '#2E8A4E') + C(190, 112, 2, COL.gold);
      out += P('M92 144l3-6 3 6-3 6z', COL.red) + C(150, 148, 2.6, COL.gold);
      return out;
    },
    /* ---------- Модный стол ---------- */
    'snack-tree': function () {
      var rand = rng(201), out = board(30, 38, 150, 132);
      var rows = 7, top = 56, bot = 146, kinds = ['cheese', 'salami', 'cuc', 'tom'];
      for (var k = 0; k < rows; k++) {
        var y = bot - k * (bot - top) / (rows - 1), hw = 60 * (1 - k / (rows + 0.6)), n = Math.max(1, Math.round(hw * 2 / 13));
        var kind = kinds[k % 4];
        if (k) out += rosemary(105 - hw - 2, y + 7, hw * 2 + 4, 0);
        for (var j = 0; j < n; j++) {
          var x = 105 - hw + (n === 1 ? hw : j * hw * 2 / (n - 1));
          if (kind === 'cheese') out += cube(x, y, 9.5, '#F5C842', rand() * 16 - 8);
          else if (kind === 'salami') out += C(x, y, 6.2, '#B03A3A') + C(x - 2, y - 1.5, 1.1, '#F2C9BC') + C(x + 2, y + 1.6, 1, '#F2C9BC') + C(x + 1.8, y - 2.4, 0.9, '#F2C9BC');
          else if (kind === 'cuc') out += P('M' + f(x - 6.5) + ' ' + f(y + 2) + 'A6.5 6.5 0 0 1 ' + f(x + 6.5) + ' ' + f(y + 2) + 'Z', '#DDEFB8', st('#4E8A34', 1.6));
          else out += cherryTom(x, y, 5.4);
        }
      }
      for (k = 0; k < 7; k++) { var p = inEllipse(rand, 105, 120, 34, 26, true); out += olive(p[0], p[1] - 4, 3.3); }
      out += cube(100, 158, 9, '#F5C842', 0) + cube(110, 158, 9, '#F5C842', 0);
      out += star(105, 46, 11, '#F5C842', st('#D9A441', 1.4));
      return out;
    },
    'butter-board': function () {
      var rand = rng(211), out = board(18, 72, 180, 82);
      out += P('M34 104q10-20 34-14t34 4 36-6 40 8 22 20-6 30-36 6-40 4-38 6-32-12-14-26z', '#FBE7A6');
      out += P('M44 108q22-14 44-4t44-2 40 6M48 124q24-12 48-2t46-2 34 4', 'none', st('#EFD07A', 2.6));
      out += P('M50 100q14 10 28 0t28 0 28 0 28 0 22 2', 'none', st('#E0A52A', 2.2) + ' opacity=".9"');
      for (var k = 0; k < 9; k++) { var p = inEllipse(rand, 106, 116, 62, 18); out += C(p[0], p[1], 2.8, '#B3243A') + C(p[0] - 0.8, p[1] - 0.8, 0.8, 'rgba(255,255,255,.6)'); }
      for (k = 0; k < 7; k++) { p = inEllipse(rand, 106, 116, 58, 16); out += P('M' + f(p[0] - 4) + ' ' + f(p[1]) + 'q2-4 5-2q3-3 4 1q1 4-4 4q-4 1-5-3z', '#9A6236'); }
      for (k = 0; k < 14; k++) { p = inEllipse(rand, 106, 116, 60, 18); out += P('M' + f(p[0]) + ' ' + f(p[1]) + 'l3-2', 'none', st('#4F7F3A', 1.4)); }
      for (k = 0; k < 18; k++) { p = inEllipse(rand, 106, 116, 60, 18); out += C(p[0], p[1], 0.9, k % 2 ? '#FFFFFF' : '#F2C230'); }
      function slice(x, y, a) { return G('translate(' + x + ' ' + y + ') rotate(' + a + ')', E(0, 0, 13, 9, '#C98A3C') + E(0, -0.5, 11, 7.2, '#F6DEA8') + C(-3, -1, 1, '#E2BE7A') + C(3, 1.5, 1, '#E2BE7A')); }
      out += slice(36, 160, -10) + slice(58, 164, 6) + slice(80, 162, -4) + slice(216, 150, 20);
      return out;
    },
    'wreath': function () {
      var rand = rng(221), out = plateTop(120, 104, 102, 66), n = 46;
      out += E(120, 104, 64, 42, 'none', st('#6FA34A', 16) + ' opacity=".55"');
      for (var k = 0; k < n; k++) {
        var a = k / n * Math.PI * 2, rr = k % 2 ? 1.1 : 0.9, x = 120 + Math.cos(a) * 62 * rr, y = 104 + Math.sin(a) * 41 * rr;
        out += leaf(x + rand() * 6 - 3, y + rand() * 6 - 3, 11, 4.4, a * 57.3 + 60 + rand() * 40, k % 3 ? '#5E9E3C' : '#3F7A2E');
      }
      for (k = 0; k < 8; k++) { var b = k / 8 * Math.PI * 2 + 0.2; out += rosemary(120 + Math.cos(b) * 50, 104 + Math.sin(b) * 33, 16, b * 57.3 + 90); }
      for (k = 0; k < 18; k++) {
        a = k / 18 * Math.PI * 2 + 0.1; x = 120 + Math.cos(a) * (62 + (k % 2 ? 5 : -5)); y = 104 + Math.sin(a) * (41 + (k % 2 ? 3 : -3));
        out += k % 2 ? cherryTom(x, y, 6) : C(x, y + 1.2, 6.6, 'rgba(0,0,0,.18)') + C(x, y, 6.6, '#FFFDF5', st('#D8CFBC', 1)) + C(x - 2, y - 2, 1.8, '#FFFFFF');
        if (k % 3 === 0) out += leaf(x + 6, y - 5, 5, 3, 30, '#2F7A2E');
      }
      return out;
    },
    'tart-trees': function () {
      var rand = rng(231), out = plateSide(120, 142, 104, 28);
      function tart(x, y) {
        var o = P('M' + (x - 20) + ' ' + y + 'L' + (x - 14) + ' ' + (y + 20) + 'H' + (x + 14) + 'L' + (x + 20) + ' ' + y + 'Z', '#D7A056');
        for (var k = -3; k <= 3; k++) o += P('M' + (x + k * 5.6) + ' ' + y + 'l' + (k * -0.9) + ' 20', 'none', st('#B97E3A', 1.3));
        o += E(x, y, 20, 5.5, '#C58A44') + E(x, y - 1, 17, 4, '#F08A64');
        for (k = 0; k < 5; k++) o += E(x, y - 4 - k * 7, 15 - k * 2.9, 4.2, k % 2 ? '#9CCB7E' : '#86BC66') + P('M' + f(x - 13 + k * 2.9) + ' ' + f(y - 4 - k * 7) + 'q' + f(13 - k * 2.9) + ' 4 ' + f(26 - k * 5.8) + ' 0', 'none', st('#6FA352', 1.2));
        for (k = 0; k < 5; k++) { var p = inEllipse(rand, x, y - 16, 9, 12); o += C(p[0], p[1], 1.8, '#E8482C') + C(p[0] - 0.5, p[1] - 0.6, 0.5, '#FFFFFF'); }
        return o;
      }
      out += tart(84, 92) + tart(156, 92) + tart(56, 120) + tart(120, 122) + tart(184, 120);
      return out;
    },
    'snowmen': function () {
      var rand = rng(241), out = plateSide(120, 148, 104, 26);
      function man(x, y, s) {
        var o = '';
        o += dill(x - 13 * s, y - 24 * s, 0.7 * s, -60) + dill(x + 13 * s, y - 24 * s, 0.7 * s, 60);
        o += C(x, y - 14 * s, 16 * s, '#FFF9EC') + C(x, y - 39 * s, 11 * s, '#FFF9EC');
        for (var k = 0; k < 16; k++) { var p = inEllipse(rand, x, y - 14 * s, 13 * s, 13 * s); o += C(p[0], p[1], 0.8, '#F1DFA8'); }
        for (k = 0; k < 8; k++) { p = inEllipse(rand, x, y - 39 * s, 8 * s, 8 * s); o += C(p[0], p[1], 0.7, '#F1DFA8'); }
        o += C(x - 4 * s, y - 42 * s, 1.7 * s, '#2A2420') + C(x + 4 * s, y - 42 * s, 1.7 * s, '#2A2420');
        o += P('M' + f(x) + ' ' + f(y - 39 * s) + 'l' + f(9 * s) + ' ' + f(1.5 * s) + 'l' + f(-9 * s) + ' ' + f(2.5 * s) + 'z', '#EE8A3A');
        o += P('M' + f(x - 8 * s) + ' ' + f(y - 48 * s) + 'A' + f(8 * s) + ' ' + f(7 * s) + ' 0 0 1 ' + f(x + 8 * s) + ' ' + f(y - 48 * s) + 'Z', '#2B2622') + C(x, y - 52 * s, 1.6 * s, '#4A3A30');
        return o;
      }
      out += man(76, 140, 0.95) + man(164, 140, 0.95) + man(120, 150, 1.12);
      return out;
    },
    'shuba-cups': function () {
      var mayo = '#FFF8E7';
      function cup(x, b, w, h) {
        return glassCup(x, b, w, h, [[h * 0.2, '#C9B2A4', mayo], [h * 0.18, '#F4E4B0', mayo], [h * 0.16, '#EE8A3A', mayo], [h * 0.14, '#FBF2D0', mayo], [h * 0.2, '#8A2650']],
          function (y) { return C(x, y - 1, 4, mayo) + P('M' + (x - 8) + ' ' + (y - 2) + 'l3-2M' + (x + 5) + ' ' + y + 'l3-2M' + (x - 2) + ' ' + (y + 1) + 'l2-3', 'none', st('#5DAA45', 1.8)); });
      }
      return cup(70, 140, 46, 70) + cup(170, 140, 46, 70) + cup(120, 158, 54, 84);
    },
    'olivier-rolls': function () {
      var rand = rng(251), out = plateTop(120, 108, 102, 62);
      var colors = [COL.potato, '#E8A09A', COL.carrot, COL.egg, COL.pickle];
      function roll(x, y) {
        var o = E(x + 2, y + 15, 17, 7, 'rgba(0,0,0,.1)');
        o += R(x - 16, y, 32, 14, 0, '#A9CF7E') + E(x, y + 14, 16, 6, '#A9CF7E');
        for (var k = -2; k <= 2; k++) o += P('M' + f(x + k * 6.5) + ' ' + f(y + 1) + 'v' + f(14 - Math.abs(k)), 'none', st('#7DAF4E', 1.4));
        o += E(x, y, 16, 6.5, '#3F7A2E') + E(x, y, 14, 5.2, '#D5ECB0') + E(x, y - 0.5, 12, 4.4, '#F3E3B4');
        for (k = 0; k < 9; k++) { var p = inEllipse(rand, x, y - 1, 10, 3.6); o += cube(p[0], p[1], 3, colors[k % colors.length], rand() * 30); }
        o += pea(x + 3, y - 2, 1.6) + P('M' + (x - 5) + ' ' + (y - 3) + 'l2-2M' + (x + 6) + ' ' + (y + 1) + 'l2-2', 'none', st('#4E9A3C', 1.4));
        return o;
      }
      out += roll(84, 80) + roll(124, 76) + roll(164, 84) + roll(66, 110) + roll(108, 112) + roll(150, 116);
      return out;
    },
    'snow-globe': function () {
      var rand = rng(261), out = plateSide(120, 146, 104, 26);
      out += P('M48 142A72 70 0 0 1 192 142Z', '#FBFBF7') + P('M140 76A72 70 0 0 1 192 142H160A60 66 0 0 0 140 76Z', '#E3E9EF') +
        P('M48 142A72 70 0 0 1 192 142', 'none', st('#C9D3DC', 2));
      out += E(120, 142, 72, 7, '#E9EDF0');
      for (var k = 0; k < 120; k++) { var a = rand() * Math.PI, u = Math.sqrt(rand()); var x = 120 + Math.cos(a) * 68 * u, y = 142 - Math.sin(a) * 66 * u; out += E(x, y, 2.2, 0.9, k % 3 ? '#EDE9DF' : '#FFFFFF', rot(rand() * 180, x, y)); }
      for (k = 0; k < 22; k++) { a = 0.35 + rand() * 2.4; u = 0.25 + rand() * 0.7; x = 120 + Math.cos(a) * 66 * u; y = 142 - Math.sin(a) * 64 * u; out += C(x, y, 2.5, '#C0213A') + C(x - 0.7, y - 0.8, 0.7, 'rgba(255,255,255,.7)'); }
      out += dill(112, 78, 1.2, -20) + dill(126, 77, 1.1, 18) + dill(84, 110, 0.9, -50) + dill(160, 112, 0.9, 50);
      return out;
    },
    'persimmon': function () {
      var rand = rng(271), out = plateTop(120, 104, 102, 66);
      for (var k = 0; k < 22; k++) { var p = inEllipse(rand, 120, 104, 62, 38); out += leaf(p[0], p[1], 10, 3.6, rand() * 180, k % 2 ? '#5E9E3C' : '#467F30'); }
      function wedge(x, y, a) { return G('translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(a) + ')', P('M-15 0A15 11 0 0 1 15 0Q0 5-15 0Z', '#F08A24') + P('M-12 0A12 7.5 0 0 1 12 0Q0 3-12 0Z', '#F8A84A') + P('M-12-1q12-5 24 0', 'none', st('#C8641A', 1.5))); }
      function cheese(x, y, a) { return G('translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(a) + ')', R(-12, -7, 24, 14, 4, '#F2D58A') + P('M-8-5v10M-2-5v10M4-5v10', 'none', st('#C98A3A', 2.2)) + R(-12, -7, 24, 14, 4, 'none', st('#E0B762', 1))); }
      out += wedge(88, 88, -20) + wedge(150, 92, 25) + wedge(118, 124, 5) + wedge(70, 116, 40);
      out += cheese(120, 92, 10) + cheese(158, 118, -20) + cheese(90, 106, -35);
      for (k = 0; k < 7; k++) { p = inEllipse(rand, 120, 104, 48, 28); out += P('M' + f(p[0] - 3) + ' ' + f(p[1]) + 'q1-4 4-2q3-2 3 2t-4 3q-3 0-3-3z', '#8A5A30'); }
      out += P('M80 98q10 6 20 0t20 0 20 0M96 130q12-5 24 0t24 0', 'none', st('#5A2E1A', 1.4) + ' opacity=".7"');
      return out;
    },
    'accordion': function () {
      var out = shadow(122, 158, 100, 9);
      out += R(18, 66, 208, 90, 18, '#F4F1EA') + R(26, 72, 192, 78, 13, '#E9C49A') + R(26, 72, 192, 10, 6, 'rgba(255,255,255,.3)');
      function fillet(cx, cy, a) {
        var o = E(0, 3, 68, 19, 'rgba(120,60,20,.25)') + E(0, 0, 68, 19, '#E7B27E') + E(0, -3, 64, 15, '#F1C894');
        for (var k = -5; k <= 5; k++) {
          var x = k * 11;
          o += k % 2 ? E(x, -4, 3.4, 12, '#D9412F') + E(x, -4, 2, 9.5, '#F06A50') : E(x, -5, 3.6, 13, '#F7D35A') + E(x - 1, -8, 1.6, 6, '#FCE8A0');
        }
        o += C(-40, 6, 1.2, '#4E8A34') + C(10, 8, 1.2, '#4E8A34') + C(34, 5, 1.2, '#4E8A34') + C(-12, 9, 1, '#B5542A');
        return G('translate(' + cx + ' ' + cy + ') rotate(' + a + ')', o);
      }
      out += fillet(118, 94, -4) + fillet(126, 128, 3);
      out += steam(96, 58, 3);
      return out;
    },
    'potato-tree': function () {
      var rand = rng(281), out = shadow(116, 168, 80, 7) + R(34, 34, 164, 136, 4, '#F6EEDC', rot(-2, 116, 102));
      var rows = 8, top = 56, bot = 146;
      for (var k = rows - 1; k >= 0; k--) {
        var y = bot - k * (bot - top) / (rows - 1), hw = 56 * (1 - k / (rows + 0.4)), n = Math.max(1, Math.round(hw * 2 / 10) + 1);
        for (var j = 0; j < n; j++) {
          var x = 114 - hw + (n === 1 ? hw : j * hw * 2 / (n - 1));
          out += C(x, y, 8, '#C98432') + C(x, y - 1, 7, '#E9B65A') + C(x - 1, y - 2, 4.2, '#F4D48A');
        }
      }
      out += C(108, 158, 7, '#C98432') + C(108, 157, 6, '#E9B65A') + C(120, 158, 7, '#C98432') + C(120, 157, 6, '#E9B65A');
      for (k = 0; k < 26; k++) { var p = inEllipse(rand, 114, 112, 40, 40); if (Math.abs(p[0] - 114) < (p[1] - 50) * 0.6) out += C(p[0], p[1], 1.2, '#FFF1B8'); }
      var toys = [[100, 130], [130, 122], [112, 104], [92, 146], [138, 142], [120, 84]];
      toys.forEach(function (t) { out += P('M' + (t[0] - 4) + ' ' + t[1] + 'A4 4 0 0 1 ' + (t[0] + 4) + ' ' + t[1] + 'Z', '#D9412F') + E(t[0], t[1], 4, 1.4, '#F07A5E'); });
      out += star(114, 46, 11, '#D9412F', st('#A82A1C', 1.2));
      out += rosemary(160, 156, 22, -30) + rosemary(56, 70, 18, 200);
      return out;
    },
    'wellington': function () {
      var out = board(16, 100, 180, 60);
      function parcel(x, y, s) {
        var o = E(x, y + 14 * s, 30 * s, 7 * s, 'rgba(0,0,0,.12)');
        o += P('M' + f(x - 30 * s) + ' ' + f(y + 12 * s) + 'Q' + f(x - 30 * s) + ' ' + f(y - 22 * s) + ' ' + f(x) + ' ' + f(y - 22 * s) + 'Q' + f(x + 30 * s) + ' ' + f(y - 22 * s) + ' ' + f(x + 30 * s) + ' ' + f(y + 12 * s) + 'Z', '#D38C38');
        o += P('M' + f(x - 24 * s) + ' ' + f(y + 4 * s) + 'Q' + f(x - 24 * s) + ' ' + f(y - 18 * s) + ' ' + f(x) + ' ' + f(y - 18 * s) + 'Q' + f(x + 24 * s) + ' ' + f(y - 18 * s) + ' ' + f(x + 24 * s) + ' ' + f(y + 4 * s) + 'Z', '#E8B25A');
        for (var k = -2; k <= 2; k++) o += P('M' + f(x + k * 8 * s - 8 * s) + ' ' + f(y + 4 * s) + 'l' + f(16 * s) + ' ' + f(-20 * s), 'none', st('#B8742A', 1.4)) + P('M' + f(x + k * 8 * s + 8 * s) + ' ' + f(y + 4 * s) + 'l' + f(-16 * s) + ' ' + f(-20 * s), 'none', st('#B8742A', 1.4));
        return o + P('M' + f(x - 3 * s) + ' ' + f(y - 17 * s) + 'h' + f(6 * s), 'none', st('#8A5020', 2));
      }
      out += parcel(64, 118, 0.95) + parcel(118, 112, 0.95);
      // разрезанный: тесто, грибы, розовое мясо
      var x = 160, y = 132;
      out += E(x, y + 12, 30, 6, 'rgba(0,0,0,.12)') + R(x - 28, y - 22, 56, 36, 16, '#D38C38') + R(x - 24, y - 18, 48, 28, 12, '#F0CC86') +
        R(x - 20, y - 14, 40, 21, 9, '#5E4630') + R(x - 16, y - 10, 32, 14, 6, '#7A3A2A') + R(x - 13, y - 8, 26, 10, 5, '#D8706A') + R(x - 8, y - 6, 16, 6, 3, '#E99A92');
      out += parsley(46, 150, 0.8) + parsley(188, 108, 0.8);
      return out;
    },
    'ginger-house': function () {
      var rand = rng(291), out = plateSide(122, 152, 104, 24), ic = st('#FFFFFF', 2.2);
      out += P('M152 146V108L184 98V136Z', '#A9662E') + P('M158 112h20v14h-20z', '#F6D58A') + P('M168 112v14M158 119h20', 'none', st('#A9662E', 1.6));
      out += P('M88 146V108L120 82L152 108V146Z', '#C47A3A');
      out += R(113, 122, 14, 24, 6, '#8A4E22') + R(113, 122, 14, 24, 6, 'none', ic) + C(124, 134, 1.3, '#F2C230');
      out += R(94, 114, 13, 12, 2, '#F6D58A') + R(133, 114, 13, 12, 2, '#F6D58A') + P('M100.5 114v12M94 120h13M139.5 114v12M133 120h13', 'none', st('#C47A3A', 1.4)) +
        R(94, 114, 13, 12, 2, 'none', ic) + R(133, 114, 13, 12, 2, 'none', ic);
      out += P('M118 80L150 70L190 96L156 112Z', '#B36A30') + P('M128 84l32 18M138 80l32 18M148 76l32 18', 'none', st('#FFFFFF', 1.6) + ' opacity=".8"');
      out += P('M84 110L120 80L156 110', 'none', st('#FFFDF6', 5)) + P('M118 80L150 70', 'none', st('#FFFDF6', 5)) + P('M156 112L190 96', 'none', st('#FFFDF6', 4));
      var d = '';
      for (var k = 0; k < 7; k++) { var t = k / 6, x = 158 + 30 * t, y = 113 - 15 * t; d += 'M' + f(x) + ' ' + f(y) + 'l1.5 ' + (4 + (k % 2) * 3); }
      out += P(d, 'none', st('#FFFFFF', 2));
      var cols = [COL.red, '#2E8A4E', COL.gold, '#3E6E9E', '#E86AA0'];
      for (k = 0; k < 9; k++) { t = rand(); out += C(124 + 52 * t + rand() * 4, 88 + 16 * t + rand() * 6, 2.4, cols[k % 5]); }
      out += C(120, 92, 3, COL.red) + C(97, 140, 2.4, cols[1]) + C(144, 140, 2.4, cols[2]);
      for (k = 0; k < 40; k++) { var p = inEllipse(rand, 122, 150, 92, 18); out += C(p[0], p[1], 1 + rand(), '#FFFFFF'); }
      return out;
    },
    'buche': function () {
      var rand = rng(301), out = plateSide(116, 150, 110, 24);
      out += R(36, 94, 152, 50, 24, '#5A3320') + R(36, 94, 152, 12, 8, '#6E4028');
      for (var k = 0; k < 7; k++) { var y = 100 + k * 6.5; out += P('M' + (44 + (k % 2) * 8) + ' ' + y + 'q20 ' + (k % 2 ? 3 : -3) + ' 40 0t40 0 40 0 20 1', 'none', st(k % 2 ? '#3E2214' : '#7A4A2E', 1.6)); }
      // срез с завитком
      out += E(184, 119, 13, 25, '#4A2A1A') + E(184, 119, 11, 22, '#7A4A2E');
      var d = '';
      for (var a = 0; a <= 16; a += 0.3) { var r = 1 + a * 0.62; d += (a ? 'L' : 'M') + f(184 + Math.cos(a) * r * 0.5) + ' ' + f(119 + Math.sin(a) * r); }
      out += P(d, 'none', st('#FBF1DC', 2.4));
      // сучок
      out += R(88, 74, 24, 24, 4, '#5A3320') + E(100, 74, 12, 5, '#7A4A2E') + P('M95 74q5-3 10 0t-5 2', 'none', st('#FBF1DC', 1.6));
      // грибочки из безе
      function mush(x, y, s) { return R(x - 3 * s, y - 10 * s, 6 * s, 11 * s, 2.5 * s, '#FBF4E6') + P('M' + f(x - 10 * s) + ' ' + f(y - 9 * s) + 'Q' + f(x) + ' ' + f(y - 24 * s) + ' ' + f(x + 10 * s) + ' ' + f(y - 9 * s) + 'Z', '#FFF8EE', st('#EADCC6', 1)) + C(x - 3 * s, y - 15 * s, 1, '#E7D6BC') + C(x + 3 * s, y - 13 * s, 0.9, '#E7D6BC'); }
      out += mush(50, 160, 1.5) + mush(74, 164, 1.2) + mush(198, 158, 1.4);
      for (k = 0; k < 70; k++) { var x = 40 + rand() * 148, y2 = 94 + rand() * rand() * 30; out += C(x, y2, 0.7 + rand() * 0.8, 'rgba(255,255,255,.95)'); }
      return out;
    },
    'jar-dessert': function () {
      var rand = rng(311);
      function jar(x, b, w, h) {
        var o = glassCup(x, b, w, h, [[h * 0.16, '#D9A867'], [h * 0.2, '#FFF8EE'], [h * 0.1, '#9E1B32'], [h * 0.14, '#D9A867'], [h * 0.18, '#FFF8EE'], [h * 0.06, '#9E1B32']],
          function (y) { return C(x - 6, y - 3, 4.2, '#8E1230') + C(x + 5, y - 2, 4.2, '#A0183A') + C(x - 7, y - 4, 1.1, 'rgba(255,255,255,.6)') + C(x + 4, y - 3, 1.1, 'rgba(255,255,255,.6)'); }, { r: 9 });
        for (var k = 0; k < 10; k++) o += C(x - w / 2 + 6 + rand() * (w - 12), b - 4 - rand() * h * 0.14, 0.9, '#A97A40');
        o += R(x - w / 2 - 2, b - h - 6, w + 4, 8, 3, 'rgba(201,217,224,.9)');
        return o;
      }
      var out = jar(78, 150, 54, 92) + jar(156, 156, 58, 98);
      out += G('rotate(-30 206 150)', R(178, 147, 40, 5, 2.5, '#C9CDD2') + E(224, 149.5, 8, 5, '#C9CDD2'));
      return out;
    },
    'mandarin-tiramisu': function () {
      var rand = rng(321), out = plateSide(108, 146, 96, 26);
      var x0 = 58, x1 = 148, top = 86, bot = 140;
      var layers = [[13, '#F2B25C'], [13, '#FFF6E6'], [12, '#EFA850'], [13, '#FFF6E6']], y = bot;
      layers.forEach(function (l) { out += R(x0, y - l[0], x1 - x0, l[0], 0, l[1]); y -= l[0]; });
      out += P('M' + x0 + ' ' + y + 'L' + (x0 + 22) + ' ' + (y - 20) + 'H' + (x1 + 22) + 'L' + x1 + ' ' + y + 'Z', '#FFF3E0');
      out += P('M' + x1 + ' ' + y + 'L' + (x1 + 22) + ' ' + (y - 20) + 'V' + (bot - 20) + 'L' + x1 + ' ' + bot + 'Z', '#EBDDC2');
      for (var k = 0; k < 40; k++) { var t = rand(); out += P('M' + f(x0 + 22 * t + rand() * (x1 - x0)) + ' ' + f(y - 20 * t) + 'l2 -1', 'none', st('#4A2816', 1.3)); }
      function seg(sx, sy, a) { return G('translate(' + sx + ' ' + sy + ') rotate(' + a + ')', P('M-8 0A8 6 0 0 1 8 0Q0 4-8 0Z', '#F59A2E') + P('M-5-2q5-3 10 0', 'none', st('#FFD08A', 1.2))); }
      out += seg(86, y - 8, -10) + seg(106, y - 12, 15) + seg(126, y - 8, -5);
      out += mandarin(196, 132, 15) + mandarin(176, 152, 10);
      return out;
    },
    'snowballs': function () {
      var rand = rng(331), out = plateSide(120, 146, 104, 26);
      function ball(x, y, r) {
        var o = E(x + 2, y + r - 2, r, 3.5, 'rgba(0,0,0,.08)') + C(x, y, r, '#FFFDF8') + C(x + r * 0.3, y + r * 0.3, r * 0.7, '#F1ECE2', ' opacity=".7"');
        for (var k = 0; k < 18; k++) { var p = inEllipse(rand, x, y, r - 2, r - 2); o += P('M' + f(p[0]) + ' ' + f(p[1]) + 'l2.4 ' + f(rand() * 2 - 1), 'none', st(k % 2 ? '#E6DFD0' : '#FFFFFF', 1.2)); }
        return o;
      }
      out += ball(70, 112, 15) + ball(104, 104, 15) + ball(138, 106, 15) + ball(172, 114, 15) + ball(88, 132, 15) + ball(124, 134, 15);
      // разрезанный снежок
      out += C(164, 136, 14, '#FFFDF8') + C(164, 136, 11, '#4A2816') + C(161, 133, 3, '#6B3E26');
      return out;
    },
    'mulled': function () {
      var rand = rng(341), out = '';
      out += mug(108, 156, 70, 86, 'rgba(214,236,244,.65)', '#A3243A', function (y) {
        return citrusSlice(84, y - 2, 13);
      });
      out += R(78, 82, 60, 70, 8, '#8E1B2E', ' opacity=".85"');
      out += R(77, 78, 4, 66, 2, 'rgba(255,255,255,.5)');
      out += G('rotate(-18 128 60)', R(124, 34, 8, 52, 3, '#8A4A22') + P('M126 38v44M130 38v44', 'none', st('#B0703A', 1)));
      out += steam(96, 58, 2);
      out += star(176, 150, 10, '#6B3A1E', '', 0.38) + C(176, 150, 2.5, '#9A5A2E');
      out += citrusSlice(42, 152, 13) + C(200, 162, 2, '#4A2A1A') + C(192, 166, 2, '#4A2A1A') + C(206, 168, 2, '#4A2A1A');
      for (var k = 0; k < 3; k++) out += C(84 + rand() * 40, 120 + rand() * 25, 1.4, 'rgba(255,255,255,.35)');
      return out;
    },
    'cocoa-bombs': function () {
      var out = '';
      out += mug(118, 156, 74, 72, '#C0392B', '#7A4A2E', function (y) {
        return R(98, y - 6, 9, 8, 2, '#FFFFFF', rot(12, 102, y - 2)) + R(112, y - 7, 9, 8, 2, '#FFF4F0', rot(-8, 116, y - 3)) + R(126, y - 5, 9, 8, 2, '#FFFFFF', rot(20, 130, y - 1));
      });
      out += P('M86 112h64', 'none', st('rgba(255,255,255,.35)', 4)) + C(100, 130, 3, '#FFFFFF', ' opacity=".7"') + C(118, 134, 3, '#FFFFFF', ' opacity=".7"') + C(136, 130, 3, '#FFFFFF', ' opacity=".7"');
      out += steam(102, 66, 2);
      function bomb(x, y, r) {
        return E(x, y + r - 2, r * 0.9, 4, 'rgba(0,0,0,.15)') + C(x, y, r, '#6B3E26') + C(x - r * 0.35, y - r * 0.35, r * 0.28, 'rgba(255,255,255,.3)') +
          P('M' + f(x - r * 0.8) + ' ' + f(y - r * 0.3) + 'q' + f(r * 0.4) + ' ' + f(r * 0.5) + ' ' + f(r * 0.8) + ' 0t' + f(r * 0.8) + ' 0', 'none', st('#F7E6D2', 2.2));
      }
      out += bomb(44, 142, 20) + bomb(198, 146, 16);
      return out;
    },
    'lemonade': function () {
      var rand = rng(351), out = shadow(104, 162, 52, 7);
      out += P('M64 60h70l-6 10q14 30 12 60-2 26-36 28-34-2-36-28-2-30 12-60z', 'rgba(214,236,244,.6)');
      out += P('M58 100q-1 15 2 30 2 26 36 28 34-2 36-28 2-15 1-30z', '#F7B04A', ' transform="translate(5 0)"');
      out += P('M140 76q22 4 18 30t-20 26', 'none', st('#B9D3DD', 5));
      out += citrusSlice(84, 128, 11) + citrusSlice(116, 138, 10);
      for (var k = 0; k < 4; k++) { var x = 72 + k * 15, y = 106 + (k % 2) * 6; out += R(x, y, 12, 12, 2, 'rgba(255,255,255,.65)', rot(rand() * 40, x + 6, y + 6)); }
      for (k = 0; k < 10; k++) out += C(74 + rand() * 54, 116 + rand() * 36, 1.2, 'rgba(255,255,255,.75)');
      out += leaf(86, 96, 8, 4, -30, '#3E8A35') + leaf(98, 92, 8, 4, 20, '#4E9A3C');
      out += P('M64 60h70l-6 10q14 30 12 60-2 26-36 28-34-2-36-28-2-30 12-60z', 'none', st('#A9C9D6', 2));
      out += R(68, 66, 4, 70, 2, 'rgba(255,255,255,.55)');
      out += glassCup(182, 158, 38, 56, [[44, '#F7B04A']], function (y) { return citrusSlice(196, y - 2, 9) + leaf(176, y - 3, 6, 3, -20, '#3E8A35'); });
      return out;
    }

  };

  /* ---------- Разделы ---------- */
  var CATS = {
    salads: function () {
      // хрустальный салатник с оливье
      var colors = [COL.potato, '#FBF3D0', COL.carrot, COL.pickle, '#E8A09A', COL.egg];
      var m = mound(120, 100, 72, 44, '#F3E3B4', 60, function (rand, x, y, k) {
        if (k % 4 === 3) return pea(x, y, 3.3);
        return cube(x, y, 7 + rand() * 2, colors[k % colors.length], rand() * 40 - 20);
      }, 141) + dill(124, 58, 1.2, 10);
      var out = shadow(120, 164, 46, 7) + R(104, 146, 32, 12, 3, '#C6DAE2') + E(120, 160, 34, 7, '#D6E6EC') + E(120, 158, 30, 5, '#E9F2F5');
      out += bowl({ top: 100, w: 160, h: 48, mound: m, color: '#D7E6EC', rimCol: '#B4CCD6', inner: '#C3D8E0' });
      // грани хрусталя
      for (var row = 0; row < 3; row++) for (var c = 0; c < 9 - row * 2; c++) {
        var x = 62 + row * 16 + c * 15, y = 116 + row * 11;
        out += P('M' + x + ' ' + (y - 5) + 'l5 5-5 5-5-5z', 'rgba(255,255,255,.75)') + P('M' + (x + 7.5) + ' ' + (y - 4) + 'l3 4-3 4-3-4z', 'rgba(140,175,190,.6)');
      }
      out += G('rotate(28 196 70)', R(190, 30, 9, 70, 4.5, '#C9CDD2') + E(194.5, 104, 9, 15, '#C9CDD2'));
      return frame(BG.salads, 'Салаты', out, 3);
    },
    hot: function () {
      var out = shadow(116, 160, 84, 10);
      out += R(10, 98, 28, 12, 6, '#7A2A22') + R(194, 98, 28, 12, 6, '#7A2A22');
      out += P('M34 88h164v44q0 26-26 26H60q-26 0-26-26z', '#B5342A') + R(34, 88, 164, 12, 4, '#9A2A22');
      out += P('M50 112h132', 'none', st('rgba(255,255,255,.25)', 5));
      out += C(70, 130, 4, '#FFFFFF', ' opacity=".7"') + C(116, 134, 4, '#FFFFFF', ' opacity=".7"') + C(162, 130, 4, '#FFFFFF', ' opacity=".7"');
      // приподнятая крышка
      out += G('rotate(-10 116 70)', E(116, 76, 86, 12, '#9A2A22') + P('M34 76q82-40 164 0z', '#B5342A') + R(104, 46, 24, 10, 5, '#3A2A26'));
      out += steam(76, 62, 4);
      return frame(BG.hot, 'Горячее', out, 4);
    },
    snacks: function () {
      var out = board(20, 88, 176, 70);
      function canape(x, y, top) {
        return R(x - 15, y - 6, 30, 16, 4, '#E7B66E') + R(x - 15, y - 9, 30, 6, 3, '#FFF1D2') + top +
          P('M' + x + ' ' + (y + 6) + 'V' + (y - 34), 'none', st('#C79A5E', 2)) + C(x, y - 35, 3, COL.red);
      }
      out += canape(58, 118, C(58, -0 + 106, 7, '#3A2E2A') + C(56, 104, 2, 'rgba(255,255,255,.4)'));
      out += canape(104, 132, R(92, 118, 24, 9, 3, '#F08A64') + P('M94 122h20', 'none', st('#FFC1A8', 1.4)));
      out += canape(150, 116, cube(150, 104, 12, '#F7D35A', 0) + C(150, 96, 4.5, '#8CC063'));
      out += canape(176, 140, E(176, 128, 10, 5, '#E4512E') + C(173, 127, 1, '#FFF'));
      out += G('translate(46 150)', E(0, 0, 11, 6, '#E04A2A') + C(-3, -1, 1, '#FFF') + C(3, 1, 1, '#FFF'));
      return frame(BG.snacks, 'Закуски', out, 5);
    },
    sweets: function () {
      var out = shadow(116, 162, 70, 8) + R(108, 136, 16, 22, 4, '#E7DAC6') + E(116, 158, 30, 6, '#E7DAC6') + E(116, 136, 82, 12, '#F1E7D8');
      var l = layered(116, 132, 62, 16, [{ h: 16, color: '#FBF5EA' }, { h: 9, color: '#B5342A' }, { h: 16, color: '#FBF5EA' }], null);
      out += l.svg + E(116, l.top, 62, 16, '#FFFFFF');
      for (var k = 0; k < 9; k++) { var a = Math.PI * (k + 0.5) / 9; out += C(116 - Math.cos(a) * 60, l.top + 2 + Math.sin(a) * 15, 4.6, '#FFFFFF'); }
      // снежинки на красной ленте
      function flake(x, y, r) { return P('M' + (x - r) + ' ' + y + 'h' + 2 * r + 'M' + (x - r / 2) + ' ' + (y - r * 0.87) + 'l' + r + ' ' + (r * 1.73) + 'M' + (x + r / 2) + ' ' + (y - r * 0.87) + 'l' + (-r) + ' ' + (r * 1.73), 'none', st('#FFFFFF', 1.4)); }
      out += flake(80, 118, 3.6) + flake(100, 121, 3.6) + flake(120, 122, 3.6) + flake(140, 121, 3.6) + flake(158, 117, 3.6);
      // ёлочка из крема и ягоды
      out += P('M116 ' + (l.top - 22) + 'l10 14h-5l7 10h-24l7-10h-5z', '#2E7A50') + C(116, l.top - 23, 2.6, COL.gold);
      out += C(96, l.top + 2, 4.5, '#C2273A') + C(103, l.top + 6, 4.5, '#D2303F') + C(134, l.top + 3, 4.5, '#C2273A');
      // имбирная звезда рядом
      var s = '';
      for (k = 0; k < 10; k++) { var b = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 7 : 16; s += (k ? 'L' : 'M') + f(200 + Math.cos(b) * r) + ' ' + f(146 + Math.sin(b) * r); }
      out += P(s + 'Z', '#C47A3A', rot(12, 200, 146)) + P(s + 'Z', 'none', st('#FFFFFF', 1.8) + ' transform="rotate(12 200 146) translate(200 146) scale(.72) translate(-200 -146)"');
      out += P('M30 156l10-16 10 16h-6l6 9H30l6-9z', '#B86E33') + P('M34 152h12M32 162h16', 'none', st('#FFFFFF', 1.6));
      return frame(BG.sweets, 'Сладкое', out, 6);
    },
    trendy: function () {
      var rand = rng(361), out = board(14, 92, 120, 72);
      // ёлка из закусок на доске
      for (var k = 0; k < 5; k++) {
        var y = 152 - k * 13, hw = 36 * (1 - k / 5.4), n = Math.max(1, Math.round(hw * 2 / 11) + 1);
        for (var j = 0; j < n; j++) {
          var x = 72 - hw + (n === 1 ? hw : j * hw * 2 / (n - 1));
          out += [cube(x, y, 8.5, '#F5C842', 0), C(x, y, 5.2, '#B03A3A') + C(x - 1.5, y - 1, 0.9, '#F2C9BC'), P('M' + f(x - 5.5) + ' ' + f(y + 2) + 'A5.5 5.5 0 0 1 ' + f(x + 5.5) + ' ' + f(y + 2) + 'Z', '#DDEFB8', st('#4E8A34', 1.4)), cherryTom(x, y, 4.6)][k % 4];
        }
      }
      out += olive(64, 128, 2.8) + olive(84, 140, 2.8) + olive(72, 110, 2.8) + star(72, 90, 8, '#F5C842', st('#D9A441', 1.2));
      // кружка какао с маршмеллоу
      out += mug(176, 156, 52, 56, '#C0392B', '#7A4A2E', function (y) { return R(162, y - 5, 8, 7, 2, '#FFFFFF', rot(12, 166, y - 1)) + R(174, y - 6, 8, 7, 2, '#FFF4F0') + R(186, y - 4, 8, 7, 2, '#FFFFFF', rot(-15, 190, y)); });
      out += steam(166, 86, 2);
      out += mandarin(140, 160, 11) + mandarin(222, 160, 9);
      out += sparkle(30, 40, 9, '#F2C230') + sparkle(130, 56, 6, '#FFFFFF') + sparkle(48, 70, 5, '#F2C230') + sparkle(160, 36, 5, '#F2C230');
      return frame(BG.trendy, 'Модный стол', out, 8);
    },
  };

  function hero() {
    var rand = rng(151), out = '<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Праздничный стол: мандарины, ёлочная ветка и свеча">' +
      '<rect width="240" height="150" rx="18" fill="#F4E2CC"/>';
    for (var k = 0; k < 16; k++) out += C(rand() * 240, rand() * 90, 1 + rand() * 1.5, '#FFFFFF', ' opacity=".8"');
    out += R(0, 104, 240, 46, 0, '#9E2B25') + P('M0 104h240', 'none', st('#C8902E', 3));
    for (k = 0; k < 12; k++) out += R(k * 20 + 6, 112 + (k % 2) * 14, 8, 8, 2, 'rgba(255,255,255,.18)', rot(45, k * 20 + 10, 116 + (k % 2) * 14));
    // гирлянда
    out += P('M0 16q60 26 120 6t120 6', 'none', st('#6B4A2A', 1.4));
    var bulbs = [COL.red, COL.gold, '#2E8A4E', '#3E6E9E'];
    for (k = 0; k < 9; k++) { var x = 12 + k * 27, y = 16 + Math.sin(k / 8 * Math.PI * 2 + 0.6) * 7 + 6; out += E(x, y + 5, 3.4, 5, bulbs[k % 4]) + R(x - 2, y - 1, 4, 3, 1, '#7A6A5A'); }
    // ветка ели
    out += P('M150 112 L232 66', 'none', st('#6B4A2A', 3));
    for (k = 0; k < 12; k++) { var t = k / 11, bx = 150 + 82 * t, by = 112 - 46 * t; out += P('M' + f(bx) + ' ' + f(by) + 'l-4-13M' + f(bx) + ' ' + f(by) + 'l9 7', 'none', st(k % 2 ? COL.fir : COL.fir2, 3)); }
    out += C(196, 100, 9, COL.red) + C(193, 97, 2.6, 'rgba(255,255,255,.6)') + C(220, 92, 7, COL.gold) + C(218, 90, 2, 'rgba(255,255,255,.6)');
    // свеча
    out += R(22, 62, 16, 44, 3, '#FFF6E0') + E(30, 106, 16, 5, '#C8902E') + P('M30 62v-6', 'none', st('#3A2A26', 1.6)) + P('M30 56q-6-8 0-16q6 8 0 16z', '#F2A33A') + P('M30 54q-3-4 0-9q3 5 0 9z', '#FCE08A');
    // миска с мандаринами
    out += E(104, 118, 52, 8, 'rgba(60,20,10,.25)');
    var man = [[80, 84], [104, 80], [128, 84], [92, 70], [116, 68]];
    man.forEach(function (p, k) { out += C(p[0], p[1], 13, k % 2 ? '#F28A1E' : '#F39A2C') + C(p[0] - 4, p[1] - 4, 3.4, 'rgba(255,255,255,.35)') + C(p[0] + 2, p[1] - 11, 1.6, '#6E8A3A'); });
    out += P('M106 56q8-8 18-4q-8 6-18 4z', '#4E8E3A');
    out += P('M54 88h100q-4 26-50 26t-50-26z', '#FDF8F0') + P('M58 96h92', 'none', st(COL.red, 2.6));
    out += '</svg>';
    return out;
  }

  function empty() {
    var out = '<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Пустая тарелка">';
    out += plateTop(120, 78, 62, 52);
    out += G('translate(36 78)', R(-3, -40, 6, 80, 3, '#C9CDD2') + P('M-8-40v18q8 6 16 0v-18', 'none', st('#C9CDD2', 3)));
    out += G('translate(204 78)', R(-3, -10, 6, 50, 3, '#C9CDD2') + P('M-3-10q0-30 8-30v30z', '#C9CDD2'));
    out += P('M150 40l30-18', 'none', st('#6B4A2A', 2));
    for (var k = 0; k < 6; k++) { var t = k / 5, x = 150 + 30 * t, y = 40 - 18 * t; out += P('M' + f(x) + ' ' + f(y) + 'l-3-8M' + f(x) + ' ' + f(y) + 'l6 5', 'none', st(COL.fir, 2.4)); }
    out += C(160, 44, 5, COL.red);
    return out + '</svg>';
  }

  var cache = {};
  function dish(id) {
    if (cache[id]) return cache[id];
    var fn = DISHES[id];
    var r = (window.NYR_DATA && window.NYR_DATA.RECIPES || []).filter(function (x) { return x.id === id; })[0];
    var cat = r && BG[r.cat] ? r.cat : 'other';
    var label = r ? r.title : id;
    cache[id] = fn ? frame(BG[cat], label, fn(), id.length * 13 + 1) : frame(BG.other, label, '', 1);
    return cache[id];
  }
  function cat(id) {
    var key = 'cat:' + id;
    if (!cache[key]) cache[key] = CATS[id] ? CATS[id]() : frame(BG.other, id, '', 1);
    return cache[key];
  }

  window.NYR_ART = { dish: dish, cat: cat, hero: hero, empty: empty, ids: Object.keys(DISHES) };
})();
