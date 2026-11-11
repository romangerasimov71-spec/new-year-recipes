// Адаптер набора проверки рекламы (tools/ads-test — копия kits/ads-test из game-studio) для «Новогоднего стола».
//   python3 -m http.server 8790 --bind 127.0.0.1 &
//   NODE_PATH=/opt/node-tools/node_modules node tools/ads-test/run.js --url http://127.0.0.1:8790/index.html --adapter tools/ads-adapter.js
//
// Награда — «План готовки по дням» (меню → кнопка «Составить план по дням»).
// Опоздавшая реклама (началась после того, как мы перестали ждать), досмотренная до конца, даёт план:
// человек её честно посмотрел (как в соннике).
// Межстраничной рекламы нет (решение Романа: только реклама за план и баннер) — случаи interstitial-* не проверяются.
// «Уровней» и «попыток» нет: план привязан к меню, а не к экрану, поэтому случаи late-restart / late-win /
// late-switch («ушёл с попытки — награды нет») к приложению не относятся (SKIP).
// Звука в приложении нет — проверка звука набора ничего не находит, это нормально.
const trial = async (loc) => {
  try { await loc.click({ trial: true, timeout: 500 }); return true; } catch (e) { return false; }
};
const ready = (page) => page.waitForFunction(() => window.NYR && NYR.isReady(), null, { timeout: 20000 });
const waiting = (page) => page.evaluate(() => document.body.classList.contains('is-ad-wait'));

module.exports = {
  name: 'Новогодний стол: рецепты',
  viewport: { width: 390, height: 844 },
  contextOptions: { locale: 'ru-RU' },
  rewardTimeoutMs: 12000,          // js/config.js REWARDED_WAIT_SEC
  lateRewardGranted: true,

  async prepare(page) {
    await ready(page);
    // Чистое меню из 5 блюд, план ещё не открыт.
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();
    await ready(page);
    await page.evaluate(() => { location.hash = 'menu'; });
    await page.waitForSelector('[data-act="ready-menu"]');
    await page.click('[data-act="ready-menu"]');
    await page.waitForSelector('#planAdBtn');
  },

  async clickRewarded(page) { await page.click('#planAdBtn'); },

  // сколько раз за этот запуск выдана награда (план открыт)
  async rewardCount(page) { return page.evaluate(() => NYR.adGrants()); },

  // приложение отзывается: кнопка «+» гостей нажимается (ничем не закрыта)
  async boardWorks(page) {
    if (await waiting(page)) return false;
    return trial(page.locator('#app [data-act="guests+"], #app .btn:visible').first());
  },

  // «Назад» в шапке нажимается, нет окна «Загружаем рекламу»
  async buttonsWork(page) {
    if (await waiting(page)) return false;
    return trial(page.locator('#hdr-back'));
  },

  async isPaused(page) { return page.evaluate(() => Platform.isPaused()); },
};
