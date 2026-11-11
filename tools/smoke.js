#!/usr/bin/env node
/* Автотест прототипа «Новогодний стол: рецепты».
   Запуск из корня репозитория:  node tools/smoke.js
   Можно указать адрес:          node tools/smoke.js https://romangerasimov71-spec.github.io/new-year-recipes/
   Без адреса тест сам поднимает маленький сервер на свободном порту.
   Скриншоты — в папку tools/out/ (в git не попадает).
   Нужен Playwright: require('playwright'). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'desktop', width: 1280, height: 800, touch: false }
];

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { failures++; console.log('  FAIL ' + msg); }
}

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

function appSize() {
  const files = ['index.html', 'css/app.css', 'js/recipes.js', 'js/art.js', 'js/app.js'];
  return files.reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);
}
// Фото блюд считаем отдельно от кода: full (960×720) — до 150 КБ, thumb (480×360) — до 40 КБ каждое.
const PHOTO_IDS = ['olivier', 'shuba', 'mimosa', 'crab', 'vinegret', 'meat-french', 'chicken', 'duck', 'potato', 'buzhenina',
  'eggs', 'tartlets', 'lavash', 'sprats', 'holodets', 'napoleon', 'sharlotka', 'tiramisu', 'kartoshka', 'gingerbread',
  'snack-tree', 'butter-board', 'wreath', 'tart-trees', 'snowmen', 'shuba-cups', 'olivier-rolls', 'snow-globe', 'persimmon',
  'accordion', 'potato-tree', 'wellington', 'ginger-house', 'buche', 'jar-dessert', 'mandarin-tiramisu', 'snowballs',
  'mulled', 'cocoa-bombs', 'lemonade',
  'hero', 'cat-salads', 'cat-hot', 'cat-snacks', 'cat-sweets', 'cat-trendy'];
function photoSizes(sz) {
  return PHOTO_IDS.map(n => { const f = path.join(ROOT, 'img/photo', sz, n + '.webp'); return { n, size: fs.existsSync(f) ? fs.statSync(f).size : -1 }; });
}

// Фото шагов: по данным рецептов (stepPhotos — число N или список номеров шагов).
function recipeData() {
  const ctx = { window: {} };
  require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'js/recipes.js'), 'utf8'), ctx);
  return ctx.window.NYR_DATA.RECIPES;
}
function stepNums(r) {
  const v = r.stepPhotos, out = [];
  if (typeof v === 'number') for (let n = 1; n <= Math.min(v, r.steps.length); n++) out.push(n);
  else if (Array.isArray(v)) v.forEach(n => { if (n >= 1 && n <= r.steps.length && !out.includes(n)) out.push(n); });
  return out;
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

// Проверки вёрстки на текущем экране.
async function layoutCheck(page, label) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [];
    document.querySelectorAll('#app *, .hdr *').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      if (el.closest('.gal-track')) return; // кадры ленты листания за краем фото обрезаны нарочно
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return;
      if (b.right > vw + 1 || b.left < -1) wide.push(el.tagName + '.' + el.className + ' ' + Math.round(b.left) + '..' + Math.round(b.right));
    });
    const small = [];
    document.querySelectorAll('#app button, #app a.btn, #app a.big-btn, #app a.tile, #app a.rcard, #app .chk, .hdr-back').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.width && (b.height < 47.5 || b.width < 47.5)) small.push(el.textContent.trim().slice(0, 30) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
    });
    const tiny = [];
    const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (el.closest('svg')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 17) tiny.push(n.textContent.trim().slice(0, 30) + ' ' + fs + 'px');
    }
    // Текст, не влезающий в свой блок (обрезан или вылез наружу).
    document.querySelectorAll('#app *').forEach(el => {
      if (el.closest('svg') || el.tagName === 'TEXTAREA' || el.closest('.gal-view')) return;
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && getComputedStyle(el).display !== 'inline') wide.push('текст не влез: ' + el.tagName + '.' + el.className + ' ' + el.textContent.trim().slice(0, 20));
    });
    return { overflow: document.documentElement.scrollWidth - vw, wide: wide.slice(0, 5), small: small.slice(0, 5), tiny: tiny.slice(0, 5) };
  });
  ok(r.overflow <= 0 && r.wide.length === 0, label + ': ничего не вылезает по ширине' + (r.wide.length ? ' ' + JSON.stringify(r.wide) : '') + (r.overflow > 0 ? ' overflow ' + r.overflow : ''));
  ok(r.small.length === 0, label + ': кнопки не меньше 48px' + (r.small.length ? ' ' + JSON.stringify(r.small) : ''));
  ok(r.tiny.length === 0, label + ': текст не мельче 17px' + (r.tiny.length ? ' ' + JSON.stringify(r.tiny) : ''));
}

async function main() {
  let srv = null;
  let base = process.argv[2];
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port + '/'; }
  console.log('Адрес: ' + base);

  const size = appSize();
  console.log('\nРазмер приложения: ' + (size / 1024).toFixed(1) + ' КБ');
  ok(size < 300 * 1024, 'код меньше 300 КБ (без фото)');
  for (const [sz, lim] of [['full', 150], ['thumb', 40]]) {
    const l = photoSizes(sz), sum = l.reduce((s, x) => s + Math.max(0, x.size), 0), max = l.reduce((a, b) => (b.size > a.size ? b : a));
    console.log('Фото ' + sz + ': ' + l.filter(x => x.size > 0).length + ' шт, всего ' + (sum / 1024).toFixed(0) + ' КБ, самое большое ' + max.n + ' ' + (max.size / 1024).toFixed(1) + ' КБ');
    const missing = l.filter(x => x.size < 0).map(x => x.n), big = l.filter(x => x.size > lim * 1024).map(x => x.n);
    ok(!missing.length && !big.length, 'фото ' + sz + ': все ' + PHOTO_IDS.length + ' на месте, каждое не больше ' + lim + ' КБ' + (missing.length ? ' нет: ' + missing.join() : '') + (big.length ? ' больше: ' + big.join() : ''));
  }

  {
    // Фото шагов: у каждого рецепта есть, файлы на месте, лишних файлов нет, full ≤ 150 КБ, thumb ≤ 40 КБ.
    const R = recipeData(), want = [];
    R.forEach(r => stepNums(r).forEach(n => want.push(r.id + '-' + n + '.webp')));
    // У всех 40 рецептов (классика и «Модный стол») — фото блюда и фото каждого шага.
    const withPh = R.filter(r => r.photo !== false);
    const noPhotos = R.filter(r => stepNums(r).length !== r.steps.length).map(r => r.id);
    ok(R.length === 40 && withPh.length === 40, 'у всех ' + R.length + ' рецептов есть фото блюда (нет photo: false)');
    ok(!noPhotos.length, 'фото шагов у всех 40 рецептов — у каждого шага' + (noPhotos.length ? ' не у всех шагов: ' + noPhotos.join() : ''));
    for (const [sz, lim] of [['full', 150], ['thumb', 40]]) {
      const dir = path.join(ROOT, 'img/photo/steps', sz), have = fs.readdirSync(dir).filter(f => f.endsWith('.webp'));
      const missing = want.filter(f => !have.includes(f)), extra = have.filter(f => !want.includes(f));
      const sizes = have.map(f => ({ f, size: fs.statSync(path.join(dir, f)).size })), max = sizes.reduce((a, b) => (b.size > a.size ? b : a));
      const big = sizes.filter(x => x.size > lim * 1024).map(x => x.f), sum = sizes.reduce((s, x) => s + x.size, 0);
      console.log('Фото шагов ' + sz + ': ' + have.length + ' шт, всего ' + (sum / 1024).toFixed(0) + ' КБ, самое большое ' + max.f + ' ' + (max.size / 1024).toFixed(1) + ' КБ');
      ok(!missing.length && !extra.length && !big.length, 'фото шагов ' + sz + ': ' + want.length + ' по данным, все на месте, лишних нет, каждое не больше ' + lim + ' КБ' +
        (missing.length ? ' нет: ' + missing.join() : '') + (extra.length ? ' лишние: ' + extra.join() : '') + (big.length ? ' больше: ' + big.join() : ''));
    }
  }

  const browser = await chromium.launch();

  /* ---------- Данные ---------- */
  console.log('\nДанные рецептов');
  {
    const page = await browser.newPage();
    await page.goto(base);
    const d = await page.evaluate(() => {
      const D = window.NYR_DATA, A = window.NYR_ART;
      const bad = [];
      D.RECIPES.forEach(r => {
        if (r.steps.length < 4 || r.steps.length > 8) bad.push(r.id + ': шагов ' + r.steps.length);
        if (!r.tip) bad.push(r.id + ': нет совета');
        if (!r.time || !r.level || !r.serves) bad.push(r.id + ': нет времени/сложности/порций');
        if (A.ids.indexOf(r.id) < 0) bad.push(r.id + ': нет картинки');
        r.ingredients.forEach(i => {
          if (D.UNITS.indexOf(i.unit) < 0) bad.push(r.id + ': единица ' + i.unit);
          if (!D.DEPT[i.name] && !D.NO_BUY[i.name]) bad.push(r.id + ': нет отдела для ' + i.name);
          if (i.unit !== 'по вкусу' && !(i.qty > 0)) bad.push(r.id + ': нет количества ' + i.name);
        });
      });
      const perCat = {};
      D.RECIPES.forEach(r => { perCat[r.cat] = (perCat[r.cat] || 0) + 1; });
      const ids = D.RECIPES.map(r => r.id);
      const tr = D.RECIPES.filter(r => r.cat === 'trendy');
      const also = {};
      tr.forEach(r => { also[r.alsoIn || '-'] = (also[r.alsoIn || '-'] || 0) + 1; });
      const badAlso = tr.filter(r => r.alsoIn && ['salads', 'hot', 'snacks', 'sweets'].indexOf(r.alsoIn) < 0).map(r => r.id);
      const drinks = tr.filter(r => !r.alsoIn).map(r => r.id).sort().join();
      const withPhoto = D.RECIPES.filter(r => r.photo !== false).map(r => r.id);
      const cat = D.CATEGORIES.find(c => c.id === 'trendy');
      return { n: D.RECIPES.length, perCat, bad, unique: new Set(ids).size === ids.length, ids, withPhoto, also, badAlso, drinks,
        cat: cat && cat.title + '|' + cat.sub + '|' + !!cat.featured, trPhoto: tr.every(r => r.photo !== false) && cat.photo !== false };
    });
    ok(d.n === 40, 'рецептов 40 (' + d.n + ')');
    ok(['salads', 'hot', 'snacks', 'sweets'].every(c => d.perCat[c] === 5) && d.perCat.trendy === 20 && Object.keys(d.perCat).length === 5, 'по 5 в базовых разделах и 20 в «Модном столе» ' + JSON.stringify(d.perCat));
    ok(d.cat === 'Модный стол|Как в соцсетях|true', 'категория «Модный стол», подзаголовок «Как в соцсетях»');
    ok(!d.badAlso.length && d.drinks === 'cocoa-bombs,lemonade,mulled', 'модные блюда — ещё и в своём базовом разделе, напитки — только в «Модном столе» ' + JSON.stringify(d.also));
    ok(d.unique, 'id рецептов не повторяются');
    ok(d.bad.length === 0, 'шаги 4–8, совет, картинка, единицы и отделы на месте' + (d.bad.length ? ' ' + JSON.stringify(d.bad) : ''));
    ok(d.withPhoto.length === 40 && d.withPhoto.every(id => PHOTO_IDS.indexOf(id) >= 0) && d.trPhoto, 'у всех 40 рецептов и плашки «Модный стол» фото, все в списке PHOTO_IDS');
    await page.close();
  }

  /* ---------- Математика списка покупок ---------- */
  console.log('\nСписок покупок (готовое меню)');
  {
    const page = await browser.newPage();
    await page.goto(base);
    const shopping = (ids, g) => page.evaluate(([ids, g]) => window.NYR.buildShopping(ids || window.NYR_DATA.READY_MENU, g), [ids, g]);
    for (const g of [2, 8]) {
      const list = await shopping(null, g);
      const get = n => (list.items.find(x => x.name === n) || {}).amount;
      console.log('  — на ' + g + ' гостей:');
      list.items.forEach(x => console.log('      [' + x.dept + '] ' + x.name + ' — ' + x.amount));
      console.log('      дома: ' + list.home.join(', '));
      ok(list.items.every(x => !/\d,\d+ шт/.test(x.amount) && !/½ шт/.test(x.amount)), g + ' гостей: штуки целые');
      ok(list.items.every(x => { const m = /^(\d+) г/.exec(x.amount); if (!m) return true; const v = +m[1]; return v < 200 ? v % 10 === 0 : v % 50 === 0; }), g + ' гостей: граммы округлены до 10/50');
      ok(!list.items.some(x => /по вкусу/.test(x.amount)), g + ' гостей: «по вкусу» нет в основном списке');
      ok(list.home.indexOf('Соль') >= 0 && list.home.indexOf('Перец чёрный молотый') >= 0, g + ' гостей: соль и перец — в блоке «проверьте дома»');
      const depts = {};
      list.items.forEach(x => { (depts[x.dept] = depts[x.dept] || []).push(x.name); });
      ok(Object.values(depts).every(a => a.join('|') === a.slice().sort((p, q) => p.localeCompare(q, 'ru')).join('|')), g + ' гостей: внутри отдела по алфавиту');
      if (g === 8) {
        // яйца: оливье 4·8/6=5,33 + шуба 3·8/8=3 + яйца 6·8/6=8 + наполеон (целый торт на 12) 3 = 19,33 → 20
        ok(get('Яйца') === '20 шт (≈ 2 десятка)', '8 гостей: яйца 20 шт (≈ 2 десятка) (' + get('Яйца') + ')');
        // майонез: 266,7 + 250 + 80 + 200 = 796,7 → 800 г
        ok(get('Майонез') === '800 г', '8 гостей: майонез 800 г (' + get('Майонез') + ')');
        // картофель: оливье 5,33 + шуба 3 + мясо 8 = 16,33 → 17
        ok(get('Картофель') === '17 шт', '8 гостей: картофель 17 шт (' + get('Картофель') + ')');
        ok(get('Молоко') === '1 л', '8 гостей: молоко 1 л (' + get('Молоко') + ')');
      } else {
        // яйца: 1,33 + 0,75 + 2 + 3 = 7,08 → 8
        ok(get('Яйца') === '8 шт', '2 гостя: яйца 8 шт (' + get('Яйца') + ')');
        // майонез: 66,7 + 62,5 + 20 + 50 = 199,2 → 200 г
        ok(get('Майонез') === '200 г', '2 гостя: майонез 200 г (' + get('Майонез') + ')');
        // мука: торт целиком 450 + 80 = 530 → 550 г
        ok(get('Мука') === '550 г', '2 гостя: мука 550 г (' + get('Мука') + ')');
      }
    }
    // А3: понятные количества
    console.log('  — понятные количества (А3)');
    const amt = async (ids, g, name) => ((await shopping(ids, g)).items.find(x => x.name === name) || {}).amount;
    const oil = await amt(['vinegret', 'potato'], 6, 'Масло растительное');
    ok(oil === '≈ 120 мл', '8 ст. л. масла → «≈ 120 мл» (' + oil + ')');
    const garlic = await amt(['buzhenina', 'holodets', 'potato', 'chicken'], 8, 'Чеснок (зубчики)');
    ok(/^\d+ головк[аи]? \(≈ \d+ зубчик/.test(garlic || ''), 'много чеснока → головки (' + garlic + ')');
    const bay = await amt(['buzhenina', 'holodets'], 8, 'Лавровый лист');
    ok(bay === '1 пачка', 'лавровый лист → «1 пачка» (' + bay + ')');
    const pep = await amt(['holodets'], 40, 'Перец чёрный горошком');
    ok(pep === '1 пачка', 'перец горошком → «1 пачка» (' + pep + ')');
    const cocoa = await amt(['kartoshka', 'tiramisu'], 40, 'Какао-порошок');
    ok(/ст\. л\. \(≈ \d+ г\)/.test(cocoa || ''), 'какао больше 10 ст. л. → «(≈ N г)» (' + cocoa + ')');
    const paprika = await amt(['chicken', 'potato', 'buzhenina'], 20, 'Паприка молотая');
    ok(/ст\. л\./.test(paprika || ''), 'ч. л. от 6 → ст. л. (' + paprika + ')');
    const eggs = await amt(null, 20, 'Яйца');
    ok(/шт \(≈ \d+ десятк/.test(eggs || ''), 'яйца от 20 → десятки (' + eggs + ')');
    // А4: рецепт
    const ing = await page.evaluate(() => {
      const F = window.NYR.fmtIng, R = id => window.NYR_DATA.RECIPES.find(r => r.id === id);
      const g = (id, n) => R(id).ingredients.find(i => i.name === n);
      return {
        eggs: F(g('olivier', 'Яйца'), 7 / 6), cucumber: F(g('crab', 'Огурец свежий'), 9 / 6),
        vanilla: F(g('tiramisu', 'Ванильный сахар'), 3 / 8), bay: F(g('buzhenina', 'Лавровый лист'), 3 / 8),
        tsp: F(g('chicken', 'Соль'), 4)
      };
    });
    ok(ing.eggs === '5 шт', 'рецепт: яйца вверх до целых (' + ing.eggs + ')');
    ok(ing.cucumber === '1½ шт', 'рецепт: огурец половинками (' + ing.cucumber + ')');
    ok(ing.vanilla === 'щепотка', 'рецепт: меньше 5 г → щепотка (' + ing.vanilla + ')');
    ok(ing.bay === '2 шт', 'рецепт: лавровый лист до целых (' + ing.bay + ')');
    ok(ing.tsp === '2½ ст. л.', 'рецепт: 8 ч. л. → ст. л. (' + ing.tsp + ')');
    // «Модный стол» в списке покупок: одинаковые продукты складываются, напитки — в мл и л.
    console.log('  — с блюдами «Модного стола»');
    const tl = await shopping(['olivier', 'snow-globe', 'accordion', 'mulled', 'lemonade', 'tiramisu', 'mandarin-tiramisu', 'buche'], 12);
    const tg = n => (tl.items.find(x => x.name === n) || {}).amount;
    const names = tl.items.map(x => x.name);
    ok(new Set(names).size === names.length && tl.items.every(x => x.dept !== 'other'), 'модные: продукты не повторяются, у всех есть отдел');
    // мандарины: тирамису 6·12/6 = 12 + лимонад 8·12/6 = 16 → 28
    ok(tg('Мандарины') === '28 шт', '12 гостей: мандарины 28 шт (' + tg('Мандарины') + ')');
    // куриное филе: шар 400·12/8 = 600 + гармошка 800·12/4 = 2400 → 3 кг
    ok(tg('Куриное филе') === '3 кг', '12 гостей: куриное филе 3 кг (' + tg('Куриное филе') + ')');
    // сок вишнёвый: 1 л · 12/6 = 2 л
    ok(tg('Сок вишнёвый') === '2 л' && (tl.items.find(x => x.name === 'Сок вишнёвый') || {}).dept === 'drinks', '12 гостей: сок вишнёвый 2 л, отдел «Напитки» (' + tg('Сок вишнёвый') + ')');
    // сливки: тирамису 200·12/8 = 300 + мандариновое 200·12/6 = 400 + полено (2 полена) 450·2 = 900 → 1,6 л
    ok(tg('Сливки 33%') === '1,6 л', '12 гостей: сливки 1,6 л (' + tg('Сливки 33%') + ')');
    ok(tl.home.indexOf('Лёд') >= 0 && names.indexOf('Вода') < 0, 'лёд — в «Проверьте дома», воды в списке нет');
    const bw = await page.evaluate(() => window.NYR.menuFactor(window.NYR_DATA.RECIPES.find(r => r.id === 'buche'), 12));
    ok(bw === 2, 'полено — целое блюдо: на 12 гостей 2 полена (' + bw + ')');
    const drinkIng = await page.evaluate(() => { const r = window.NYR_DATA.RECIPES.find(x => x.id === 'mulled'); return window.NYR.fmtIng(r.ingredients[0], 1 / 6); });
    ok(drinkIng === '170 мл', 'глинтвейн на 1 кружку: сок 170 мл (' + drinkIng + ')');
    await page.close();
  }

  /* ---------- Экраны ---------- */
  for (const vp of VIEWPORTS) {
    console.log('\nЭкран ' + vp.name + ' ' + vp.width + '×' + vp.height);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(base);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();

    const shot = async n => page.screenshot({ path: path.join(OUT, vp.name + '-' + n + '.png'), fullPage: !/fold/.test(n) });

    await layoutCheck(page, 'главная');
    await shot('home'); await shot('home-fold');
    ok(await page.locator('.tile').count() === 4, 'на главной 4 раздела');
    ok(await page.getByText('Моё меню на праздник').count() > 0 && await page.getByText('Список покупок').count() > 0, 'есть кнопки меню и списка покупок');
    const above = await page.evaluate(() => document.querySelector('.home-actions').getBoundingClientRect().top < document.querySelector('.tiles').getBoundingClientRect().top);
    ok(above, 'кнопки меню и списка — над плитками');
    if (vp.name === 'phone-portrait') {
      const inView = await page.evaluate(() => document.querySelector('.home-actions .big-btn:last-child').getBoundingClientRect().bottom <= innerHeight);
      ok(inView, 'обе кнопки видны на первом экране');
    }
    // Плашка «Модный стол»: на всю ширину, «Новинка», картинка, «20 рецептов», сразу под кнопками, над плитками.
    const fb = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="feature-trendy"]');
      if (!b) return null;
      const r = b.getBoundingClientRect(), tiles = document.querySelector('.tiles').getBoundingClientRect(), act = document.querySelector('.home-actions').getBoundingClientRect();
      return { text: b.textContent, href: b.getAttribute('href'), art: !!b.querySelector('.feature-art svg, .feature-art img'),
        full: Math.abs(r.width - act.width) < 2, below: r.top >= act.bottom, above: r.bottom <= tiles.top, bottom: r.bottom, h: innerHeight,
        newVis: getComputedStyle(b.querySelector('.feature-new')).backgroundColor };
    });
    ok(fb && /Новинка/.test(fb.text) && /Модный стол/.test(fb.text) && /20\u00a0рецептов/.test(fb.text) && fb.art && fb.href === '#c/trendy', 'плашка «Модный стол»: «Новинка», картинка, «20 рецептов», ведёт в раздел');
    ok(fb && fb.full && fb.below && fb.above, 'плашка на всю ширину, под кнопками меню и списка, над плитками');
    if (vp.name === 'phone-portrait') ok(fb && fb.bottom <= fb.h, 'плашка целиком на первом экране (низ ' + (fb && Math.round(fb.bottom)) + ' из ' + (fb && fb.h) + ')');
    const tileSubs = await page.evaluate(() => [...document.querySelectorAll('.tile')].map(t => t.getAttribute('href') + ' ' + t.querySelector('.tile-sub').textContent).join('; '));
    ok(tileSubs === '#c/salads 10 рецептов; #c/hot 8 рецептов; #c/snacks 9 рецептов; #c/sweets 10 рецептов', 'на плитках счёт с модными блюдами (' + tileSubs + ')');

    const CAT_N = { salads: 10, hot: 8, snacks: 9, sweets: 10 };
    for (const cat of ['salads', 'hot', 'snacks', 'sweets']) {
      await page.goto(base + '#c/' + cat);
      const c = await page.evaluate(() => [...document.querySelectorAll('.rcard')].map(a => !!a.querySelector('.tag-trendy')));
      const firstTr = c.indexOf(true);
      ok(c.length === CAT_N[cat] && firstTr === 5 && c.slice(5).every(Boolean), 'раздел ' + cat + ': ' + c.length + ' рецептов, 5 классических, потом модные с меткой «Модное»');
      await layoutCheck(page, 'раздел ' + cat);
      if (cat === 'salads') await shot('cat-salads');
    }
    await page.goto(base + '#c/trendy');
    const tp = await page.evaluate(() => ({ n: document.querySelectorAll('.rcard').length, h: [...document.querySelectorAll('h2.sec-title')].map(h => h.textContent).join(','),
      tags: document.querySelectorAll('.tag-trendy').length, title: document.querySelector('.page-title').textContent, sub: (document.querySelector('.cat-sub') || {}).textContent }));
    ok(tp.n === 20 && tp.title === 'Модный стол' && tp.sub === 'Как в соцсетях' && tp.h === 'Салаты,Закуски,Горячее,Сладкое,Напитки' && tp.tags === 0, '«Модный стол»: 20 рецептов под подзаголовками (' + tp.h + ')');
    await layoutCheck(page, 'раздел trendy');
    await shot('cat-trendy');
    const ids = await page.evaluate(() => window.NYR_DATA.RECIPES.map(r => r.id));
    let allOpen = true;
    for (const id of ids) {
      await page.goto(base + '#r/' + id);
      const title = await page.locator('.page-title').textContent();
      const expect = await page.evaluate(id => window.NYR_DATA.RECIPES.find(r => r.id === id).title, id);
      if (title !== expect) { allOpen = false; ok(false, 'рецепт ' + id + ' открывается по ссылке'); }
      await layoutCheck(page, 'рецепт ' + id);
    }
    ok(allOpen, 'все ' + ids.length + ' рецептов открываются по прямой ссылке #r/…');
    if (vp.name === 'phone-landscape') {
      await page.goto(base + '#r/duck');
      const r = await page.evaluate(() => ({ t: document.querySelector('.page-title').getBoundingClientRect(), f: document.querySelector('.facts').getBoundingClientRect(), h: innerHeight }));
      ok(r.t.bottom <= r.h && r.f.top < r.h, 'альбом: название и время рецепта видны без прокрутки');
      await shot('recipe-fold');
    }

    // А10: хвосты в ссылке.
    for (const h of ['#r/olivier/', '#r/olivier?x=1', '#R/Olivier']) {
      await page.goto(base + h);
      ok((await page.locator('.page-title').textContent()) === 'Оливье', 'ссылка ' + h + ' открывает рецепт');
    }

    // Рецепт: порции, шаги, меню.
    await page.goto(base);
    await page.click('a.tile[href="#c/salads"]');
    await page.click('a.rcard[href="#r/olivier"]');
    ok(await page.locator('.page-title').textContent() === 'Оливье', 'переход: главная → салаты → оливье');
    const qBefore = await page.locator('.ings li', { hasText: 'Колбаса' }).locator('.ing-q').textContent();
    await page.click('[data-act="por+"]'); await page.click('[data-act="por+"]');
    const qAfter = await page.locator('.ings li', { hasText: 'Колбаса' }).locator('.ing-q').textContent();
    ok(qBefore === '300 г' && qAfter === '400 г', 'порции +2: колбаса 300 г → 400 г (' + qBefore + ' → ' + qAfter + ')');
    await page.locator('.step').nth(0).click();
    ok(await page.locator('.step.done').count() === 1, 'шаг отмечается «сделано»');
    await shot('recipe');

    // А5: двойное нажатие не отменяет само себя.
    await page.locator('[data-act="menu-add"]').first().dblclick();
    await page.locator('[data-act="menu-del"]').first().click(); // сразу «убрать» — в пределах 600 мс игнорируется
    ok(await page.locator('.in-menu').count() > 0, 'двойное нажатие «Добавить» и быстрое «Убрать» — блюдо осталось в меню');
    ok(await page.locator('[data-act="menu-del"]').count() > 0, 'есть плашка «В вашем меню» и отдельная «Убрать из меню»');
    ok(await page.locator('#toast').isVisible(), 'плашка «Добавлено в меню»');
    await page.waitForTimeout(650);
    // А6: убрать — «Вернуть»
    await page.locator('[data-act="menu-del"]').first().click();
    ok(await page.locator('#toast [data-toast-undo]').isVisible(), 'после «Убрать» — плашка с «Вернуть»');
    await page.click('#toast [data-toast-undo]');
    ok(await page.locator('.in-menu').count() > 0, '«Вернуть» возвращает блюдо в меню');

    // Кнопка «Назад» в шапке и системная «назад».
    await page.click('#hdr-back');
    await page.waitForTimeout(100);
    ok((await page.evaluate(() => location.hash)) === '#c/salads', 'кнопка «Назад» в шапке → раздел');
    ok(await page.locator('.tag:not(.tag-trendy)').count() === 1, 'в разделе отмечено «В моём меню»');
    await page.goForward();
    await page.goBack();
    ok((await page.evaluate(() => location.hash)) === '#c/salads', 'системная «назад» работает');
    await page.goBack();
    ok((await page.locator('.tile').count()) === 4, 'системная «назад» → главная');

    // Сохранение после перезагрузки.
    await page.reload();
    ok((await page.locator('[data-testid="menu-count"]').textContent()) === '1 блюдо', 'меню сохранилось после перезагрузки');
    await page.goto(base + '#r/olivier');
    ok(await page.locator('.step.done').count() === 1, 'отметка шага сохранилась');

    // Пустое меню → готовое меню.
    await page.goto(base + '#menu');
    await page.click('[data-act="menu-remove"]');
    ok(await page.locator('[data-act="ready-menu"]').count() === 1, 'пустое меню: подсказка и «Готовое меню»');
    await layoutCheck(page, 'пустое меню');
    await shot('menu-empty');
    await page.click('[data-act="ready-menu"]');
    ok(await page.locator('.mitem').count() === 5, 'готовое меню: 5 блюд');
    // А7: быстрые кнопки гостей
    await page.click('[data-act="guests-set"][data-v="8"]');
    ok((await page.locator('[data-testid="guests"]').textContent()) === '8', 'быстрая кнопка «8» → гостей 8');
    await layoutCheck(page, 'меню');
    await shot('menu');

    // А2: рецепт из меню — на гостей меню.
    await page.click('a.mitem-link[href^="#r/olivier"]');
    ok((await page.locator('[data-testid="portions"]').textContent()) === '8', 'оливье из меню: 8 порций, как гостей');
    ok(await page.locator('[data-testid="from-menu"]').isVisible(), 'подпись «как в вашем меню»');
    ok((await page.locator('.ings li', { hasText: 'Колбаса' }).locator('.ing-q').textContent()) === '400 г', 'оливье из меню: колбаса 400 г');
    await page.goBack();
    await page.click('a.mitem-link[href^="#r/napoleon"]');
    ok(/1 торт — 12 порций/.test(await page.locator('[data-testid="whole-note"]').textContent()), 'Наполеон из меню: «1 торт — 12 порций»');
    await page.goBack();

    // Список покупок.
    await page.click('a.btn[href="#shop"]');
    ok(await page.locator('.shop li').count() > 20, 'список покупок собран');
    ok(await page.locator('[data-testid="home-list"]').count() === 1, 'внизу «Проверьте, есть ли дома»');
    const firstName = await page.locator('.shop input').first().getAttribute('data-name');
    await page.locator('.shop li').first().click();
    ok(await page.locator('.shop li.bought').count() === 1, 'галочка «куплено» зачёркивает строку');
    // А14: фокус остаётся на той же галочке
    const second = page.locator('.shop input').nth(3);
    const secondName = await second.getAttribute('data-name');
    await second.focus(); await page.keyboard.press('Space');
    ok((await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-name'))) === secondName, 'фокус остаётся на той же галочке (' + secondName + ')');
    await page.keyboard.press('Space');
    void firstName;
    await layoutCheck(page, 'список покупок');
    await shot('shop');

    // Поделиться без navigator.share → плашка или окно.
    await page.evaluate(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {} });
    await page.click('[data-act="share-shop"]');
    await page.waitForTimeout(200);
    const shared = await page.evaluate(() => window.__lastShare);
    ok(/Рецепты к Новому году — https:\/\/romangerasimov71-spec\.github\.io\/new-year-recipes\//.test(shared), 'текст списка со строкой-ссылкой в конце');
    ok(/Проверьте, есть ли дома: .*соль/.test(shared), 'в тексте списка — «Проверьте, есть ли дома»');
    const toastOn = await page.locator('#toast').isVisible();
    const modalOn = await page.locator('#copy-modal').isVisible();
    ok(toastOn || modalOn, 'после «Поделиться» — плашка «Скопировано» или окно с текстом');
    if (toastOn) ok((await page.locator('#toast').textContent()).includes('Скопировано'), 'плашка: «Скопировано — вставьте в сообщение»');
    if (modalOn) await page.click('#copy-close');
    await page.goto(base + '#r/shuba');
    await page.click('[data-act="share-recipe"]');
    const rt = await page.evaluate(() => window.__lastShare);
    ok(/Селёдка под шубой/.test(rt) && /Ингредиенты:/.test(rt) && /\n1\. /.test(rt) && /#r\/shuba$/.test(rt), 'текст рецепта: название, ингредиенты, шаги, ссылка на рецепт');
    await page.goto(base + '#menu');
    await page.click('[data-act="share-menu"]');
    const mt = await page.evaluate(() => window.__lastShare);
    ok(/^🎄 Наше меню на Новый год \(на 8 гостей\):/.test(mt) && /Салаты: Оливье, Селёдка под шубой/.test(mt) && (mt.match(/https:/g) || []).length === 1, 'текст меню: по разделам в строку, одна ссылка в конце');

    // Модное блюдо: добавили из базового раздела — в меню один раз, своим разделом «Модный стол».
    await page.goto(base + '#c/salads');
    await page.click('a.rcard[href="#r/snow-globe"]');
    await page.click('[data-act="menu-add"]');
    await page.waitForTimeout(650);
    await page.goto(base + '#c/trendy');
    ok(await page.locator('a.rcard[href="#r/snow-globe"] .tag').count() === 1, 'в «Модном столе» тоже отмечено «В моём меню»');
    await page.click('a.rcard[href="#r/mulled"]');
    ok(/Кружек:/.test(await page.locator('.stepper-label').textContent()) && /6 кружек/.test(await page.locator('.facts').textContent()), 'напиток: «Кружек:» и выход «6 кружек»');
    await page.click('[data-act="menu-add"]');
    await page.click('[data-act="share-recipe"]');
    ok(/Кружек: 6/.test(await page.evaluate(() => window.__lastShare)), 'текст рецепта напитка: «Кружек: 6»');
    await page.goto(base + '#menu');
    const mm = await page.evaluate(() => ({ h: [...document.querySelectorAll('h2.sec-title')].map(h => h.textContent), sg: document.querySelectorAll('a.mitem-link[href^="#r/snow-globe"]').length,
      meta: (document.querySelector('a.mitem-link[href^="#r/mulled"] .mitem-meta') || {}).textContent }));
    ok(mm.sg === 1 && mm.h[mm.h.length - 1] === 'Модный стол' && mm.h.indexOf('Модный стол') === mm.h.length - 1, 'меню: модное блюдо один раз, в разделе «Модный стол» (' + mm.h.join(',') + ')');
    ok(mm.meta === 'на 8 кружек', 'меню: глинтвейн «на 8 кружек» (' + mm.meta + ')');
    await layoutCheck(page, 'меню с модными');
    await page.click('[data-act="share-menu"]');
    const mt2 = await page.evaluate(() => window.__lastShare);
    ok(/\nМодный стол: Салат «Снежный шар», Безалкогольный глинтвейн\n/.test(mt2) && (mt2.match(/Снежный шар/g) || []).length === 1, 'текст меню: «Модный стол: …», без дублей');
    await page.goto(base + '#shop');
    const sh = await page.evaluate(() => [...document.querySelectorAll('.shop input')].map(i => i.getAttribute('data-name')));
    ok(sh.indexOf('Шампиньоны') >= 0 && sh.indexOf('Сок вишнёвый') >= 0 && new Set(sh).size === sh.length, 'список покупок: продукты модных блюд, без дублей');
    await page.click('[data-act="share-shop"]');
    const st2 = await page.evaluate(() => window.__lastShare);
    ok(/\nНапитки:\n• Сок вишнёвый — 1,35 л/.test(st2), 'текст списка: отдел «Напитки», сок 1,35 л (1 л · 8/6, вверх до 50 мл)');
    await page.goto(base + '#menu');
    await page.click('[data-act="menu-remove"][data-id="snow-globe"]');
    await page.click('[data-act="menu-remove"][data-id="mulled"]');
    await page.waitForTimeout(100);

    ok(errors.length === 0, 'ошибок в консоли нет' + (errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''));
    await ctx.close();
  }

  /* ---------- А1: «куплено» следит за количеством ---------- */
  console.log('\nКуплено и количество (А1)');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = watchErrors(page);
    await page.goto(base + '#menu');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();
    await page.click('[data-act="ready-menu"]');
    await page.click('[data-act="guests-set"][data-v="6"]');
    await page.goto(base + '#shop');
    const eggRow = page.locator('.shop li', { has: page.locator('input[data-name="Яйца"]') });
    ok((await eggRow.locator('.shop-q').textContent()) === '16 шт', 'на 6 гостей яиц 16 шт');
    await eggRow.click();
    await page.locator('.shop li', { has: page.locator('input[data-name="Молоко"]') }).click();
    ok(await eggRow.evaluate(el => el.classList.contains('bought')), 'яйца отмечены');
    await page.goto(base + '#menu');
    await page.click('[data-act="guests-set"][data-v="20"]');
    await page.goto(base + '#shop');
    ok(!(await eggRow.evaluate(el => el.classList.contains('bought'))), 'на 20 гостей яйца снова не отмечены');
    const more = await eggRow.locator('[data-testid="more"]').textContent();
    ok(/Куплено 16 шт, докупить 31 шт/.test(more), 'подпись «куплено 16 шт, докупить 31 шт» (' + more + ')');
    await page.click('[data-act="share-shop"]');
    const st = await page.evaluate(() => window.__lastShare);
    ok(/Яйца — докупить 31 шт/.test(st), 'в «Поделиться» — «докупить 31 шт»');
    // Отметки по исчезнувшим продуктам удаляются.
    await page.goto(base + '#menu');
    await page.click('[data-act="menu-remove"][data-id="napoleon"]');
    await page.goto(base + '#shop');
    const kept = await page.evaluate(() => Object.keys(window.NYR.state.bought));
    ok(kept.indexOf('Молоко') < 0, 'отметка «Молоко» удалена вместе с Наполеоном');
    ok(errors.length === 0, 'без ошибок' + (errors.length ? ' ' + JSON.stringify(errors) : ''));
    await page.close();
  }

  /* ---------- Фото блюд ---------- */
  console.log('\nФото блюд');
  {
    // Все страницы с фото: главная, 5 разделов, 40 рецептов, меню; фото загрузились, у рецептов — своё большое фото.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    const bad = [];
    page.on('response', r => { if (/img\/photo\//.test(r.url()) && r.status() >= 400) bad.push(r.url()); });
    const loadedAll = async () => page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('#app img.photo')];
      imgs.forEach(i => { i.loading = 'eager'; });
      await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      return imgs.map(i => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0, alt: i.alt, lazy: i.getAttribute('loading') === 'lazy', w: +i.getAttribute('width'), h: +i.getAttribute('height') }));
    });
    await page.goto(base);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();
    const home = await loadedAll();
    ok(home.length === 6 && home.every(i => i.ok), 'главная: праздничный стол, плашка «Модный стол» и 4 плитки разделов — фото (' + home.length + ')');
    ok(home.some(i => i.src === 'img/photo/thumb/cat-trendy.webp' && i.alt === 'Модный стол'), 'плашка «Модный стол» — фото cat-trendy');
    ok(home[0].src === 'img/photo/thumb/hero.webp' && !home[0].lazy, 'главная: праздничный стол — сразу, без отложенной загрузки');
    const seen = new Set(home.map(i => i.src));
    const ids = await page.evaluate(() => window.NYR_DATA.RECIPES.map(r => ({ id: r.id, title: r.title })));
    let cats = 0;
    const requested = [];
    page.on('request', r => { if (/img\/photo\//.test(r.url())) requested.push(r.url()); });
    for (const c of ['salads', 'hot', 'snacks', 'sweets']) {
      await page.goto(base + '#c/' + c);
      const l = await loadedAll(); l.forEach(i => seen.add(i.src));
      const art = await page.locator('.rcard-art svg').count();
      const n = await page.locator('.rcard').count();
      if (l.length === n && l.every(i => i.ok && /thumb/.test(i.src)) && art === 0) cats++;
    }
    ok(cats === 4, 'разделы: у всех блюд (и классических, и модных) маленькое фото (thumb), рисунков нет');
    await page.goto(base + '#c/trendy');
    const trList = await loadedAll(); trList.forEach(i => seen.add(i.src));
    ok(trList.length === 20 && trList.every(i => i.ok && /thumb/.test(i.src)) && await page.locator('.rcard-art svg').count() === 0, '«Модный стол»: 20 маленьких фото, рисунков нет');
    const noPhoto = [];
    const trIds = await page.evaluate(() => window.NYR_DATA.RECIPES.filter(r => r.cat === 'trendy').map(r => r.id));
    for (const r of ids) {
      await page.goto(base + '#r/' + r.id);
      const l = await loadedAll(); l.forEach(i => seen.add(i.src));
      const big = l.find(i => i.src === 'img/photo/full/' + r.id + '.webp');
      if (!big || !big.ok || big.alt !== r.title || big.lazy || big.w / big.h !== 4 / 3) noPhoto.push(r.id);
    }
    ok(noPhoto.length === 0, 'на каждой странице рецепта — своё фото 4:3, alt = название, без отложенной загрузки' + (noPhoto.length ? ' ' + noPhoto.join() : ''));
    await page.goto(base + '#menu');
    await page.click('[data-act="ready-menu"]');
    const menu = await loadedAll(); menu.forEach(i => seen.add(i.src));
    ok(menu.length === 5 && menu.every(i => i.ok && /thumb/.test(i.src)), 'меню: маленькие фото блюд');
    await page.evaluate(ids => { const s = JSON.parse(localStorage.getItem('nyr.v1')); s.menu = s.menu.concat(ids); localStorage.setItem('nyr.v1', JSON.stringify(s)); }, trIds);
    await page.goto(base + '#shop'); await page.goto(base + '#menu'); await page.reload();
    await loadedAll();
    ok(await page.locator('.mitem-art svg').count() === 0 && await page.locator('.mitem-art img').count() === 25, 'меню с модными: 25 фото, рисунков нет');
    const trReq = requested.filter(u => trIds.some(id => u.indexOf('/' + id + '.webp') >= 0) || u.indexOf('cat-trendy') >= 0);
    ok(trReq.length > 0, 'фото модных блюд и плашки запрашиваются (' + trReq.length + ')');
    await page.screenshot({ path: path.join(OUT, 'photos-menu.png') });
    // Все фото блюд и плашек (full + thumb) лежат на месте и открываются.
    const all = await page.evaluate(async names => {
      const res = [];
      for (const n of names) for (const sz of ['full', 'thumb']) {
        const im = new Image(); im.src = 'img/photo/' + sz + '/' + n + '.webp';
        await new Promise(r => { im.onload = im.onerror = r; });
        res.push({ n: sz + '/' + n, w: im.naturalWidth, h: im.naturalHeight });
      }
      return res;
    }, PHOTO_IDS);
    const wrong = all.filter(x => x.n.startsWith('full') ? !(x.w === 960 && x.h === 720) : !(x.w === 480 && x.h === 360));
    ok(all.length === 2 * PHOTO_IDS.length && wrong.length === 0, 'все ' + PHOTO_IDS.length + ' фото есть в двух размерах (960×720 и 480×360) и открываются' + (wrong.length ? ' ' + JSON.stringify(wrong.slice(0, 3)) : ''));
    ok(bad.length === 0 && errors.length === 0, 'ошибок загрузки и в консоли нет' + (bad.length || errors.length ? ' ' + JSON.stringify(bad.concat(errors).slice(0, 3)) : ''));
    await ctx.close();
  }
  {
    // Фото запрещены — везде рисунки из art.js, без ошибок в коде.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
    await page.route('**/img/photo/**', r => r.abort());
    const check = async (hash, sel, n) => {
      await page.goto(base + hash);
      await page.evaluate(() => document.querySelectorAll('#app img.photo').forEach(i => { i.loading = 'eager'; }));
      await page.waitForFunction(() => !document.querySelector('#app img.photo'), null, { timeout: 5000 }).catch(() => {});
      return page.evaluate(([sel, n]) => document.querySelectorAll(sel).length === n && !document.querySelector('#app img.photo'), [sel, n]);
    };
    ok(await check('', '.hero-art svg, .tile-art svg, .feature-art svg', 6), 'без фото: на главной рисунки стола, плашки и разделов');
    ok(await check('#c/trendy', '.rcard-art svg', 20), 'без фото: в «Модном столе» рисунки блюд');
    ok(await check('#r/snack-tree', '.r-hero svg', 1), 'без фото: в модном рецепте рисунок блюда');
    ok(await check('#c/salads', '.rcard-art svg', 10), 'без фото: в разделе рисунки блюд');
    ok(await check('#r/olivier', '.r-hero svg', 1), 'без фото: в рецепте рисунок блюда');
    await page.goto(base + '#menu'); await page.click('[data-act="ready-menu"]');
    ok(await check('#menu', '.mitem-art svg', 5), 'без фото: в меню рисунки блюд');
    await layoutCheck(page, 'меню без фото');
    ok(jsErrors.length === 0, 'без фото — ошибок в коде нет' + (jsErrors.length ? ' ' + JSON.stringify(jsErrors) : ''));
    await page.close();
  }

  /* ---------- Фото шагов ---------- */
  console.log('\nФото шагов');
  for (const vp of [{ w: 390, h: 844, t: true }, { w: 320, h: 568, t: true }, { w: 844, h: 390, t: true }, { w: 1280, h: 800, t: false }]) {
    const name = vp.w + '×' + vp.h;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.t, isMobile: vp.t });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(base + '#r/olivier');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();
    const sp = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('.step-photo img')];
      imgs.forEach(i => { i.loading = 'eager'; });
      await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      return imgs.map(i => ({ src: i.getAttribute('src'), ok: i.naturalWidth === 480, alt: i.alt, lazy: i.getAttribute('loading') }));
    });
    ok(sp.length === 5 && sp.every((x, k) => x.ok && x.src === 'img/photo/steps/thumb/olivier-' + (k + 1) + '.webp' && x.alt.startsWith('Шаг ' + (k + 1) + ': ')), name + ': у оливье 5 фото шагов, грузятся, alt «Шаг N: …»');
    await layoutCheck(page, name + ' шаги с фото');
    // Нажатие на фото — открывает просмотр и не отмечает «Сделано».
    await page.locator('.step-photo').nth(1).click();
    await page.waitForFunction(() => { const i = document.querySelector('#viewer .viewer-img'); return i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
    const v1 = await page.evaluate(() => {
      const v = document.getElementById('viewer'), img = v.querySelector('.viewer-img');
      const ir = img.getBoundingClientRect(), tr = v.querySelector('.viewer-text').getBoundingClientRect();
      const btns = [...v.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect());
      return { open: !v.hidden, done: document.querySelectorAll('.step.done').length, count: v.querySelector('.viewer-count').textContent,
        src: img.getAttribute('src'), focusIn: v.contains(document.activeElement),
        noOverlap: tr.bottom <= ir.top || tr.top >= ir.bottom || tr.right <= ir.left || tr.left >= ir.right,
        inView: ir.top >= -1 && ir.bottom <= innerHeight + 1 && ir.width > 100, bigBtns: btns.every(b => b.height >= 48 && b.width >= 48 && b.bottom <= innerHeight + 1 && b.right <= innerWidth + 1) };
    });
    ok(v1.open && v1.done === 0 && v1.count === 'Шаг 2 из 5' && /steps\/full\/olivier-2/.test(v1.src) && v1.focusIn, name + ': нажатие на фото открывает крупно «Шаг 2 из 5» и не отмечает «Сделано»');
    ok(v1.noOverlap && v1.inView && v1.bigBtns, name + ': в просмотре фото целиком, текст не налезает, кнопки крупные и на экране' + (v1.noOverlap && v1.inView && v1.bigBtns ? '' : ' ' + JSON.stringify(v1)));
    if (vp.w === 390 || vp.w === 844) await page.screenshot({ path: path.join(OUT, 'viewer-' + vp.w + '.png') });
    // Стрелки.
    await page.click('#viewer .viewer-arrow[data-dir="1"]');
    ok((await page.textContent('#viewer .viewer-count')) === 'Шаг 3 из 5', name + ': стрелка › — следующий шаг');
    await page.keyboard.press('ArrowLeft');
    ok((await page.textContent('#viewer .viewer-count')) === 'Шаг 2 из 5', name + ': клавиша ← — предыдущий шаг');
    // Свайп влево — следующий.
    await page.evaluate(() => {
      const v = document.getElementById('viewer'), st = v.querySelector('.viewer-stage');
      const t = (x) => new Touch({ identifier: 1, target: st, clientX: x, clientY: 300 });
      st.dispatchEvent(new TouchEvent('touchstart', { touches: [t(300)], changedTouches: [t(300)], bubbles: true }));
      st.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(150)], bubbles: true, cancelable: true }));
    });
    ok((await page.textContent('#viewer .viewer-count')) === 'Шаг 3 из 5', name + ': свайп влево — следующий шаг');
    // Фокус держится внутри.
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.getElementById('viewer').contains(document.activeElement)), name + ': Tab не уводит из просмотра');
    // Escape закрывает, фокус — на фото шага, страница та же.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const c1 = await page.evaluate(() => ({ hidden: document.getElementById('viewer').hidden, hash: location.hash, focus: document.activeElement && document.activeElement.getAttribute('data-act') + ':' + document.activeElement.getAttribute('data-i'), done: document.querySelectorAll('.step.done').length }));
    ok(c1.hidden && c1.hash === '#r/olivier' && c1.focus === 'step-photo:2' && c1.done === 0, name + ': Escape закрывает, фокус на фото шага 3, рецепт на месте (' + c1.focus + ')');
    // Системная «назад» закрывает просмотр и остаётся на рецепте.
    await page.locator('.step-photo').nth(0).click();
    await page.goBack();
    await page.waitForTimeout(200);
    const c2 = await page.evaluate(() => ({ hidden: document.getElementById('viewer').hidden, hash: location.hash, title: document.querySelector('.page-title').textContent }));
    ok(c2.hidden && c2.hash === '#r/olivier' && c2.title === 'Оливье', name + ': «назад» закрывает просмотр и остаётся на рецепте');
    // Нажатие на фон закрывает; потом «назад» уводит с рецепта как обычно (лишних записей в истории нет).
    await page.locator('.step-photo').nth(4).click();
    await page.mouse.click(vp.w > vp.h ? 4 : Math.round(vp.w / 2), vp.w > vp.h ? Math.round(vp.h / 2) : 140);
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.getElementById('viewer').hidden), name + ': нажатие на фон закрывает');
    // Нажатие на текст шага — по-прежнему «Сделано».
    await page.locator('.step').nth(0).click();
    ok(await page.locator('.step.done').count() === 1 && await page.evaluate(() => document.getElementById('viewer').hidden), name + ': нажатие на текст шага отмечает «Сделано», просмотр не открывается');
    ok(errors.length === 0, name + ': ошибок нет' + (errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''));
    await ctx.close();
  }
  {
    // У всех рецептов фото шагов на странице: столько, сколько в данных, все грузятся, alt «Шаг N: …», крупно — свой файл.
    // Если фото шагов не загрузились — блока нет, ошибок нет.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
    const bad = [];
    let total = 0;
    for (const r of recipeData()) {
      const nums = stepNums(r);
      await page.goto(base + '#r/' + r.id);
      const sp = await page.evaluate(async () => {
        const imgs = [...document.querySelectorAll('.step-photo img')];
        imgs.forEach(i => { i.loading = 'eager'; });
        await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(res => { i.onload = i.onerror = res; })));
        return imgs.map(i => ({ src: i.getAttribute('src'), ok: i.naturalWidth === 480 && i.naturalHeight === 360, alt: i.alt }));
      });
      total += sp.length;
      if (!nums.length) { if (sp.length) bad.push(r.id + ': фото шагов без данных'); continue; }
      const good = sp.length === nums.length && sp.every((x, k) => x.ok && x.src === 'img/photo/steps/thumb/' + r.id + '-' + nums[k] + '.webp' && x.alt.startsWith('Шаг ' + nums[k] + ': '));
      if (!good) { bad.push(r.id + ' ' + sp.length + '/' + nums.length); continue; }
      // Крупно открывается последнее фото рецепта — из full, той же картинки.
      await page.locator('.step-photo').nth(nums.length - 1).click();
      await page.waitForFunction(() => { const i = document.querySelector('#viewer .viewer-img'); return i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
      const v = await page.evaluate(() => { const i = document.querySelector('#viewer .viewer-img'); return { src: i.getAttribute('src'), w: i.naturalWidth, count: document.querySelector('#viewer .viewer-count').textContent }; });
      if (v.src !== 'img/photo/steps/full/' + r.id + '-' + nums[nums.length - 1] + '.webp' || v.w !== 960 || v.count !== 'Шаг ' + nums.length + ' из ' + nums.length) bad.push(r.id + ' крупно ' + JSON.stringify(v));
      await page.keyboard.press('Escape');
    }
    ok(!bad.length && jsErrors.length === 0, 'фото шагов у всех рецептов: ' + total + ' шт на страницах, число как в данных, все грузятся, крупно — свой файл' + (bad.length ? ' плохо: ' + bad.join('; ') : '') + (jsErrors.length ? ' ' + JSON.stringify(jsErrors) : ''));
    await page.route('**/img/photo/steps/**', r => r.abort());
    await page.goto(base + '#r/olivier');
    await page.evaluate(() => document.querySelectorAll('.step-photo img').forEach(i => { i.loading = 'eager'; }));
    await page.waitForFunction(() => !document.querySelector('.step-photo'), null, { timeout: 5000 }).catch(() => {});
    const left = await page.evaluate(() => ({ photos: document.querySelectorAll('.step-photo').length, cards: document.querySelectorAll('.step-li.has-photo').length, steps: document.querySelectorAll('.step').length }));
    ok(left.photos === 0 && left.cards === 0 && left.steps === 5 && jsErrors.length === 0, 'фото шагов не загрузились — блоков фото нет, шаги на месте, ошибок нет');
    await page.close();
  }

  /* ---------- Листание главного фото (у всех 40 рецептов) ---------- */
  console.log('\nЛистание главного фото');
  {
    // Файлы: у рецептов с gallery — кадры 2…N в двух размерах, 960×720 до 150 КБ и 480×360 до 40 КБ.
    const R = recipeData(), withGal = R.filter(r => r.gallery);
    const notFive = R.filter(r => r.gallery !== 5).map(r => r.id + ':' + r.gallery);
    ok(R.length === 40 && withGal.length === 40 && !notFive.length, 'листание у всех 40 рецептов, по 5 кадров' + (notFive.length ? ' ' + notFive.join() : ''));
    const bad = [], sizes = { full: [], thumb: [] };
    for (const r of withGal) for (let n = 2; n <= r.gallery; n++) for (const [sz, lim] of [['full', 150], ['thumb', 40]]) {
      const f = path.join(ROOT, 'img/photo/gallery', sz, r.id + '-' + n + '.webp');
      if (!fs.existsSync(f)) { bad.push('нет ' + sz + '/' + r.id + '-' + n); continue; }
      const s = fs.statSync(f).size; sizes[sz].push(s);
      if (s > lim * 1024) bad.push(sz + '/' + r.id + '-' + n + ' ' + (s / 1024).toFixed(0) + ' КБ');
    }
    console.log('Кадры листания: full самое большое ' + (Math.max(...sizes.full) / 1024).toFixed(1) + ' КБ, thumb ' + (Math.max(...sizes.thumb) / 1024).toFixed(1) + ' КБ');
    ok(!bad.length, 'кадры листания на месте: full ≤ 150 КБ, thumb ≤ 40 КБ' + (bad.length ? ' ' + bad.join('; ') : ''));
  }
  const galInfo = page => page.evaluate(() => {
    const root = document.querySelector('.r-gal');
    if (!root) return null;
    const view = root.querySelector('.gal-view').getBoundingClientRect();
    const slides = [...root.querySelectorAll('.gal-slide')];
    // Какой кадр сейчас виден целиком в окне ленты.
    const shown = slides.find(s => Math.abs(s.getBoundingClientRect().left - view.left) < 2);
    return { n: slides.length, frames: slides.map(s => +s.dataset.n), count: root.querySelector('.gal-count').textContent,
      dots: root.querySelectorAll('.gal-dot').length, on: [...root.querySelectorAll('.gal-dot')].findIndex(d => d.classList.contains('on')),
      shown: shown ? +shown.dataset.n : 0, srcs: slides.map(s => s.querySelector('img').getAttribute('src')),
      prevOff: root.querySelector('.gal-prev').disabled, nextOff: root.querySelector('.gal-next').disabled,
      arrows: [...root.querySelectorAll('.gal-arrow')].map(a => { const b = a.getBoundingClientRect(); return { w: b.width, h: b.height, inside: b.left >= view.left && b.right <= view.right && b.top >= view.top && b.bottom <= view.bottom }; }),
      viewW: view.width };
  });
  const settle = page => page.waitForTimeout(450); // доводка ленты — 0,35 с
  const SHOTS = process.env.GAL_SHOTS || OUT;
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const vp of [{ w: 390, h: 844, t: true }, { w: 320, h: 568, t: true }, { w: 844, h: 390, t: true }, { w: 1280, h: 800, t: false }]) {
    const name = vp.w + '×' + vp.h;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.t, isMobile: vp.t });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    const req = []; page.on('request', r => { const m = r.url().match(/img\/photo\/(?:gallery\/)?(full|thumb)\/(olivier|buche)(-\d)?\.webp/); if (m) req.push(m[1] + ':' + m[2] + (m[3] || '')); });
    await page.goto(base + '#r/olivier');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    req.length = 0;
    await page.reload();
    await page.waitForFunction(() => { const i = document.querySelectorAll('.gal-slide img')[1]; return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
    let g = await galInfo(page);
    ok(g && g.n === 5 && g.dots === 5 && g.count === '1 из 5' && g.shown === 1 && g.on === 0 && g.prevOff && !g.nextOff, name + ': у оливье лента из 5 кадров, «1 из 5», 5 точек, виден главный кадр' + (g ? '' : ' ленты нет'));
    ok(g && g.srcs[0] === 'img/photo/full/olivier.webp' && g.srcs[1] === 'img/photo/gallery/full/olivier-2.webp' && g.srcs.slice(2).every(s => s === null), name + ': загружены кадр 1 и кадр 2, кадры 3–5 ещё нет ' + JSON.stringify(req));
    ok(g && g.arrows.every(a => a.w >= 44 && a.h >= 44 && a.inside), name + ': стрелки ‹ › по краям фото, не меньше 44 px');
    await layoutCheck(page, name + ' рецепт с листанием');
    await page.screenshot({ path: path.join(SHOTS, 'gal-' + vp.w + 'x' + vp.h + '-frame1.png') });
    // Стрелки и клавиши.
    await page.click('.gal-next'); await settle(page);
    g = await galInfo(page);
    ok(g.count === '2 из 5' && g.shown === 2 && g.on === 1 && !g.prevOff, name + ': стрелка › — кадр 2, «2 из 5»');
    ok(g.srcs[2] === 'img/photo/gallery/full/olivier-3.webp' && g.srcs[4] === null, name + ': при приближении подгружается кадр 3, кадр 5 ещё нет');
    await page.keyboard.press('ArrowRight'); await settle(page);
    g = await galInfo(page);
    ok(g.count === '3 из 5' && g.shown === 3, name + ': клавиша → — кадр 3');
    await page.keyboard.press('ArrowLeft'); await settle(page);
    ok((await galInfo(page)).count === '2 из 5', name + ': клавиша ← — кадр 2');
    await page.click('.gal-prev'); await settle(page);
    ok((await galInfo(page)).count === '1 из 5', name + ': стрелка ‹ — кадр 1');
    // Палец (или мышь на компьютере): вбок — листает, вверх-вниз — прокручивает страницу.
    const box = await page.locator('.gal-view').boundingBox();
    const cy = Math.max(box.y + 20, Math.min(box.y + box.height / 2, vp.h - 20));
    const cdp = vp.t ? await ctx.newCDPSession(page) : null;
    const swipe = async (x0, y0, x1, y1) => {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
        for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 12, y: y0 + (y1 - y0) * i / 12 }] }); await page.waitForTimeout(16); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(x0, y0); await page.mouse.down();
        for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + (x1 - x0) * i / 12, y0 + (y1 - y0) * i / 12); await page.waitForTimeout(16); }
        await page.mouse.up();
      }
      await settle(page);
    };
    await swipe(box.x + box.width * 0.8, cy, box.x + box.width * 0.2, cy + 6);
    g = await galInfo(page);
    ok(g.count === '2 из 5' && g.shown === 2 && await page.evaluate(() => document.getElementById('viewer') === null || document.getElementById('viewer').hidden), name + ': ' + (vp.t ? 'свайп' : 'перетаскивание мышью') + ' влево — кадр 2, крупно не открылось');
    await swipe(box.x + box.width * 0.75, cy, box.x + box.width * 0.25, cy);
    await swipe(box.x + box.width * 0.75, cy, box.x + box.width * 0.25, cy);
    ok((await galInfo(page)).count === '4 из 5', name + ': ещё два свайпа — кадр 4');
    await page.screenshot({ path: path.join(SHOTS, 'gal-' + vp.w + 'x' + vp.h + '-frame4.png') });
    await swipe(box.x + box.width * 0.25, cy, box.x + box.width * 0.75, cy);
    ok((await galInfo(page)).count === '3 из 5', name + ': свайп вправо — кадр 3');
    await swipe(box.x + box.width * 0.55, cy, box.x + box.width * 0.45, cy);
    ok((await galInfo(page)).shown === 3, name + ': короткий медленный сдвиг — лента возвращается на тот же кадр');
    if (vp.t) {
      const y0 = await page.evaluate(() => scrollY);
      const vy0 = Math.min(box.y + box.height - 10, vp.h - 20), vy1 = Math.max(10, vy0 - 220);
      await swipe(box.x + box.width / 2, vy0, box.x + box.width / 2 + 12, vy1);
      const after = await page.evaluate(() => scrollY), g2 = await galInfo(page);
      ok(after > y0 + 50 && g2.count === '3 из 5' && g2.shown === 3, name + ': свайп вверх по фото прокручивает страницу (' + y0 + ' → ' + after + '), лента не листается');
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150);
    }
    // Нажатие на фото — крупно текущий кадр; внутри листаются кадры ленты с подписями.
    await page.waitForTimeout(450);
    await page.locator('.gal-slide[data-n="3"]').click();
    await page.waitForFunction(() => { const i = document.querySelector('#viewer .viewer-img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
    const vw = () => page.evaluate(() => { const v = document.getElementById('viewer'); return { open: !v.hidden, count: v.querySelector('.viewer-count').textContent, text: v.querySelector('.viewer-text').textContent, src: v.querySelector('.viewer-img').getAttribute('src'), w: v.querySelector('.viewer-img').naturalWidth }; });
    let v = await vw();
    ok(v.open && v.count === '3 из 5' && v.text === 'Порция' && v.src === 'img/photo/gallery/full/olivier-3.webp' && v.w === 960, name + ': нажатие на фото — крупно кадр 3 «Порция» ' + JSON.stringify(v));
    await page.click('#viewer .viewer-arrow[data-dir="1"]');
    v = await vw();
    ok(v.count === '4 из 5' && v.text === 'За столом', name + ': в крупном просмотре › — «За столом»');
    await page.waitForFunction(() => { const i = document.querySelector('#viewer .viewer-img'); return i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: path.join(SHOTS, 'gal-' + vp.w + 'x' + vp.h + '-viewer.png') });
    await page.keyboard.press('ArrowRight');
    v = await vw();
    ok(v.count === '5 из 5' && v.text === 'Подача', name + ': клавиша → — «Подача»');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    v = await vw();
    ok(v.count === '1 из 5' && v.text === 'Готовое блюдо' && v.src === 'img/photo/full/olivier.webp', name + ': кадр 1 крупно — главное фото, «Готовое блюдо»');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    g = await galInfo(page);
    const foc = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('gal-slide') && document.activeElement.dataset.n);
    ok(g.count === '2 из 5' && g.shown === 2 && foc === '2' && await page.evaluate(() => location.hash) === '#r/olivier', name + ': Escape — лента на последнем кадре из просмотра (2), фокус на нём');
    // Шаги и фото шагов работают как раньше.
    await page.locator('.step-photo').nth(0).click();
    ok((await vw()).count === 'Шаг 1 из 5', name + ': фото шага открывается как раньше («Шаг 1 из 5»)');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.locator('.step').nth(0).click();
    g = await galInfo(page);
    ok(await page.locator('.step.done').count() === 1 && g.count === '2 из 5', name + ': отметка шага не сбрасывает ленту');
    // Полено: 5 кадров, до конца — стрелка › исчезает.
    await page.goto(base + '#r/buche');
    g = await galInfo(page);
    ok(g && g.n === 5 && g.count === '1 из 5' && g.srcs[0] === 'img/photo/full/buche.webp', name + ': у полена лента из 5 кадров');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await settle(page);
    g = await galInfo(page);
    ok(g.count === '5 из 5' && g.shown === 5 && g.nextOff && g.srcs.every(Boolean), name + ': полено листается до 5 из 5, дальше не едет, все кадры загружены');
    ok(errors.length === 0, name + ': ошибок в консоли нет' + (errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''));
    await ctx.close();
  }
  {
    // У всех 40 рецептов на странице — лента из 5 кадров: «1 из 5», 5 точек, кадр 1 и кадр 2 загрузились.
    // В списках и меню — только главное фото.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = watchErrors(page);
    let galReq = []; page.on('request', r => { if (/img\/photo\/gallery\//.test(r.url())) galReq.push(r.url()); });
    const R = recipeData(), bad = [];
    await page.goto(base);
    for (const r of R) {
      await page.goto(base + '#r/' + r.id);
      await page.waitForFunction(id => { const s = document.querySelector('.gal-slide[data-n="2"] img'); return s && s.complete && s.naturalWidth > 0 && s.getAttribute('src').indexOf(id + '-2') > 0; }, r.id, { timeout: 5000 }).catch(() => {});
      const g = await galInfo(page);
      if (!g || g.n !== 5 || g.dots !== 5 || g.count !== '1 из 5' || g.srcs[0] !== 'img/photo/full/' + r.id + '.webp' || g.srcs[1] !== 'img/photo/gallery/full/' + r.id + '-2.webp') bad.push(r.id + ' ' + JSON.stringify(g && { n: g.n, count: g.count, srcs: g.srcs.slice(0, 2) }));
    }
    ok(R.length === 40 && !bad.length, 'у всех ' + R.length + ' рецептов на странице лента из 5 кадров, «1 из 5», кадры 1 и 2 загружены' + (bad.length ? ' ' + bad.join('; ') : ''));
    galReq = [];
    for (const h of ['#c/salads', '#c/sweets', '#c/trendy']) await page.goto(base + h);
    await page.goto(base + '#menu');
    await page.evaluate(() => { const s = { menu: ['olivier', 'buche'], guests: 6 }; localStorage.setItem('nyr.v1', JSON.stringify(s)); });
    await page.reload();
    const srcs = await page.evaluate(() => [...document.querySelectorAll('.mitem-art img')].map(i => i.getAttribute('src')));
    ok(srcs.join() === 'img/photo/thumb/olivier.webp,img/photo/thumb/buche.webp' && !galReq.length, 'в разделах и меню — только главное фото, кадры листания не грузятся');
    ok(errors.length === 0, 'ошибок нет' + (errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''));
    await page.close();
  }
  {
    // Кадр не загрузился — выпадает из ленты без ошибок; не загрузилось ни одного доп. кадра — одно главное фото.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = watchErrors(page);
    await page.route('**/img/photo/gallery/*/olivier-3.webp', r => r.abort());
    await page.goto(base + '#r/olivier');
    await page.click('.gal-next'); await settle(page);
    await page.waitForTimeout(300);
    let g = await galInfo(page);
    ok(g.n === 4 && g.frames.join() === '1,2,4,5' && g.count === '2 из 4' && g.dots === 4, 'кадр 3 не загрузился — выпал: 4 кадра, «2 из 4» ' + JSON.stringify(g.frames));
    await page.click('.gal-next'); await settle(page);
    g = await galInfo(page);
    ok(g.count === '3 из 4' && g.shown === 4, 'после выпавшего — сразу кадр 4');
    await page.locator('.gal-slide[data-n="4"]').click();
    await page.keyboard.press('ArrowLeft');
    ok(await page.evaluate(() => document.querySelector('#viewer .viewer-text').textContent) === 'Крупно', 'в крупном просмотре выпавшего кадра тоже нет');
    await page.keyboard.press('Escape');
    await page.unroute('**/img/photo/gallery/*/olivier-3.webp');
    await page.route('**/img/photo/gallery/**', r => r.abort());
    await page.goto(base + '#r/buche');
    for (let i = 0; i < 5; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80); }
    await page.waitForFunction(() => document.querySelectorAll('.gal-slide').length === 1, null, { timeout: 5000 }).catch(() => {});
    g = await galInfo(page);
    const vis = await page.evaluate(() => [...document.querySelectorAll('.gal-arrow, .gal-bar')].filter(e => e.offsetParent).length);
    ok(g && g.n === 1 && g.shown === 1 && vis === 0, 'доп. кадры не загрузились — остаётся главное фото, без точек и стрелок');
    ok(errors.filter(e => !/net::ERR_FAILED/.test(e)).length === 0, 'ошибок в коде нет');
    await page.close();
    // Новая вкладка (без памяти браузера): не загрузилось ни одного кадра, даже главного.
    const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const e2 = watchErrors(p2);
    await p2.route(/img\/photo\/(gallery\/)?(full|thumb)\/buche(-\d)?\.webp/, r => r.abort());
    await p2.goto(base + '#r/buche');
    await p2.waitForFunction(() => !document.querySelector('.r-gal'), null, { timeout: 5000 }).catch(() => {});
    ok(await p2.locator('.r-hero svg').count() === 1 && await p2.locator('.r-gal').count() === 0, 'не загрузилось ничего — рисунок, как у рецептов без фото');
    ok(e2.filter(e => !/net::ERR_FAILED/.test(e)).length === 0, 'ошибок в коде нет');
    await p2.close();
  }

  /* ---------- А13: узкий экран 320 px с полным меню ---------- */
  console.log('\nЭкран 320×568 с полным меню (А13)');
  {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(base);
    await page.evaluate(ids => { localStorage.setItem('nyr.v1', JSON.stringify({ menu: ids, guests: 12 })); }, await page.evaluate(() => window.NYR_DATA.RECIPES.map(r => r.id)));
    await page.reload();
    await layoutCheck(page, '320 главная');
    await page.screenshot({ path: path.join(OUT, 'w320-home.png') });
    const fb320 = await page.evaluate(() => { const r = document.querySelector('[data-testid="feature-trendy"]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; });
    ok(fb320.top < fb320.h * 1.6, '320: плашка «Модный стол» сразу при прокрутке (верх ' + Math.round(fb320.top) + ' при высоте экрана ' + fb320.h + ')');
    for (const h of ['#c/salads', '#c/hot', '#c/snacks', '#c/sweets', '#c/trendy', '#r/napoleon', '#r/chicken', '#r/holodets', '#r/eggs', '#r/sharlotka', '#r/buche', '#r/mulled', '#r/olivier-rolls', '#r/ginger-house', '#menu', '#shop']) {
      await page.goto(base + h);
      await layoutCheck(page, '320 ' + h);
    }
    await page.screenshot({ path: path.join(OUT, 'w320-shop.png'), fullPage: true });
    const hdr = await page.evaluate(() => { const t = document.getElementById('hdr-title'); return t.scrollHeight <= t.clientHeight + 1; });
    await page.goto(base + '#r/chicken');
    const hdr2 = await page.evaluate(() => { const t = document.getElementById('hdr-title'); return t.scrollHeight <= t.clientHeight + 1; });
    ok(hdr && hdr2, 'название в шапке целиком (в 2 строки)');
    ok(errors.length === 0, 'без ошибок' + (errors.length ? ' ' + JSON.stringify(errors) : ''));
    await ctx.close();
  }

  /* ---------- А15: окно «Скопируйте текст» ---------- */
  console.log('\nОкно «Скопируйте текст» (А15)');
  for (const vp of [{ width: 640, height: 360 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      document.execCommand = () => false;
    });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(base + '#r/napoleon');
    await page.click('[data-act="share-recipe"]');
    ok(await page.locator('#copy-modal').isVisible(), vp.width + '×' + vp.height + ': окно открылось');
    const fit = await page.evaluate(() => { const b = document.querySelector('.modal-box').getBoundingClientRect(); const btn = document.getElementById('copy-close').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 1 && btn.bottom <= innerHeight + 1; });
    ok(fit, vp.width + '×' + vp.height + ': окно и кнопка «Готово» умещаются');
    if (vp.height === 390) await page.screenshot({ path: path.join(OUT, 'modal-844.png') });
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.getElementById('copy-modal').contains(document.activeElement)), 'фокус держится в окне');
    await page.keyboard.press('Escape');
    ok(!(await page.locator('#copy-modal').isVisible()), 'Escape закрывает');
    await page.click('[data-act="share-recipe"]');
    await page.mouse.click(3, 3);
    ok(!(await page.locator('#copy-modal').isVisible()), 'клик по фону закрывает');
    ok(errors.length === 0, 'без ошибок' + (errors.length ? ' ' + JSON.stringify(errors) : ''));
    await ctx.close();
  }

  /* ---------- А16: битое сохранение ---------- */
  console.log('\nБитое сохранение (А16)');
  {
    const cases = [
      { steps: { olivier: {} } },
      { menu: ['__proto__', 'constructor', 'toString', 'olivier'] },
      { menu: 'olivier', guests: 'много', steps: [], bought: { 'Яйца': true, '__proto__': { pcs: 5 } } },
      { steps: { olivier: [0, 'x', 99, -1], toString: [1] }, bought: { 'Яйца': { pcs: 'a' } } },
      'просто строка', null, [1, 2]
    ];
    for (const c of cases) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = watchErrors(page);
      await page.goto(base);
      await page.evaluate(c => localStorage.setItem('nyr.v1', JSON.stringify(c)), c);
      for (const h of ['#r/olivier', '#menu', '#shop', '']) {
        await page.goto(base + h);
        await page.reload();
      }
      await page.goto(base + '#shop');
      await page.reload();
      const okView = await page.locator('.page-title').count() === 1;
      ok(okView && errors.length === 0, 'сохранение ' + JSON.stringify(c).slice(0, 60) + ' — экраны работают' + (errors.length ? ' ' + JSON.stringify(errors.slice(0, 2)) : ''));
      await page.close();
    }
  }

  /* ---------- Без localStorage ---------- */
  console.log('\nБез хранилища');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(base + '#menu');
    await page.click('[data-act="ready-menu"]');
    ok(await page.locator('.mitem').count() === 5, 'приложение работает, если хранилище запрещено');
    ok(errors.length === 0, 'без ошибок' + (errors.length ? ' ' + JSON.stringify(errors) : ''));
    await ctx.close();
  }

  /* ---------- Открытие как файл ---------- */
  console.log('\nОткрытие как файл (file://)');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = watchErrors(page);
    await page.goto('file://' + path.join(ROOT, 'index.html') + '#r/duck');
    ok((await page.locator('.page-title').textContent()) === 'Утка с яблоками', 'файл открывается, ссылка #r/duck работает');
    await page.click('#hdr-back');
    ok((await page.locator('.rcard').count()) === 8, '«Назад» из рецепта по прямой ссылке → раздел');
    ok(errors.length === 0, 'без ошибок' + (errors.length ? ' ' + JSON.stringify(errors) : ''));
    await page.close();
  }

  await browser.close();
  if (srv) srv.close();
  console.log('\n' + (failures ? 'ПРОВАЛЕНО проверок: ' + failures : 'Все проверки пройдены') + '. Скриншоты: ' + OUT);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
