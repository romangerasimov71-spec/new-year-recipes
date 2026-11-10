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
  var BG = { salads: '#E6EEDB', hot: '#F7E0CC', snacks: '#F4E8C8', sweets: '#F6DFDF', other: '#F4E7D6' };

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
    var cat = { olivier: 'salads', shuba: 'salads', mimosa: 'salads', crab: 'salads', vinegret: 'salads',
      'meat-french': 'hot', chicken: 'hot', duck: 'hot', potato: 'hot', buzhenina: 'hot',
      eggs: 'snacks', tartlets: 'snacks', lavash: 'snacks', sprats: 'snacks', holodets: 'snacks' }[id] || 'sweets';
    var r = (window.NYR_DATA && window.NYR_DATA.RECIPES || []).filter(function (x) { return x.id === id; })[0];
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
