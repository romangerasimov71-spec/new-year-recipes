/* Скриншоты 600x1200 (книжные) для карточки ВК и ОК — по живой ссылке (или по своей: BASE=...).
   Chromium 400x800 x1.5, имитация баннера выключена (?nobanner), реклама-имитация короткая (?fakeadsec=1).
   Код приложения не меняется. Запуск: NODE_PATH=/opt/node-tools/node_modules node tools/release-shots.js */
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const OUT = path.resolve(__dirname, "..", "release", "vk", "screens");
fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.env.BASE || "https://romangerasimov71-spec." + "github.io/new-year-recipes/").replace(/\/?$/, "/");
const Q = "?nobanner&fakeadsec=1";

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, locale: "ru-RU" });
  const page = await ctx.newPage();
  const snap = async (n) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(OUT, n + ".png") }); console.log("снимок", n); };
  const top = () => page.evaluate(() => window.scrollTo(0, 0));
  const scrollTo = (sel, off) => page.evaluate(([s, o]) => { const e = document.querySelector(s); if (e) window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - o); }, [sel, off || 16]);
  const waitImgs = () => page.waitForFunction(() => Array.from(document.images).filter(i => i.getBoundingClientRect().top < 1200).every(i => i.complete && i.naturalWidth > 0), null, { timeout: 20000 }).catch(() => {});

  // 1. Главная (после «Как пользоваться»)
  await page.goto(BASE + Q);
  await page.waitForSelector("[data-act], .big-btn, .rcard", { timeout: 20000 });
  const intro = page.locator('[data-act="intro-ok"]');
  if (await intro.count()) { await intro.first().click(); await page.waitForTimeout(500); }
  await top(); await waitImgs(); await snap("1-glavnaya");

  // 2. Рецепт: главное фото
  await page.goto(BASE + Q + "#r/olivier");
  await page.waitForTimeout(800); await top(); await waitImgs(); await snap("2-retsept");

  // 3. Рецепт: шаги с фото
  await scrollTo('[data-act="step"]', 110);
  await page.waitForTimeout(600); await waitImgs(); await snap("3-shagi");

  // 4. Меню + «Сколько блюд нужно»
  await page.goto(BASE + Q + "#menu");
  await page.waitForSelector('[data-act="ready-menu"]', { timeout: 15000 });
  await page.click('[data-act="ready-menu"]');
  await page.waitForSelector('[data-testid="howmany"]', { timeout: 15000 });
  await page.waitForTimeout(5000); await top(); await waitImgs(); await snap("4-menyu");
  await scrollTo('[data-testid="howmany"]', 70); await waitImgs(); await snap("5-skolko-blyud");

  // 5. Список покупок
  await page.goto(BASE + Q + "#shop");
  await page.waitForTimeout(900); await top(); await snap("6-pokupki");

  // 6. План готовки по дням: открыть за (короткую имитацию) рекламу
  await page.goto(BASE + Q + "#plan");
  await page.waitForTimeout(800);
  const adBtn = page.locator('[data-act="plan-ad"]');
  if (await adBtn.count()) {
    await adBtn.first().click();
    await page.waitForFunction(() => /досмотрена/i.test((document.querySelector(".fake-ad") || {}).innerText || ""), null, { timeout: 20000 });
    await page.locator(".fake-ad-close").click();
    await page.waitForTimeout(1200);
  }
  await top(); await snap("7-plan");

  // 7. Открытка с меню
  await page.goto(BASE + Q + "#menu");
  await page.waitForSelector('[data-act="postcard"]', { timeout: 15000 });
  await page.click('[data-act="postcard"]');
  await page.waitForTimeout(2500); await snap("8-otkrytka");

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
