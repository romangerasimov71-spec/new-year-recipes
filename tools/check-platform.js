#!/usr/bin/env node
/* Проверка площадочной части «Новогоднего стола» (Playwright + Chromium):
   ВК и ОК (подставной клиент tools/vk-host.html: настоящий VK Bridge и Playgama Bridge, ответы «как ВК»),
   VKWebAppInit, лишние запросы, «поделиться» в ВК/ОК, баннер, план по дням за рекламу, открытка,
   «сколько блюд», «Блюдо дня», «в избранное», «О приложении», хранилище, статистика, размеры экранов.
   Запуск: NODE_PATH=/opt/node-tools/node_modules node tools/check-platform.js
           SHOTS=/путь … — плюс скриншоты.
   Реклама на GitHub Pages / localhost — имитация из platform.js (?fakead=…). Состояния Bridge по всем
   случаям проверяет набор tools/ads-test (см. tools/ads-adapter.js). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.txt': 'text/plain' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

let fails = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { fails++; console.log('  FAIL ' + msg); }
}
async function shot(target, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const pg = typeof target.screenshot === 'function' ? target : target.page();
  await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
}
const kb = (f) => (typeof f.page === 'function' ? f.page() : f).keyboard;
const isReady = () => window.NYR && window.NYR.isReady && window.NYR.isReady();
const events = (f) => f.evaluate(() => window.Analytics._log.map((x) => ({ name: x.name, data: x.data })));

function watch(page) {
  const w = { errors: [], external: [] };
  page.on('console', (m) => { if (m.type() === 'error') w.errors.push(m.text()); });
  page.on('pageerror', (e) => w.errors.push(String(e)));
  page.on('request', (r) => { if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(r.url()) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) w.external.push(r.url()); });
  return w;
}

async function newCtx(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.vp || { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: !!opts.touch, isMobile: !!opts.touch, locale: opts.locale || 'ru-RU' });
  // Без даты — сезон плана (ноябрь): иначе после 1 января план за рекламу не предлагается и проверки рекламы не пройдут.
  await ctx.addInitScript((d) => { window.__NYR_TODAY = d; }, opts.today || '2026-11-20');
  await ctx.addInitScript(() => { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch (e) {} });
  // Внешнее не нужно приложению: всё, что не с нашего адреса, — обрываем (и запоминаем).
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  return ctx;
}

// Обычный браузер (как GitHub Pages: имитация рекламы и полоска баннера).
async function openWeb(browser, base, hash, opts = {}) {
  const ctx = opts.ctx || await newCtx(browser, opts);
  const page = await ctx.newPage();
  const w = watch(page);
  await page.goto(base + (opts.query || '') + (hash || ''));
  await page.waitForFunction(isReady, null, { timeout: 20000 });
  return { ctx, page, f: page, w };
}

// Внутри подставного клиента ВК/ОК.
async function openHost(browser, base, q, opts = {}) {
  const ctx = opts.ctx || await newCtx(browser, opts);
  const page = await ctx.newPage();
  const w = watch(page);
  if (opts.blockBridge) await page.route('**/playgama-bridge.js', (r) => r.abort());
  await page.goto(base + 'tools/vk-host.html?' + q);
  const f = await frameOf(page);
  await f.waitForFunction(isReady, null, { timeout: 20000 });
  return { ctx, page, f, w };
}
async function frameOf(page) {
  for (let i = 0; i < 100; i++) {
    const f = page.frames().find((x) => /\/index\.html\?vk_app_id=/.test(x.url()));
    if (f) return f;
    await page.waitForTimeout(50);
  }
  throw new Error('нет фрейма приложения');
}
async function reloadFrame(page, f) {
  await f.evaluate(() => location.reload());
  await page.waitForTimeout(150);
  const nf = await frameOf(page);
  await nf.waitForFunction(isReady, null, { timeout: 20000 });
  return nf;
}
const calls = (page) => page.evaluate(() => window.CALLS.map((c) => ({ h: c.h, p: c.p, t: c.t })));

// Ничего не вылезает вбок, текст не мельче 17px, кнопки не меньше 44px.
async function layout(f, label) {
  const r = await f.evaluate(() => {
    const W = document.documentElement.clientWidth, bad = [], small = [], tiny = [];
    document.querySelectorAll('#app *, .sheet *, .hdr *').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || el.offsetParent === null) return;
      if (el.closest('.gal-track, .viewer, .sheet-body img')) return;
      if (b.right > W + 1 || b.left < -1) bad.push((el.className || el.tagName) + ' ' + Math.round(b.left) + '…' + Math.round(b.right));
      if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 16.5) small.push(el.textContent.trim().slice(0, 24) + ' ' + fs + 'px');
      }
      if (el.matches('button, a.btn, .chip') && (b.height < 43.5 || b.width < 43.5)) tiny.push(el.textContent.trim().slice(0, 20) + ' ' + Math.round(b.width) + '×' + Math.round(b.height));
    });
    return { bad, small, tiny, sw: document.documentElement.scrollWidth, W };
  });
  ok(!r.bad.length && r.sw <= r.W + 1, label + ': ничего не вылезает вбок' + (r.bad.length ? ' ' + JSON.stringify(r.bad.slice(0, 3)) : ''));
  ok(!r.small.length, label + ': текст не мельче 17px' + (r.small.length ? ' ' + JSON.stringify(r.small.slice(0, 3)) : ''));
  ok(!r.tiny.length, label + ': кнопки не меньше 44px' + (r.tiny.length ? ' ' + JSON.stringify(r.tiny.slice(0, 3)) : ''));
}
// Баннер (полоска-имитация) не закрывает текст и кнопки: докрутили до конца — низ последнего блока выше баннера.
async function bannerClear(f, label) {
  const r = await f.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((res) => setTimeout(res, 80));
    const ban = document.querySelector('.fake-banner');
    if (!ban || getComputedStyle(ban).display === 'none') return { noBanner: true };
    const top = ban.getBoundingClientRect().top, under = [];
    document.querySelectorAll('#app a, #app button, #app p, #app li, #app h1, #app h2').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || el.offsetParent === null) return;
      if (b.bottom > top + 0.5 && b.top < window.innerHeight) under.push((el.className || el.tagName) + ' «' + el.textContent.trim().slice(0, 20) + '»');
    });
    window.scrollTo(0, 0);
    return { under };
  });
  ok(!r.noBanner, label + ': баннер на экране');
  if (!r.noBanner) ok(!r.under.length, label + ': баннер не закрывает текст и кнопки' + (r.under.length ? ' ' + JSON.stringify(r.under.slice(0, 3)) : ''));
}
const bannerShown = (f) => f.evaluate(() => { const b = document.querySelector('.fake-banner'); return !!b && getComputedStyle(b).display !== 'none'; });

async function readyMenu(f) {
  await f.evaluate(() => { location.hash = 'menu'; });
  await f.waitForSelector('[data-act="ready-menu"]');
  await f.click('[data-act="ready-menu"]');
  await f.waitForSelector('.mitem');
}
// Имитация рекламы: досмотреть и закрыть.
async function watchFakeAd(page) {
  await page.waitForSelector('.fake-ad-close:has-text("Закрыть")', { timeout: 15000 });
  await page.waitForFunction(() => /досмотрена/.test(document.querySelector('.fake-ad').textContent), null, { timeout: 15000 });
  await page.click('.fake-ad-close');
}

async function main() {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  console.log('Адрес: ' + base);

  console.log('\nВКонтакте (подставной клиент, Android):');
  {
    const { ctx, page, f, w } = await openHost(browser, base, 'client=vk&platform=mobile_android');
    await page.waitForTimeout(600);
    let c = await calls(page);
    ok(c.length && c[0].h === 'VKWebAppInit', 'VKWebAppInit — первый вызов (' + (c[0] && c[0].t) + ' мс от открытия клиента)');
    ok(c.filter((x) => x.h === 'VKWebAppInit').length === 1, 'VKWebAppInit — ровно один раз (повтор Playgama Bridge не уходит)');
    const L = await f.evaluate(() => window.NYR_LAUNCH);
    ok(L.initSentAt >= 0 && L.initSentAt < 300 && L.initResult === 'ok', 'VKWebAppInit отправлен на ' + L.initSentAt + ' мс загрузки страницы, ответ получен');
    ok(!c.some((x) => x.h === 'VKWebAppGetUserInfo' || x.h === 'VKWebAppGetEmail' || x.h === 'VKWebAppGetPhoneNumber' || x.h === 'VKWebAppGetGeodata'), 'лишних запросов данных нет (имя и фото не запрашиваются)');
    ok(!w.external.length, 'ни одного запроса не к своему адресу (нет unpkg.com и др.)' + (w.external.length ? ' ' + JSON.stringify(w.external.slice(0, 3)) : ''));
    const st = await f.evaluate(() => ({ id: Platform.id, real: Platform.isReal, rew: Platform.rewardedAvailable(), ban: Platform.banner.mode, share: Platform.nativeShareChannel(), fav: Platform.favoriteKinds() }));
    ok(st.id === 'vk' && st.real && st.rew && st.ban === 'bridge' && st.share === 'vk', 'площадка vk: реклама и баннер через Bridge, «поделиться» ВК');
    ok(JSON.stringify(st.fav) === '["favorites","home"]', 'Android: можно предложить «в избранное» и «на главный экран»');
    // Первый запуск: подсказка, метка 0+, баннера нет
    ok(await f.locator('[data-testid="intro"]').count() === 1 && /0\+/.test(await f.locator('[data-testid="intro"]').textContent()), 'первый запуск: «Как пользоваться» и метка 0+');
    ok(!c.some((x) => x.h === 'VKWebAppShowBannerAd'), 'первый экран первого запуска — без баннера');
    await shot(f, 'vk-home-first');
    await f.click('.tile >> nth=0'); await page.waitForTimeout(300);
    c = await calls(page);
    const ban = c.find((x) => x.h === 'VKWebAppShowBannerAd');
    ok(ban && ban.p.banner_location === 'bottom', 'ушёл с первого экрана — баннер внизу (VKWebAppShowBannerAd bottom)');
    const n0 = c.length;
    await f.click('.rcard >> nth=0'); await f.waitForSelector('.gal-slide');
    await f.click('.gal-slide >> nth=0'); await page.waitForTimeout(250);
    c = await calls(page);
    ok(c.slice(n0).some((x) => x.h === 'VKWebAppHideBannerAd'), 'крупный просмотр фото — баннер убран');
    await kb(f).press('Escape'); await page.waitForTimeout(250);
    c = await calls(page);
    ok(c.slice(n0).filter((x) => x.h === 'VKWebAppShowBannerAd').length >= 1, 'закрыл просмотр — баннер вернулся');
    // поделиться рецептом
    await f.click('[data-act="share-recipe"] >> nth=0'); await f.waitForSelector('#sheet:not([hidden])');
    const sheetText = await f.locator('#sheet').innerText();
    ok(/Поделиться ВКонтакте/.test(sheetText) && /Скопировать текст/.test(sheetText) && !/Одноклассник/.test(sheetText), 'окно «поделиться»: «Поделиться ВКонтакте», «Скопировать текст», без Одноклассников');
    ok(!/github\.io|https?:\/\//.test(sheetText), 'в тексте нет ссылок наружу (адрес ВК ещё не вписан — ссылки нет вовсе)');
    await shot(f, 'vk-share');
    await f.click('#sheet [data-sh="native"]'); await page.waitForTimeout(200);
    c = await calls(page);
    const sh = c.filter((x) => x.h === 'VKWebAppShare').pop();
    ok(sh && !sh.p.link, 'VKWebAppShare без ссылки (делится приложением)');
    ok(await f.locator('#sheet:not([hidden])').count() === 0, 'окно закрылось');
    // адрес ВК вписан → ссылка на рецепт
    const lk = await f.evaluate(() => { APP_CONFIG.APP_URL.vk = 'https://vk.com/app51000000'; return NYR.linkFor('#r/olivier'); });
    ok(lk === 'https://vk.com/app51000000#r/olivier', 'адрес ВК из config.js: ' + lk);
    await f.click('[data-act="share-recipe"] >> nth=0'); await f.waitForSelector('#sheet:not([hidden])');
    await f.click('#sheet [data-sh="native"]'); await page.waitForTimeout(200);
    c = await calls(page);
    ok(/^https:\/\/vk\.com\/app51000000#r\//.test(c.filter((x) => x.h === 'VKWebAppShare').pop().p.link || ''), 'VKWebAppShare со ссылкой на рецепт');
    const ev = await events(f);
    ok(ev.some((e) => e.name === 'share_clicked' && e.data.channel === 'vk' && e.data.what === 'recipe'), 'отметка share_clicked channel=vk what=recipe');
    // хранилище ВК
    await readyMenu(f);
    await f.evaluate(() => NYR.flushSave()); await page.waitForTimeout(150);
    const store = await page.evaluate(() => window.STORE);
    ok(store.nyr_menu && JSON.parse(store.nyr_menu).m.length === 6, 'меню сохранено в хранилище ВК (VKWebAppStorageSet nyr_menu)');
    ok(Object.values(store).every((v) => v.length <= 4096), 'каждое значение в хранилище ВК не больше 4 КБ');
    const f2 = await reloadFrame(page, f);
    ok(await f2.evaluate(() => NYR.state.menu.length) === 6, 'перезапуск во ВК — меню на месте (из хранилища ВК)');
    // Свернули приложение (VKWebAppViewHide) — сохранение сразу, без отложки в 300 мс.
    await f2.evaluate(() => { location.hash = 'menu'; }); await f2.waitForSelector('[data-act="guests+"]');
    await f2.click('[data-act="guests+"]');
    await page.evaluate(() => { document.getElementById('app').contentWindow.postMessage({ type: 'VKWebAppViewHide', data: {} }, '*'); });
    await page.waitForTimeout(80);
    const g7 = await page.evaluate(() => window.STORE.nyr_menu && JSON.parse(window.STORE.nyr_menu).g);
    ok(g7 === 7, 'VKWebAppViewHide (свернули) — сохранено сразу (гостей ' + g7 + ')');
    await f2.click('[data-act="guests-"]'); await f2.evaluate(() => NYR.flushSave());
    // План за рекламу (VKWebAppShowNativeAds reward)
    await f2.evaluate(() => { location.hash = 'menu'; }); await f2.waitForSelector('#planAdBtn');
    await f2.click('#planAdBtn');
    await f2.waitForFunction(() => location.hash === '#plan' && document.querySelector('.plan-day'), null, { timeout: 15000 });
    c = await calls(page);
    const ad = c.filter((x) => x.h === 'VKWebAppShowNativeAds').pop();
    ok(ad && ad.p.ad_format === 'reward', 'план: реклама за награду (VKWebAppShowNativeAds reward) → план открыт');
    ok(!c.some((x) => x.h === 'VKWebAppShowNativeAds' && x.p.ad_format === 'interstitial'), 'межстраничной рекламы нет');
    await shot(f2, 'vk-plan');
    ok(!w.errors.length, 'ВК: ошибок в консоли нет' + (w.errors.length ? ' ' + JSON.stringify(w.errors.slice(0, 3)) : ''));
    await ctx.close();
  }

  console.log('\nВКонтакте: реклама не пришла (ошибка площадки):');
  {
    const { ctx, page, f, w } = await openHost(browser, base, 'client=vk&platform=desktop_web&ads=fail');
    await readyMenu(f);
    await f.click('#planAdBtn');
    await f.waitForSelector('.notice-fail', { timeout: 15000 });
    ok(/не загрузилась|нет/.test(await f.locator('.notice-fail').textContent()) && await f.locator('#planAdBtn').isEnabled(), 'честное сообщение, кнопка снова доступна');
    ok(await f.evaluate(() => !NYR.planOpen() && NYR.adGrants() === 0), 'плана нет, награды нет');
    const n = (await calls(page)).filter((x) => x.h === 'VKWebAppShowNativeAds').length;
    ok(n === 1, 'одно нажатие — одна реклама (' + n + ')');
    const st = await f.evaluate(() => Platform.favoriteKinds());
    ok(JSON.stringify(st) === '["favorites"]', 'компьютер: только «в избранное»');
    ok(!w.errors.length, 'ошибок в консоли нет' + (w.errors.length ? ' ' + JSON.stringify(w.errors.slice(0, 3)) : ''));
    await ctx.close();
  }

  console.log('\n«В избранное» (ВК): не с порога, с 3-го захода, отказ — навсегда:');
  {
    let { ctx, page, f } = await openHost(browser, base, 'client=vk&platform=mobile_iphone');
    ok(await f.locator('[data-testid="fav-offer"]').count() === 0, '1-й заход — не предлагаем');
    f = await reloadFrame(page, f);
    ok(await f.locator('[data-testid="fav-offer"]').count() === 0, '2-й заход — не предлагаем');
    f = await reloadFrame(page, f);
    ok(await f.locator('[data-testid="fav-offer"]').count() === 1, '3-й заход — предложение «В избранное»');
    ok(await f.locator('[data-act="fav-add"][data-kind="home"]').count() === 0, 'iPhone: без «На главный экран»');
    await shot(f, 'vk-fav');
    await f.click('[data-act="fav-add"]'); await page.waitForTimeout(200);
    ok((await calls(page)).some((x) => x.h === 'VKWebAppAddToFavorites'), 'нажал — VKWebAppAddToFavorites');
    ok(await f.locator('[data-testid="fav-offer"]').count() === 0, 'после добавления предложение пропало');
    f = await reloadFrame(page, f);
    ok(await f.locator('[data-testid="fav-offer"]').count() === 0, 'добавил — больше не предлагаем');
    await ctx.close();
    ({ ctx, page, f } = await openHost(browser, base, 'client=vk&platform=mobile_android'));
    f = await reloadFrame(page, f); f = await reloadFrame(page, f);
    ok(await f.locator('[data-act="fav-add"][data-kind="home"]').count() === 1, 'Android: есть «На главный экран»');
    await f.click('[data-act="fav-no"]'); await page.waitForTimeout(100);
    f = await reloadFrame(page, f); f = await reloadFrame(page, f);
    ok(await f.locator('[data-testid="fav-offer"]').count() === 0, '«Нет, спасибо» — больше не надоедаем');
    await ctx.close();
  }

  console.log('\nОдноклассники (vk_client=ok):');
  for (const plat of ['mobile_web_ok', 'desktop_web_ok']) {
    const { ctx, page, f, w } = await openHost(browser, base, 'client=ok&platform=' + plat);
    const st = await f.evaluate(() => ({ id: Platform.id, share: Platform.nativeShareChannel(), fav: Platform.favoriteKinds(), url: Platform.appUrl() }));
    ok(st.id === 'ok' && st.share === 'ok' && !st.fav.length, plat + ': площадка ok, «поделиться» средствами ОК, «в избранное» не предлагается');
    const c0 = await calls(page);
    ok(c0[0].h === 'VKWebAppInit' && !c0.some((x) => x.h === 'VKWebAppGetUserInfo'), plat + ': VKWebAppInit первым, имя и фото не запрашиваются');
    // во всех экранах — ни слова о ВК и ни одной ссылки vk.com
    const texts = [];
    for (const h of ['', '#menu', '#r/olivier', '#about', '#c/trendy']) {
      await f.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(150);
      if (h === '#menu' && !(await f.locator('.mitem').count())) { await f.click('[data-act="ready-menu"]'); await page.waitForTimeout(150); }
      texts.push(await f.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('a[href]')].map((a) => a.href).join(' ')));
    }
    await f.evaluate(() => { location.hash = 'r/olivier'; }); await page.waitForTimeout(150);
    await f.click('[data-act="share-recipe"] >> nth=0'); await f.waitForSelector('#sheet:not([hidden])');
    const sheetText = await f.locator('#sheet').innerText();
    texts.push(sheetText);
    ok(/Поделиться в Одноклассниках/.test(sheetText), plat + ': «Поделиться в Одноклассниках»');
    const all = texts.join(' ');
    ok(!/ВКонтакте|vk\.com|ВК\b/.test(all), plat + ': нигде нет «ВКонтакте» и ссылок vk.com');
    await shot(f, 'ok-share-' + plat);
    await f.click('#sheet [data-sh="native"]'); await page.waitForTimeout(200);
    ok((await calls(page)).some((x) => x.h === 'VKWebAppShare'), plat + ': делится через окно ОК (VKWebAppShare)');
    const lk = await f.evaluate(() => { APP_CONFIG.APP_URL.ok = 'https://ok.ru/game/512000000000'; APP_CONFIG.APP_URL.vk = 'https://vk.com/app1'; return NYR.linkFor('#r/olivier'); });
    ok(lk === 'https://ok.ru/game/512000000000', plat + ': ссылка ОК из config.js, без # (' + lk + ')');
    // поддержка в ОК: только ссылка ОК / почта, не vk.com
    await f.evaluate(() => { APP_CONFIG.SUPPORT = { vk: 'https://vk.com/club1', ok: 'https://ok.ru/group/1', email: '' }; location.hash = 'x'; location.hash = 'about'; });
    await page.waitForTimeout(150);
    ok((await f.locator('.support-link').getAttribute('href')) === 'https://ok.ru/group/1', plat + ': поддержка — ссылка на группу ОК');
    // открытка в ОК: сохранение — на весь экран
    await f.evaluate(() => { location.hash = 'menu'; }); await f.waitForSelector('[data-act="postcard"]');
    await f.click('[data-act="postcard"]'); await f.waitForSelector('.postcard-img');
    await f.click('[data-pc="save"]'); await f.waitForSelector('.postcard-full-img');
    ok(/удерживайте|правой кнопкой/.test(await f.locator('.postcard-full-hint').textContent()), plat + ': «Сохранить открытку» — картинка на весь экран с подсказкой');
    await shot(f, 'ok-postcard-full-' + plat);
    ok(!w.external.length, plat + ': запросов наружу нет');
    ok(!w.errors.length, plat + ': ошибок в консоли нет' + (w.errors.length ? ' ' + JSON.stringify(w.errors.slice(0, 3)) : ''));
    await ctx.close();
  }

  console.log('\nЯзык ВК английский — приложение всё равно русское:');
  {
    const { ctx, f } = await openHost(browser, base, 'client=vk&lang=en', { locale: 'en-US' });
    ok(/Рецепты к Новому году/.test(await f.locator('h1').textContent()) && await f.evaluate(() => document.documentElement.lang) === 'ru', 'vk_language=en, браузер en-US: всё по-русски');
    await ctx.close();
  }

  console.log('\nВ ВК не загрузился Playgama Bridge:');
  {
    const { ctx, page, f, w } = await openHost(browser, base, 'client=vk', { blockBridge: true });
    const st = await f.evaluate(() => ({ id: Platform.id, rew: Platform.rewardedAvailable(), ban: Platform.banner.mode }));
    ok(st.id === 'vk' && !st.rew && st.ban === 'none', 'приложение открылось, имитации рекламы и полоски нет (' + JSON.stringify(st) + ')');
    ok((await calls(page))[0].h === 'VKWebAppInit', 'VKWebAppInit всё равно ушёл (сам VK Bridge лежит рядом)');
    await readyMenu(f);
    ok(await f.locator('#planAdBtn').count() === 0, 'кнопки плана нет (рекламы нет — не обещаем)');
    ok(!w.errors.filter((e) => !/playgama-bridge\.js|ERR_FAILED/.test(e)).length, 'других ошибок нет');
    await ctx.close();
  }

  console.log('\nОбычный браузер (GitHub Pages): баннер-полоска и план за рекламу-имитацию:');
  {
    const { ctx, page, f, w } = await openWeb(browser, base, '', { query: '?fakeadsec=1' });
    ok(!(await bannerShown(f)), 'первый запуск, первый экран — полоски баннера нет');
    await f.click('[data-act="intro-ok"]'); await page.waitForTimeout(100);
    ok(await bannerShown(f), '«Понятно» — баннер появился');
    await bannerClear(f, 'главная');
    await readyMenu(f);
    await bannerClear(f, 'меню');
    const hm = (await f.locator('[data-testid="howmany"]').innerText()).replace(/\s+/g, ' ');
    ok(/На 6 гостей обычно хватает 2–3 салатов, 1 горячего, 2 закусок и 1 десерта/.test(hm), 'подсказка: «На 6 гостей обычно хватает 2–3 салатов, 1 горячего, 2 закусок и 1 десерта»');
    ok(/Закуски: есть 2/.test(hm) && /Салаты: есть 2/.test(hm) && !/можно добавить/.test(hm) && /Блюд хватает/.test(hm), 'готовое меню проходит свою подсказку: «Закуски: есть 2», «Блюд хватает на всех гостей»');
    await f.click('[data-act="guests-set"][data-v="10"]');
    const hm10 = (await f.locator('[data-testid="howmany"]').innerText()).replace(/\s+/g, ' ');
    ok(/можно добавить/.test(hm10), '10 гостей — подсказка предлагает добавить блюда');
    await f.click('[data-act="guests-set"][data-v="6"]');
    ok(/Посмотрите рекламу — и получите план: что готовить 29, 30 и 31 декабря/.test(await f.locator('[data-testid="plan-card"]').textContent()), 'кнопка плана с пояснением про рекламу');
    // отмена — без награды, сообщение, кнопка доступна
    await page.goto(base + '?fakead=cancel#menu'); await f.waitForFunction(isReady);
    await f.click('#planAdBtn'); await f.waitForSelector('.notice-fail', { timeout: 15000 });
    ok(/закрыта раньше/.test(await f.locator('.notice-fail').textContent()) && await f.evaluate(() => !NYR.planOpen()), 'закрыл рекламу раньше — плана нет, честное сообщение');
    await page.goto(base + '?fakead=fail#menu'); await f.waitForFunction(isReady);
    await f.click('#planAdBtn'); await f.waitForSelector('.notice-fail', { timeout: 15000 });
    ok(/не загрузилась/.test(await f.locator('.notice-fail').textContent()) && await f.locator('#planAdBtn').isEnabled(), 'ошибка рекламы — сообщение, кнопка снова доступна');
    // «Отмена» во время ожидания
    await page.goto(base + '?fakead=silent#menu'); await f.waitForFunction(isReady);
    await f.click('#planAdBtn'); await f.waitForSelector('.ad-wait');
    ok(!(await bannerShown(f)), 'пока ждём рекламу — баннера нет');
    await f.click('.ad-wait button'); await f.waitForSelector('.notice-fail');
    ok(await f.locator('.ad-wait').count() === 0 && await f.evaluate(() => !NYR.planOpen()), '«Отмена» во время ожидания — окно ушло, плана нет');
    // досмотрел
    await page.goto(base + '?fakeadsec=1#menu'); await f.waitForFunction(isReady);
    await f.dblclick('#planAdBtn');
    await watchFakeAd(page);
    await f.waitForFunction(() => location.hash === '#plan' && document.querySelector('.plan-day'));
    ok(await f.evaluate(() => NYR.adGrants()) === 1, 'двойное нажатие — одна реклама, одна награда; план открыт');
    const days = await f.evaluate(() => [...document.querySelectorAll('.plan-day h2')].map((h) => h.textContent));
    ok(days.length === 3 && /^29 декабря/.test(days[0]) && /^30 декабря/.test(days[1]) && /^31 декабря/.test(days[2]), 'план: 29, 30, 31 декабря (' + days.join(' | ') + ')');
    const plan = await f.evaluate(() => { const d = NYR.planDays(); return { 29: d[29].map((x) => x.r.id), 30: d[30].map((x) => x.r.id), 31: d[31].map((x) => x.r.id + '@' + x.at) }; });
    ok(plan[29].includes('napoleon') && plan[30].includes('olivier') && plan[30].includes('shuba') && plan[30].includes('eggs'), 'заранее: Наполеон — 29-го, варка овощей и яиц — 30-го');
    ok(plan[31].some((x) => /^olivier@/.test(x)) && plan[31].some((x) => /^meat-french@/.test(x)), '31-го: заправить оливье, горячее в духовку — со временем');
    const at = plan[31].map((x) => +x.split('@')[1]);
    ok(at.every((v, i) => !i || v >= at[i - 1]), '31-го — по времени, от раннего к позднему');
    const t1 = await f.locator('.plan-day[data-day="31"] .plan-at').first().textContent();
    await f.click('[data-act="table-set"][data-v="22"]');
    const t2 = await f.locator('.plan-day[data-day="31"] .plan-at').first().textContent();
    ok(t1 !== t2 && /22:00/.test(await f.locator('.plan-table').textContent()), 'за стол в 22:00 — время сдвинулось (' + t1 + ' → ' + t2 + ')');
    await layout(f, 'план 390');
    await bannerClear(f, 'план');
    await shot(f, 'web-plan');
    await f.click('[data-act="share-plan"]');
    const pt = await f.evaluate(() => window.__lastShare);
    ok(/План готовки к Новому году/.test(pt) && /29 декабря/.test(pt) && /Оливье/.test(pt) && /22:00 Садимся за стол/.test(pt), 'поделиться планом: текст с днями и временем');
    // меню поменяли в тот же день — пересчёт без рекламы
    await f.evaluate(() => { location.hash = 'r/holodets'; }); await f.waitForSelector('[data-act="menu-add"]');
    await f.click('[data-act="menu-add"] >> nth=0');
    await f.evaluate(() => { location.hash = 'plan'; }); await page.waitForTimeout(150);
    ok(await f.locator('.plan-day[data-day="29"]').textContent().then((t) => /Холодец/.test(t)), 'добавил холодец в тот же день — план пересчитан без новой рекламы (холодец 29-го)');
    // перезапуск: план на месте
    await page.reload(); await f.waitForFunction(isReady);
    ok(await f.evaluate(() => NYR.planOpen()), 'после перезапуска план открыт');
    // на другой день: то же меню — открыт; меню изменилось — снова за рекламу
    await f.evaluate(() => { NYR.meta.plan.day -= 1; NYR.flushSave(); });
    ok(await f.evaluate(() => NYR.planOpen()), 'на следующий день, меню то же — план открыт');
    await f.evaluate(() => { NYR.state.menu.push('crab'); });
    ok(await f.evaluate(() => !NYR.planOpen()), 'на следующий день меню изменилось — план снова за рекламу');
    const ev = await events(f);
    ok(ev.some((e) => e.name === 'plan_opened'), 'отметка plan_opened');
    ok(!w.errors.length, 'ошибок в консоли нет' + (w.errors.length ? ' ' + JSON.stringify(w.errors.slice(0, 3)) : ''));
    ok(!w.external.length, 'запросов наружу нет' + (w.external.length ? ' ' + JSON.stringify(w.external.slice(0, 3)) : ''));
    await ctx.close();
  }

  console.log('\nПлан: отметки и опоздавшая реклама (подробно — в tools/ads-test):');
  {
    const { ctx, page, f } = await openWeb(browser, base, '', { query: '?fakead=fail' });
    await readyMenu(f);
    await f.click('#planAdBtn'); await f.waitForSelector('.notice-fail');
    const ev = await events(f);
    ok(ev.some((e) => e.name === 'plan_offer_shown' && e.data.source === 'menu'), 'plan_offer_shown source=menu');
    ok(ev.some((e) => e.name === 'ad_reward_failed' && e.data.reason === 'error' && e.data.late === false), 'ad_reward_failed reason=error');
    await page.goto(base + '#plan'); await page.reload(); await f.waitForFunction(isReady);
    ok(await f.locator('#planAdBtn').count() === 1 && /Посмотрите рекламу/.test(await f.locator('.plan-card').textContent()), 'по ссылке #plan — предложение с кнопкой');
    await ctx.close();
  }

  console.log('\nПлан знает дату и что духовка одна:');
  {
    const planAt = async (today, menu, t) => {
      const { ctx, page, f, w } = await openWeb(browser, base, '', { today, query: '?nobanner' });
      await f.evaluate(([menu, t]) => { NYR.state.menu = menu; NYR.meta.plan = { day: 1, menu: menu.slice().sort().join(','), t: t || 21 }; NYR.flushSave(); location.hash = 'plan'; }, [menu, t]);
      await page.waitForTimeout(150);
      const P = await f.evaluate(() => { const d = NYR.planDays(); return { show: d.show, d29: d[29].map((x) => x.r.id), d30: d[30].map((x) => x.r.id), d31: d[31].map((x) => ({ id: x.r.id, at: x.at, now: x.now, text: x.text })), late: d.late.map((x) => x.r.id), tea: d.tea.map((x) => x.r.id), oven: d.oven, notes: d.notes, shop: d.shop, moved: d.moved, T: d.T }; });
      const html = (await f.locator('#app').innerText()).replace(/\s+/g, ' ');
      return { ctx, page, f, w, P, html };
    };
    // Духовка одна: пересекаются только блюда с одной температурой, и не больше двух сразу.
    const ovenOk = (oven) => {
      const bad = [];
      oven.forEach((a, i) => oven.forEach((b, k) => { if (k > i && a.from < b.to && b.from < a.to && (a.t !== b.t || a.t2 !== b.t2)) bad.push(a.id + '+' + b.id); }));
      oven.forEach((a) => { const n = oven.filter((b) => b.from <= a.from && a.from < b.to).length; if (n > 2) bad.push('3+ в ' + a.from); });
      return bad;
    };
    const M = ['olivier', 'holodets', 'napoleon'];
    let r = await planAt('2026-12-28', M);
    ok(r.P.show.join() === '29,30,31' && r.P.d29.includes('holodets') && r.P.d29.includes('napoleon') && r.P.d30.includes('olivier'), '28 декабря: все три дня, холодец и «Наполеон» — 29-го');
    ok(/лучше взять 30-го/.test(r.html) && /Докупите свежее/.test(r.html), '28 декабря: свежее (зелёный лук) — купить 30-го, на 30-е — напоминание');
    ok(r.P.tea.includes('napoleon') && !r.P.d31.some((x) => x.id === 'napoleon') && /К чаю/.test(r.html), '«Наполеон» — «к чаю», после застолья, без времени «за 20 минут до стола»');
    await layout(r.f, 'план 28 декабря 390');
    await r.ctx.close();
    r = await planAt('2026-12-28', ['holodets', 'napoleon']);
    ok(!/лучше взять 30-го/.test(r.html) && !/Докупите свежее/.test(r.html), 'в меню нет зелени и икры — про «свежее 30-го» ни слова');
    await r.ctx.close();
    r = await planAt('2026-12-30', M);
    ok(r.P.show.join() === '30,31' && !/29 декабря,/.test(r.html), '30 декабря: 29-е не показано');
    ok(r.P.moved && r.P.d30.includes('holodets') && r.P.d30.includes('napoleon') && /29 декабря уже прошло/.test(r.html), '30 декабря: холодец и «Наполеон» перенесены на сегодня, об этом сказано');
    ok(/30 декабря, [а-я]+ — сегодня/.test(r.html), 'заголовок «30 декабря — сегодня»');
    await r.ctx.close();
    r = await planAt('2026-12-30', ['buzhenina']);
    ok(r.P.d30.length === 1 && /хотя бы на 6 часов/.test(await r.f.locator('.plan-day[data-day="30"]').innerText()), '30 декабря: буженина — замариновать и запечь в один день (одной строкой)');
    await r.ctx.close();
    r = await planAt('2026-12-31', M); // 31-е, полдень
    ok(r.P.show.join() === '31' && /Сегодня праздник/.test(r.html), '31 декабря днём: только сегодняшний день');
    ok(r.P.late.includes('holodets') && r.P.late.includes('napoleon') && /Уже не успеть/.test(r.html) && /замените блюдо/.test(r.html), '31 декабря днём: холодец и «Наполеон» — «уже не успеть, замените блюдо»');
    ok(!r.P.d31.some((x) => x.id === 'holodets'), 'холодца нет в делах на сегодня');
    ok(r.P.d31.some((x) => x.id === 'olivier' && x.now && /Сварите/.test(x.text)) && r.P.d31.some((x) => x.id === 'olivier' && /Нарежьте/.test(x.text)), 'оливье: сварить овощи — сейчас, нарезать — вечером');
    ok(r.P.d31.every((x) => x.now || x.at >= 12 * 60), 'дел раньше 12:00 нет (кроме «сейчас»)');
    await layout(r.f, 'план 31 декабря днём 390');
    await r.ctx.close();
    r = await planAt('2026-12-31T08:00', M);
    ok(!r.P.late.length && r.P.d31.some((x) => x.id === 'holodets'), '31 декабря в 8 утра: холодец ещё успеть (сварить сейчас — застынет к вечеру)');
    await r.ctx.close();
    r = await planAt('2026-12-31T21:30', M);
    ok(/Пора за стол/.test(r.html), '31 декабря после 21:00: «Пора за стол — с праздником!»');
    await r.f.evaluate(() => { NYR.meta.plan = null; location.hash = 'menu'; }); await r.page.waitForTimeout(150);
    ok(await r.f.locator('#planAdBtn').count() === 0 && /Застолье совсем скоро/.test(await r.f.locator('[data-testid="plan-card"]').innerText()), '31 декабря вечером план за рекламу не предлагаем');
    await r.ctx.close();
    {
      const { ctx, page, f } = await openWeb(browser, base, '', { today: '2027-01-02' });
      await readyMenu(f);
      ok(await f.locator('#planAdBtn').count() === 0 && /следующему Новому году/.test(await f.locator('[data-testid="plan-card"]').innerText()), '2 января: рекламы за план нет — «пригодится к следующему Новому году»');
      await f.evaluate(() => { NYR.meta.plan = { day: 1, menu: NYR.state.menu.slice().sort().join(','), t: 21 }; location.hash = 'plan'; }); await page.waitForTimeout(150);
      ok(await f.locator('[data-testid="plan-closed"]').count() === 1 && await f.locator('#planAdBtn').count() === 0, '2 января: по ссылке #plan — без рекламы и без плана');
      await ctx.close();
    }
    // Одна духовка: утка, шарлотка, курица, картошка, мясо по-французски, мини-веллингтоны.
    const L = ['duck', 'sharlotka', 'chicken', 'potato', 'meat-french', 'wellington'];
    for (const [d, t] of [['2026-12-28', 19], ['2026-12-28', 21], ['2026-12-31T08:00', 21]]) {
      r = await planAt(d, L, t);
      const bad = ovenOk(r.P.oven);
      ok(!bad.length && r.P.oven.length === 6, d + ', за стол в ' + t + ':00: в духовке не встречаются блюда с разной температурой и не больше двух сразу' + (bad.length ? ' ' + bad.join() : ''));
      const sh = r.P.oven.find((o) => o.id === 'sharlotka'), firstHot = Math.min(...r.P.oven.filter((o) => o.id !== 'sharlotka').map((o) => o.from));
      ok(sh && sh.to <= firstHot && sh.from <= 11 * 60, 'шарлотка — с утра, до горячего (' + Math.floor(sh.from / 60) + ':' + String(sh.from % 60).padStart(2, '0') + ')');
      ok(r.P.oven.every((o) => o.to <= r.P.T), 'всё из духовки — к застолью');
      ok(r.P.notes.some((n) => /Духовка одна/.test(n)), 'есть честная строка «Духовка одна…»');
      const wf = r.P.d31.find((x) => x.id === 'wellington' && /запекайте/.test(x.text)), wt = r.P.d31.find((x) => x.id === 'wellington' && /Достаньте слоёное тесто/.test(x.text));
      ok(wf && wt && wt.at <= wf.at - 30 && !/заранее/.test(wf.text), 'мини-веллингтоны: «Достаньте тесто» — отдельной строкой, за 30–40 минут до заворачивания');
      if (t === 19 && d === '2026-12-28') await layout(r.f, 'план «одна духовка» 390');
      await r.ctx.close();
    }
    r = await planAt('2026-12-28', ['chicken', 'potato', 'accordion', 'potato-tree']);
    ok(!ovenOk(r.P.oven).length, 'четыре горячих при 200 °C — по два, не больше');
    await r.ctx.close();
    r = await planAt('2026-12-31T13:00', L);
    ok(!ovenOk(r.P.oven).length && r.P.oven.every((o) => o.from >= 13 * 60), '31-го в 13:00: духовка — только с «сейчас», без наложений');
    await r.ctx.close();
    // Перепроверка Лёхи (13 ноя): A — занятость духовки только по блюдам, что остались в плане;
    // B — причина «духовка занята», если по времени успеть можно; C — шарлотка «к чаю»; D — курица;
    // E — честно про много горячих; F — подготовка не теряется; G — граница продажи от часа застолья.
    r = await planAt('2026-12-31T19:00', ['sprats', 'sharlotka', 'duck'], 22);
    ok(r.P.late.join() === 'duck' && r.P.oven.some((o) => o.id === 'sharlotka') && !/духовка до застолья занята/.test(r.html),
      'A: 31-го 19:00, стол 22:00 — утку не успеть, шарлотка в плане (духовка без утки свободна)');
    await r.ctx.close();
    const A2 = ['olivier', 'shuba', 'duck', 'sharlotka', 'wellington', 'holodets', 'eggs', 'mulled'];
    r = await planAt('2026-12-31T18:00', A2, 21);
    ok(!r.P.late.includes('sharlotka') && r.P.oven.some((o) => o.id === 'sharlotka') && !/духовка до застолья занята/.test(r.html),
      'A: 31-го 18:00, 8 блюд с уткой — шарлотка не «не успеть»');
    await r.ctx.close();
    const HOT9 = ['olivier', 'meat-french', 'chicken', 'duck', 'potato', 'buzhenina', 'accordion', 'potato-tree', 'wellington'];
    r = await planAt('2026-12-31T18:00', HOT9, 21);
    {
      const ch = (r.html.match(/Курица в духовке целиком Уже не успеть[^.]*\./) || [''])[0];
      ok(r.P.late.includes('chicken') && /духовка до застолья занята/.test(ch), 'B: 31-го 18:00, 9 горячих — курица: причина «духовка занята», а не «нужно 2 ч» (' + ch + ')');
      ok(r.P.d31.some((x) => x.id === 'meat-french' && x.now && /отбейте мясо/.test(x.text)) &&
        r.P.d31.findIndex((x) => x.id === 'meat-french' && /отбейте/.test(x.text)) < r.P.d31.findIndex((x) => x.id === 'meat-french' && /Соберите/.test(x.text)),
        'F: мясо по-французски — «нарежьте и отбейте мясо» на «Сейчас», перед «Соберите»');
      ok(r.P.notes.some((n) => /Горячих много/.test(n)) && !/когда духовка освободится/.test(r.html), 'E: 9 горячих — «Горячих много…», без невыполнимого «прогрейте, когда освободится»');
    }
    await layout(r.f, 'план 31-го 18:00, 9 горячих 390');
    await r.ctx.close();
    r = await planAt('2026-12-31T13:00', HOT9, 21);
    {
      const note = r.P.d31.find((x) => x.id === 'chicken' && /Достаньте курицу/.test(x.text)), fin = r.P.d31.find((x) => x.id === 'chicken' && /поставьте в духовку/.test(x.text));
      ok(fin && (!note || fin.at - note.at >= 60 || !/нужен час/.test(note.text)), 'D: 31-го 13:00 — курица: «нужен час, чтобы согреться» только если до духовки есть час');
      ok(r.P.notes.some((n) => /Горячих много/.test(n)) && !/когда духовка освободится/.test(r.html), 'E: 31-го 13:00, 9 горячих — честная строка, без «прогрейте, когда освободится»');
    }
    await r.ctx.close();
    r = await planAt('2026-12-31T18:00', HOT9.concat('sharlotka'), 21);
    ok(r.P.late.includes('sharlotka') && /Шарлотка с яблоками Уже не успеть к чаю/.test(r.html) && !/Шарлотка с яблоками Уже не успеть к 21/.test(r.html),
      'C: шарлотку, если духовка занята до застолья, не успеть «к чаю», а не «к 21:00»');
    await r.ctx.close();
    // G: граница продажи — от выбранного часа застолья.
    for (const [now, t, offered] of [['2026-12-31T21:00', 23, true], ['2026-12-31T22:20', 23, false], ['2026-12-31T18:30', 19, false], ['2026-12-31T20:00', 21, true]]) {
      const { ctx, page, f } = await openWeb(browser, base, '', { today: now, query: '?nobanner' });
      await readyMenu(f);
      await f.evaluate((t) => { NYR.meta.plan = { day: 0, menu: '', t }; location.hash = 'plan'; }, t); await page.waitForTimeout(150);
      const has = await f.locator('#planAdBtn').count() > 0;
      ok(has === offered, 'G: ' + now.slice(11) + ', стол ' + t + ':00 — план за рекламу ' + (offered ? 'предлагаем' : 'уже не предлагаем'));
      await ctx.close();
    }
    {
      const { ctx, page, f } = await openWeb(browser, base, '', { today: '2026-12-31T20:30', query: '?nobanner' });
      await readyMenu(f);
      await f.evaluate(() => { NYR.meta.plan = null; location.hash = 'plan'; }); await page.waitForTimeout(150);
      ok(await f.locator('#planAdBtn').count() === 0 && await f.locator('[data-testid="plan-closed"] [data-act="table-set"][data-v="23"]').count() === 1, 'G: 31-го 20:30, час не выбран (21:00) — плана нет, но можно выбрать час позже');
      await f.locator('[data-act="table-set"][data-v="23"]').click(); await page.waitForTimeout(150);
      ok(await f.locator('#planAdBtn').count() === 1, 'G: выбрал 23:00 — план за рекламу снова предлагается');
      await ctx.close();
    }
    // Меню изменили на другой день — план закрылся, и об этом сказано.
    {
      const { ctx, page, f } = await openWeb(browser, base, '', { today: '2026-12-28', query: '?nobanner' });
      await readyMenu(f);
      await f.evaluate(() => { NYR.meta.plan = { day: 1, menu: NYR.state.menu.slice().sort().join(','), t: 21 }; NYR.flushSave(); location.hash = 'shop'; });
      await page.waitForTimeout(100);
      await f.evaluate(() => { location.hash = 'menu'; }); await f.waitForSelector('[data-act="menu-remove"]');
      await f.click('[data-act="menu-remove"][data-id="olivier"]');
      const tt = await f.locator('#toast').innerText();
      ok(/План по дням был для прежнего меню/.test(tt), 'убрал блюдо на другой день — сразу сказано: «План по дням был для прежнего меню…»');
      ok(await f.locator('[data-testid="plan-old"]').count() === 1, 'у кнопки плана — пояснение: план был для прежнего меню, вернёте блюда — откроется');
      await f.click('#toast [data-toast-undo]');
      ok(await f.evaluate(() => NYR.planOpen()), '«Вернуть» — прежний план снова открыт');
      await ctx.close();
    }
  }

  console.log('\n«Блюдо дня» и счётчик до Нового года:');
  {
    const day = async (d) => {
      const { ctx, f } = await openWeb(browser, base, '', { today: d });
      const r = await f.evaluate(() => ({ id: NYR.dishOfDay().id, cd: ((document.querySelector('[data-testid="countdown"]') || {}).textContent || '').replace(/\u00a0/g, ' '), card: document.querySelector('[data-testid="day-dish"]').getAttribute('href') }));
      await ctx.close();
      return r;
    };
    const a = await day('2026-11-11'), a2 = await day('2026-11-11'), b = await day('2026-11-12'), c = await day('2026-12-31'), d = await day('2027-01-02'), e = await day('2026-12-30');
    ok(a.id === a2.id && a.card === '#r/' + a.id, '«Блюдо дня» одинаковое у всех в этот день (' + a.id + ')');
    ok(a.id !== b.id, 'на следующий день — другое (' + b.id + ')');
    ok(a.cd === 'До Нового года 51 день' && e.cd === 'До Нового года 2 дня', 'счётчик: «' + a.cd + '», 30 декабря — «' + e.cd + '»');
    ok(c.cd === 'Новый год — уже этой ночью!' && d.cd === '', '31 декабря — «' + c.cd + '», после праздника счётчика нет');
    const cyc = await (async () => { const { ctx, f } = await openWeb(browser, base, ''); const r = await f.evaluate(() => { const s = new Set(); for (let i = 0; i < 40; i++) { window.__NYR_TODAY = new Date(2026, 10, 1 + i, 12).toISOString().slice(0, 10); s.add(NYR.dishOfDay().id); } return s.size; }); await ctx.close(); return r; })();
    ok(cyc === 40, 'за 40 дней подряд — все 40 блюд по разу');
  }

  console.log('\nОткрытка с меню:');
  {
    const { ctx, page, f, w } = await openWeb(browser, base, '');
    await readyMenu(f);
    await f.click('[data-act="postcard"]'); await f.waitForSelector('.postcard-img');
    await f.waitForFunction(() => { const i = document.querySelector('.postcard-img'); return i.complete && i.naturalWidth > 0; });
    const im = await f.evaluate(() => { const i = document.querySelector('.postcard-img'); return { w: i.naturalWidth, h: i.naturalHeight, png: i.src.startsWith('data:image/png') }; });
    ok(im.w === 1080 && im.h > 1000 && im.png, 'открытка — картинка PNG 1080×' + im.h);
    const px = await f.evaluate(async () => { const c = await NYR.makePostcard(true); const d = c.getContext('2d').getImageData(150, 470, 1, 1).data; return [d[0], d[1], d[2]]; });
    ok(!(px[0] === 235 && px[1] === 217 && px[2] === 193), 'на открытке фото блюд (не заглушка): пиксель ' + px.join(','));
    await layout(f, 'окно открытки 390');
    await shot(f, 'web-postcard');
    const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await f.click('[data-pc="save"]');
    const file = await dl;
    ok(file && /\.png$/.test(file.suggestedFilename()), 'вне ВК/ОК «Сохранить открытку» скачивает файл ' + (file ? file.suggestedFilename() : ''));
    const ev = await events(f);
    ok(ev.some((e) => e.name === 'share_clicked' && e.data.channel === 'postcard') && ev.some((e) => e.name === 'postcard_saved' && e.data.method === 'download'), 'отметки share_clicked channel=postcard, postcard_saved method=download');
    await kb(f).press('Escape'); await page.waitForTimeout(100);
    ok(await f.locator('#sheet:not([hidden])').count() === 0, 'Escape закрывает окно');
    await f.click('[data-act="postcard"]'); await f.waitForSelector('#sheet:not([hidden])');
    await page.goBack(); await page.waitForTimeout(150);
    ok(await f.locator('#sheet:not([hidden])').count() === 0 && await f.evaluate(() => location.hash) === '#menu', 'системная «назад» закрывает окно и оставляет в меню');
    ok(!w.errors.length, 'ошибок в консоли нет' + (w.errors.length ? ' ' + JSON.stringify(w.errors.slice(0, 3)) : ''));
    await ctx.close();
  }

  console.log('\n«О приложении», поддержка, метка 0+:');
  {
    const { ctx, page, f } = await openWeb(browser, base, '');
    ok(await f.locator('.app-foot a[href="#about"]').count() === 1 && /0\+/.test(await f.locator('.app-foot').textContent()), 'на главной внизу — «О приложении» и 0+');
    await f.click('.app-foot a'); await f.waitForSelector('[data-testid="support"]');
    const t = await f.locator('#app').innerText();
    ok(/0\+/.test(t) && /Звука в приложении нет/.test(t), 'метка 0+, «Звука в приложении нет»');
    ok(/Пишите нам: адрес поддержки скоро появится/.test(t), 'поддержка: пока заглушка (адрес заполнит Роман в config.js)');
    await f.evaluate(() => { APP_CONFIG.SUPPORT.email = 'help@example.ru'; location.hash = ''; location.hash = 'about'; }); await page.waitForTimeout(100);
    ok((await f.locator('.support-link').getAttribute('href')) === 'mailto:help@example.ru', 'с почтой в config.js — ссылка на почту');
    const ext = await f.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => !h.startsWith('#')));
    ok(ext.length === 1, 'единственная внешняя ссылка в приложении — поддержка (' + ext.join() + ')');
    await layout(f, 'о приложении 390');
    await ctx.close();
  }

  console.log('\nОтметки для статистики:');
  {
    const { ctx, page, f } = await openWeb(browser, base, '', { touch: true });
    await f.tap('.tile >> nth=1'); await page.waitForTimeout(100);
    await f.tap('.rcard >> nth=0'); await f.waitForSelector('.gal-next');
    await f.click('.gal-next'); await f.click('.gal-next');
    await f.click('[data-act="menu-add"] >> nth=0');
    await f.click('.step-photo >> nth=0'); await page.waitForTimeout(100); await kb(f).press('Escape');
    await f.evaluate(() => { location.hash = ''; }); await page.waitForTimeout(100);
    await f.click('[data-testid="day-dish"]'); await page.waitForTimeout(100);
    await f.evaluate(() => { location.hash = ''; }); await page.waitForTimeout(100);
    await f.click('.big-btn[href="#shop"]'); await f.waitForSelector('[data-act="share-shop"]');
    await f.click('[data-act="share-shop"]'); await page.waitForTimeout(100);
    const ev = await events(f);
    const names = [...new Set(ev.map((e) => e.name))];
    const ALLOWED = ['app_opened', 'first_input', 'recipe_opened', 'menu_added', 'menu_ready_used', 'shop_opened', 'share_clicked', 'postcard_saved',
      'plan_offer_shown', 'plan_opened', 'plan_unlocked', 'ad_reward_failed', 'gallery_swiped', 'photo_opened', 'fav_offer_shown', 'fav_result', 'performance_sample'];
    ok(names.every((n) => ALLOWED.includes(n)), 'только события из docs/analytics.md: ' + names.join(', '));
    const g = (n) => ev.filter((e) => e.name === n);
    ok(g('app_opened')[0] && g('app_opened')[0].data.entry === 'home' && g('app_opened')[0].data.returning === false, 'app_opened entry=home returning=false');
    ok(g('first_input')[0] && g('first_input')[0].data.input === 'touch' && typeof g('first_input')[0].data.seconds === 'number', 'first_input input=touch, seconds');
    ok(g('recipe_opened').some((e) => e.data.source === 'cat' && e.data.cat === 'hot') && g('recipe_opened').some((e) => e.data.source === 'day'), 'recipe_opened: id, раздел, откуда (cat, day)');
    ok(g('gallery_swiped').length === 1, 'gallery_swiped — один раз на рецепт за запуск');
    ok(g('menu_added')[0] && g('menu_added')[0].data.recipe_id && g('menu_added')[0].data.cat === 'hot', 'menu_added: id и раздел');
    ok(g('photo_opened')[0] && g('photo_opened')[0].data.kind === 'step' && g('photo_opened')[0].data.n === 1, 'photo_opened kind=step n=1');
    ok(g('shop_opened')[0] && g('shop_opened')[0].data.dishes === 1, 'shop_opened dishes=1 ' + JSON.stringify(g('shop_opened')));
    ok(g('share_clicked').some((e) => e.data.what === 'shop' && e.data.channel === 'copy'), 'share_clicked what=shop channel=copy');
    const flat = JSON.stringify(ev);
    ok(!/@|https?:|vk_user|sign=|github/.test(flat), 'в отметках нет адресов, почты, параметров запуска');
    ok(ev.every((e) => Object.values(e.data).every((v) => typeof v !== 'string' || v.length <= 40)), 'строки в данных — короткие');
    await ctx.close();
  }

  console.log('\nЭкраны: 390×844, 320×568, 844×390, 1280×800 — в браузере, во ВК и в ОК:');
  const VPS = [{ w: 390, h: 844, t: true }, { w: 320, h: 568, t: true }, { w: 844, h: 390, t: true }, { w: 1280, h: 800, t: false }];
  for (const vp of VPS) {
    for (const where of ['web', 'vk', 'ok']) {
      const label = where + ' ' + vp.w + '×' + vp.h;
      const o = { vp: { width: vp.w, height: vp.h }, touch: vp.t, today: '2026-12-29' };
      const { ctx, page, f, w } = where === 'web' ? await openWeb(browser, base, '', o)
        : await openHost(browser, base, 'client=' + where + '&platform=' + (where === 'ok' ? 'mobile_web_ok' : 'mobile_android'), o);
      await layout(f, label + ' главная (первый запуск)');
      if (vp.w === 390 || vp.w === 320) {
        const r = await f.evaluate(() => { const b = document.querySelector('.home-actions').getBoundingClientRect(); return b.bottom <= window.innerHeight; });
        ok(r, label + ': кнопки «Моё меню» и «Список покупок» видны сразу');
      }
      if (where === 'web') await shot(f, 'home-' + vp.w + 'x' + vp.h);
      await f.click('[data-act="intro-ok"]');
      await readyMenu(f);
      await layout(f, label + ' меню');
      if (where === 'web') await shot(f, 'menu-' + vp.w + 'x' + vp.h);
      // план (в браузере — имитация, во ВК/ОК — подставной клиент)
      if (where === 'web') { await f.click('#planAdBtn'); await watchFakeAd(page); }
      else await f.click('#planAdBtn');
      await f.waitForFunction(() => location.hash === '#plan' && document.querySelector('.plan-day'), null, { timeout: 20000 });
      await layout(f, label + ' план');
      if (where === 'web') { await bannerClear(f, label + ' план'); await shot(f, 'plan-' + vp.w + 'x' + vp.h); }
      await f.evaluate(() => { location.hash = 'menu'; }); await page.waitForTimeout(100);
      await f.click('[data-act="postcard"]'); await f.waitForSelector('.postcard-img');
      await f.waitForFunction(() => { const i = document.querySelector('.postcard-img'); return i.complete && i.naturalWidth > 0; });
      const fit = await f.evaluate(() => { const b = document.querySelector('.sheet .modal-box').getBoundingClientRect(); const i = document.querySelector('.postcard-img').getBoundingClientRect(); const s = document.querySelector('[data-pc="save"]').getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight + 1 && i.height > 120 && s.bottom <= window.innerHeight; });
      ok(fit, label + ': окно открытки помещается, картинка видна, «Сохранить» на экране');
      if (!fit) await shot(f, 'fail-postcard-' + label.replace(/\W+/g, '_'));
      if (where === 'web') await shot(f, 'postcard-' + vp.w + 'x' + vp.h);
      await kb(f).press('Escape');
      await f.evaluate(() => { location.hash = 'about'; }); await page.waitForTimeout(100);
      await layout(f, label + ' о приложении');
      ok(!w.errors.length, label + ': ошибок в консоли нет' + (w.errors.length ? ' ' + JSON.stringify(w.errors.slice(0, 3)) : ''));
      ok(!w.external.length, label + ': запросов наружу нет');
      await ctx.close();
    }
  }

  await browser.close();
  srv.close();
  console.log(fails ? '\nПРОВАЛЕНО: ' + fails : '\nВсё в порядке.');
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
