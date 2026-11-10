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
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
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
    document.querySelectorAll('button, a.btn, a.big-btn, a.tile, a.rcard, .chk, .hdr-back').forEach(el => {
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
  ok(size < 300 * 1024, 'весь размер меньше 300 КБ');

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
      return { n: D.RECIPES.length, perCat, bad, unique: new Set(ids).size === ids.length };
    });
    ok(d.n === 20, 'рецептов 20 (' + d.n + ')');
    ok(Object.values(d.perCat).every(v => v === 5) && Object.keys(d.perCat).length === 4, 'по 5 в каждом разделе ' + JSON.stringify(d.perCat));
    ok(d.unique, 'id рецептов не повторяются');
    ok(d.bad.length === 0, 'шаги 4–8, совет, картинка, единицы и отделы на месте' + (d.bad.length ? ' ' + JSON.stringify(d.bad) : ''));
    await page.close();
  }

  /* ---------- Математика списка покупок ---------- */
  console.log('\nСписок покупок (готовое меню)');
  {
    const page = await browser.newPage();
    await page.goto(base);
    for (const g of [2, 8]) {
      const list = await page.evaluate(g => window.NYR.buildShopping(window.NYR_DATA.READY_MENU, g), g);
      const get = n => (list.find(x => x.name === n) || {}).amount;
      console.log('  — на ' + g + ' гостей:');
      list.forEach(x => console.log('      ' + x.name + ' — ' + x.amount));
      ok(list.every(x => !/\d,\d+ шт/.test(x.amount) && !/½ шт/.test(x.amount)), g + ' гостей: штуки целые');
      ok(list.every(x => { const m = /^(\d+) г/.exec(x.amount); if (!m) return true; const v = +m[1]; return v < 200 ? v % 10 === 0 : v % 50 === 0; }), g + ' гостей: граммы округлены до 10/50');
      ok(get('Соль') && /по вкусу/.test(get('Соль')), g + ' гостей: соль «по вкусу» не суммируется в число');
      if (g === 8) {
        // яйца: оливье 4·8/6=5,33 + шуба 3·8/8=3 + яйца 6·8/6=8 + наполеон (целый торт на 12) 3 = 19,33 → 20
        ok(get('Яйца') === '20 шт', '8 гостей: яйца 20 шт (' + get('Яйца') + ')');
        // майонез: 266,7 + 250 + 80 + 200 = 796,7 → 800 г
        ok(get('Майонез') === '800 г', '8 гостей: майонез 800 г (' + get('Майонез') + ')');
        // картофель: оливье 5,33 + шуба 3 + мясо 8 = 16,33 → 17
        ok(get('Картофель') === '17 шт', '8 гостей: картофель 17 шт (' + get('Картофель') + ')');
        // молоко 1 л (торт целиком)
        ok(get('Молоко') === '1 л', '8 гостей: молоко 1 л (' + get('Молоко') + ')');
      } else {
        // яйца: 1,33 + 0,75 + 2 + 3 = 7,08 → 8
        ok(get('Яйца') === '8 шт', '2 гостя: яйца 8 шт (' + get('Яйца') + ')');
        // майонез: 66,7 + 62,5 + 20 + 50 = 199,2 → 200 г
        ok(get('Майонез') === '200 г', '2 гостя: майонез 200 г (' + get('Майонез') + ')');
        // мука: торт целиком 450 + 40 = 490 → 500 г
        ok(get('Мука') === '500 г', '2 гостя: мука 500 г (' + get('Мука') + ')');
      }
    }
    // Разные единицы одного продукта — в одну строку через «+», ложки складываются.
    const mix = await page.evaluate(() => window.NYR.buildShopping(['chicken', 'buzhenina', 'potato', 'duck'], 6));
    const salt = (mix.find(x => x.name === 'Соль') || {}).amount;
    ok(/ст\. л\./.test(salt || ''), 'ложки соли из разных рецептов сложены в ст. л. (' + salt + ')');
    const both = await page.evaluate(() => window.NYR.buildShopping(['olivier', 'chicken'], 4));
    const s2 = (both.find(x => x.name === 'Соль') || {}).amount;
    ok(/ \+ /.test(s2 || '') && /по вкусу/.test(s2), 'число и «по вкусу» — в одну строку через «+» (' + s2 + ')');
    await page.close();
  }

  /* ---------- Экраны ---------- */
  for (const vp of VIEWPORTS) {
    console.log('\nЭкран ' + vp.name + ' ' + vp.width + '×' + vp.height);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();

    const shot = async n => page.screenshot({ path: path.join(OUT, vp.name + '-' + n + '.png'), fullPage: n !== 'home-fold' });

    await layoutCheck(page, 'главная');
    await shot('home'); await page.screenshot({ path: path.join(OUT, vp.name + '-home-fold.png') });
    ok(await page.locator('.tile').count() === 4, 'на главной 4 раздела');
    ok(await page.getByText('Моё меню на праздник').count() > 0 && await page.getByText('Список покупок').count() > 0, 'есть кнопки меню и списка покупок');

    for (const cat of ['salads', 'hot', 'snacks', 'sweets']) {
      await page.goto(base + '#c/' + cat);
      ok(await page.locator('.rcard').count() === 5, 'раздел ' + cat + ': 5 рецептов');
      await layoutCheck(page, 'раздел ' + cat);
      if (cat === 'salads') await shot('cat-salads');
    }
    const ids = await page.evaluate(() => window.NYR_DATA.RECIPES.map(r => r.id));
    for (const id of ids) {
      await page.goto(base + '#r/' + id);
      const title = await page.locator('.page-title').textContent();
      const expect = await page.evaluate(id => window.NYR_DATA.RECIPES.find(r => r.id === id).title, id);
      if (title !== expect) ok(false, 'рецепт ' + id + ' открывается по ссылке');
      await layoutCheck(page, 'рецепт ' + id);
    }
    ok(true, 'все 20 рецептов открываются по прямой ссылке #r/…');

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
    await page.locator('[data-act="menu-toggle"]').first().click();
    ok((await page.locator('[data-act="menu-toggle"]').first().textContent()).includes('Убрать'), 'кнопка меняется на «Убрать из меню»');
    ok(await page.locator('#toast').isVisible(), 'плашка «Добавлено в меню»');

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
    ok((await page.locator('[data-testid="menu-count"]').textContent()) === '1 блюдо', 'меню сохранилось после перезагрузки');
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
    for (let k = 0; k < 2; k++) await page.click('[data-act="guests+"]');
    ok((await page.locator('[data-testid="guests"]').textContent()) === '8', 'гостей 8');
    await layoutCheck(page, 'меню');
    await shot('menu');

    // Список покупок.
    await page.click('a.btn[href="#shop"]');
    ok(await page.locator('.shop li').count() > 20, 'список покупок собран');
    await page.locator('.shop li').first().click();
    ok(await page.locator('.shop li.bought').count() === 1, 'галочка «куплено» зачёркивает строку');
    await layoutCheck(page, 'список покупок');
    await shot('shop');

    // Поделиться без navigator.share и без буфера обмена → плашка или окно.
    await page.evaluate(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {} });
    await page.click('[data-act="share-shop"]');
    await page.waitForTimeout(200);
    const shared = await page.evaluate(() => window.__lastShare);
    ok(/Рецепты к Новому году — https:\/\/romangerasimov71-spec\.github\.io\/new-year-recipes\//.test(shared), 'текст списка со строкой-ссылкой в конце');
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
    ok(/на 8 гостей/.test(mt) && /Салаты:/.test(mt), 'текст меню');

    ok(errors.length === 0, 'ошибок в консоли нет' + (errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''));
    await ctx.close();
  }

  /* ---------- Без localStorage ---------- */
  console.log('\nБез хранилища');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
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
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
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
