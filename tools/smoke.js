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
  const files = ['index.html', 'css/app.css', 'js/recipes.js', 'js/art.js', 'js/photo.js', 'js/app.js'];
  return files.reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);
}
// Фото считаем отдельно: они грузятся только на странице своего рецепта (маленькая — в списке и меню).
const PHOTO_FILES = ['plate.webp', 'ingredients.webp', 'done.webp', 'thumb.webp'];
function photoSize(dir) {
  return PHOTO_FILES.reduce((s, f) => s + fs.statSync(path.join(ROOT, dir, f)).size, 0);
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
      if (el.closest('svg') || el.tagName === 'TEXTAREA') return;
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
  ok(size < 300 * 1024, 'весь размер меньше 300 КБ (без фото)');
  const olivierPhoto = photoSize('img/photo/olivier');
  console.log('Фото оливье (тарелка, продукты, готовое, маленькая): ' + (olivierPhoto / 1024).toFixed(1) + ' КБ');
  ok(olivierPhoto < 250 * 1024, 'фото одного рецепта меньше 250 КБ');

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
      D.RECIPES.filter(r => r.photo).forEach(r => {
        const ph = r.photo;
        if (!/^img\/photo\/[a-z-]+\/$/.test(ph.dir)) bad.push(r.id + ': photo.dir ' + ph.dir);
        (ph.labels || []).forEach(l => {
          if (!r.ingredients.some(i => i.name.toLowerCase().startsWith(l.text.toLowerCase().slice(0, 5)))) bad.push(r.id + ': подпись «' + l.text + '» не из ингредиентов');
          if (!(l.x >= 0 && l.x <= 100 && l.y >= 0 && l.y <= 100) || ['left', 'right'].indexOf(l.side) < 0) bad.push(r.id + ': подпись ' + l.text + ' — место');
        });
      });
      return { n: D.RECIPES.length, perCat, bad, unique: new Set(ids).size === ids.length, photos: D.RECIPES.filter(r => r.photo).map(r => r.id) };
    });
    ok(d.n === 20, 'рецептов 20 (' + d.n + ')');
    ok(Object.values(d.perCat).every(v => v === 5) && Object.keys(d.perCat).length === 4, 'по 5 в каждом разделе ' + JSON.stringify(d.perCat));
    ok(d.unique, 'id рецептов не повторяются');
    ok(d.bad.length === 0, 'шаги 4–8, совет, картинка, единицы и отделы на месте; подписи фото — из ингредиентов' + (d.bad.length ? ' ' + JSON.stringify(d.bad) : ''));
    ok(d.photos.join() === 'olivier', 'фото только у оливье (' + d.photos.join() + ')');
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

    for (const cat of ['salads', 'hot', 'snacks', 'sweets']) {
      await page.goto(base + '#c/' + cat);
      ok(await page.locator('.rcard').count() === 5, 'раздел ' + cat + ': 5 рецептов');
      await layoutCheck(page, 'раздел ' + cat);
      if (cat === 'salads') await shot('cat-salads');
    }
    const ids = await page.evaluate(() => window.NYR_DATA.RECIPES.map(r => r.id));
    let allOpen = true;
    for (const id of ids) {
      await page.goto(base + '#r/' + id);
      const title = await page.locator('.page-title').textContent();
      const expect = await page.evaluate(id => window.NYR_DATA.RECIPES.find(r => r.id === id).title, id);
      if (title !== expect) { allOpen = false; ok(false, 'рецепт ' + id + ' открывается по ссылке'); }
      await layoutCheck(page, 'рецепт ' + id);
    }
    ok(allOpen, 'все 20 рецептов открываются по прямой ссылке #r/…');
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
    ok(await page.locator('.tag').count() === 1, 'в разделе отмечено «В моём меню»');
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

  /* ---------- Фото-сцена оливье (проба) ---------- */
  console.log('\nФото-сцена оливье');
  for (const vp of [{ w: 390, h: 844, t: true }, { w: 320, h: 568, t: true }, { w: 844, h: 390, t: true }, { w: 1280, h: 800, t: false }]) {
    const name = vp.w + '×' + vp.h;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.t, isMobile: vp.t });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    const photoReq = [];
    page.on('request', r => { if (/img\/photo\//.test(r.url())) photoReq.push(r.url().split('/img/photo/')[1]); });
    if (vp.w === 390) {
      await page.goto(base); await page.goto(base + '#r/shuba'); await page.waitForTimeout(200);
      ok(photoReq.length === 0, name + ': на главной и в других рецептах фото не грузятся (' + photoReq.join() + ')');
      await page.goto(base + '#c/salads'); await page.waitForTimeout(300);
      ok(photoReq.join() === 'olivier/thumb.webp', name + ': в списке салатов — только маленькое фото оливье (' + photoReq.join() + ')');
      photoReq.length = 0;
    }
    await page.goto(base + '#r/olivier');
    await page.waitForSelector('.ph-ready', { timeout: 5000 });
    await page.waitForTimeout(450);
    if (vp.w === 390) ok(['olivier/plate.webp', 'olivier/ingredients.webp', 'olivier/done.webp'].every(f => photoReq.indexOf(f) >= 0) && photoReq.indexOf('olivier/fly.webp') < 0, name + ': на оливье грузятся тарелка, продукты, готовое (' + photoReq.join() + ')');
    await layoutCheck(page, name + ' сцена оливье');
    const g = await page.evaluate(() => {
      const st = document.querySelector('.ph-stage').getBoundingClientRect(), hdr = document.querySelector('.hdr').offsetHeight;
      const L = [...document.querySelectorAll('.ph-lbl')].map(e => e.getBoundingClientRect());
      let overlap = 0, out = 0;
      L.forEach((a, i) => { if (a.left < st.left - 0.5 || a.right > st.right + 0.5 || a.top < st.top - 0.5 || a.bottom > st.bottom + 0.5) out++; L.slice(i + 1).forEach(b => { if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlap++; }); });
      const fsz = Math.min(...[...document.querySelectorAll('.ph-lbl')].map(e => parseFloat(getComputedStyle(e).fontSize)));
      const btn = [...document.querySelectorAll('.ph-btn')].find(b => b.getBoundingClientRect().width > 0);
      return { w: st.width, h: st.height, fit: st.height <= innerHeight - hdr, labels: L.length, overlap, out, fsz, svgOff: getComputedStyle(document.querySelector('.ph-svg')).display === 'none', btn: btn && btn.textContent };
    });
    ok(g.labels === 7 && g.overlap === 0 && g.out === 0 && g.fsz >= 16, name + ': 7 подписей, не наезжают, не обрезаны, шрифт ' + g.fsz + 'px' + (g.overlap || g.out ? ' (наезжают ' + g.overlap + ', за краем ' + g.out + ')' : ''));
    ok(g.fit, name + ': сцена не выше экрана (' + Math.round(g.w) + '×' + Math.round(g.h) + ')');
    if (vp.w >= 900) ok(g.w <= 520, name + ': на компьютере сцена не шире 520 px (' + Math.round(g.w) + ')');
    ok(g.svgOff && /Смешать/.test(g.btn || ''), name + ': фото показано вместо рисунка, кнопка «Смешать»');
    // Прокрутка: до конца — салат готов, обратно — продукты.
    const st = await page.evaluate(() => window.NYR_PHOTO.state());
    await page.evaluate(st => window.scrollTo(0, st.startY + st.dist * 0.5), st); await page.waitForTimeout(150);
    const mid = await page.evaluate(() => ({ p: window.NYR_PHOTO.state().p, top: document.querySelector('.ph-stage').getBoundingClientRect().top, hdr: document.querySelector('.hdr').offsetHeight }));
    ok(mid.p > 0.4 && mid.p < 0.6 && Math.abs(mid.top - mid.hdr) <= 1, name + ': на середине прокрутки сцена прилипла к верху, p=' + mid.p.toFixed(2));
    await page.evaluate(st => window.scrollTo(0, st.startY + st.dist + 5), st); await page.waitForTimeout(150);
    const end = await page.evaluate(() => ({ p: window.NYR_PHOTO.state().p, done: +getComputedStyle(document.querySelector('.ph-done')).opacity, lbl: +getComputedStyle(document.querySelector('.ph-labels')).opacity, btn: [...document.querySelectorAll('.ph-btn')].find(b => b.getBoundingClientRect().width > 0).textContent }));
    ok(end.p === 1 && end.done === 1 && end.lbl === 0 && /Ещё раз/.test(end.btn), name + ': прокрутили — салат в тарелке, подписи скрыты, кнопка «Ещё раз»');
    if (vp.w === 390) await page.screenshot({ path: path.join(OUT, 'olivier-done.png') });
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
    const back = await page.evaluate(() => ({ p: window.NYR_PHOTO.state().p, done: +getComputedStyle(document.querySelector('.ph-done')).opacity }));
    ok(back.p === 0 && back.done === 0, name + ': прокрутили обратно — снова продукты');
    if (vp.w === 390) await page.screenshot({ path: path.join(OUT, 'olivier-start.png') });
    // Кнопка: «Смешать» за ~1,8 с, потом «Ещё раз».
    await page.locator('.ph-btn:visible').click();
    await page.waitForTimeout(900);
    const half = await page.evaluate(() => window.NYR_PHOTO.state().p);
    await page.waitForTimeout(1200);
    const full = await page.evaluate(() => window.NYR_PHOTO.state().p);
    ok(half > 0.3 && half < 0.75 && full === 1, name + ': «Смешать» — салат готов за ~1,8 с (через 0,9 с p=' + half.toFixed(2) + ')');
    await page.locator('.ph-btn:visible').click();
    await page.waitForTimeout(300);
    const again = await page.evaluate(() => window.NYR_PHOTO.state().p);
    await page.waitForTimeout(2200);
    ok(again < 0.6 && (await page.evaluate(() => window.NYR_PHOTO.state().p)) === 1, name + ': «Ещё раз» — продукты снова падают');
    if (vp.w === 390) {
      // Перерисовка страницы (порции +) не перезагружает сцену.
      await page.evaluate(() => { window.__ph = document.querySelector('.ph'); });
      await page.click('[data-act="por+"]');
      ok(await page.evaluate(() => document.querySelector('.ph') === window.__ph && window.NYR_PHOTO.state().p === 1), name + ': «+ порция» не сбрасывает сцену');
    }
    ok(errors.length === 0, name + ': ошибок нет' + (errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''));
    await ctx.close();
  }
  {
    // Фото не загрузились — остаётся рисунок, без ошибок в коде.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
    await page.route('**/img/photo/**', r => r.abort());
    await page.goto(base + '#r/olivier'); await page.waitForTimeout(600);
    const f = await page.evaluate(() => ({ failed: !!document.querySelector('.ph-failed'), svg: getComputedStyle(document.querySelector('.ph-svg')).display !== 'none', btn: document.querySelector('.ph-ctl-pin').getBoundingClientRect().height }));
    ok(f.failed && f.svg && f.btn === 0 && jsErrors.length === 0, 'фото не загрузились — рисунок оливье, без кнопки и без ошибок');
    await page.goto(base + '#c/salads'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => !!document.querySelector('a[href="#r/olivier"] .rcard-art svg')), 'в списке салатов без фото — рисунок');
    await page.close();
  }
  {
    // «Уменьшить движение» в настройках телефона: без падения, кнопка просто меняет кадр.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(base + '#r/olivier'); await page.waitForSelector('.ph-ready');
    const pos = await page.evaluate(() => getComputedStyle(document.querySelector('.ph-pin')).position);
    await page.evaluate(() => window.scrollTo(0, 300)); await page.waitForTimeout(150);
    const p1 = await page.evaluate(() => window.NYR_PHOTO.state().p);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.ph-btn:visible').click(); await page.waitForTimeout(50);
    const p2 = await page.evaluate(() => ({ p: window.NYR_PHOTO.state().p, done: document.querySelector('.ph-done').style.opacity, tr: document.querySelector('.ph-band').style.transform }));
    ok(pos !== 'sticky' && p1 === 0 && p2.p === 1 && p2.done === '1' && p2.tr === 'none', 'без движения: не прилипает, прокрутка не двигает, кнопка сразу показывает салат');
    ok(errors.length === 0, 'без ошибок' + (errors.length ? ' ' + JSON.stringify(errors) : ''));
    await ctx.close();
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
    for (const h of ['#c/salads', '#c/hot', '#c/snacks', '#c/sweets', '#r/napoleon', '#r/chicken', '#r/holodets', '#r/eggs', '#r/sharlotka', '#menu', '#shop']) {
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
    ok((await page.locator('.rcard').count()) === 5, '«Назад» из рецепта по прямой ссылке → раздел');
    ok(errors.length === 0, 'без ошибок' + (errors.length ? ' ' + JSON.stringify(errors) : ''));
    await page.close();
  }

  await browser.close();
  if (srv) srv.close();
  console.log('\n' + (failures ? 'ПРОВАЛЕНО проверок: ' + failures : 'Все проверки пройдены') + '. Скриншоты: ' + OUT);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
