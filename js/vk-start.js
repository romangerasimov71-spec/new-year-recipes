/*
 * vk-start.js — самое первое, что выполняется внутри ВК и ОК (подключён в <head> сразу после
 * js/vk-bridge.min.js, до картинок и до Playgama Bridge).
 *
 * 1. VKWebAppInit — сразу, в первые миллисекунды (требование ВК). VK Bridge лежит рядом с приложением,
 *    не на unpkg.com: если unpkg недоступен, приложение всё равно запускается.
 * 2. Повторный VKWebAppInit от Playgama Bridge не уходит второй раз — он получает тот же ответ.
 * 3. VKWebAppGetUserInfo (имя и фото) Playgama Bridge просит сам, но приложению это не нужно —
 *    запрос не отправляется (правило ВК 1.1.2: не просить лишних данных).
 * 4. Где запущены: window.NYR_LAUNCH = { inVk, ok, platform, lang }. ОК определяется по
 *    vk_client=ok или vk_platform=*_ok (Playgama Bridge называет ОК тоже «vk»).
 *    Язык ВК (vk_language) только запоминается: приложение всегда на русском.
 * Вне ВК/ОК (GitHub Pages, обычный браузер) ничего не отправляет.
 */
(function () {
  "use strict";
  var q = null;
  try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
  var get = function (k) { return q ? (q.get(k) || "") : ""; };
  var has = function (k) { return !!(q && q.has(k)); };
  var inVk = has("vk_app_id") || (has("api_id") && has("viewer_id") && has("auth_key"));
  var platform = get("vk_platform");
  var L = window.NYR_LAUNCH = {
    inVk: inVk,
    ok: inVk && (get("vk_client") === "ok" || /_ok$/.test(platform)),
    platform: platform,
    lang: get("vk_language"),
    initSentAt: -1,
    initResult: ""
  };
  var b = window.vkBridge;
  if (!inVk || !b || typeof b.send !== "function") return;

  var send = b.send.bind(b);
  var initP = null;
  b.send = function (method, params) {
    if (method === "VKWebAppInit") {
      if (!initP) {
        L.initSentAt = (window.performance && performance.now) ? Math.round(performance.now()) : 0;
        initP = Promise.resolve().then(function () { return send("VKWebAppInit", params || {}); });
        initP.then(function () { L.initResult = "ok"; }, function () { L.initResult = "error"; });
      }
      return initP;
    }
    if (method === "VKWebAppGetUserInfo") return Promise.resolve(null);
    return send(method, params);
  };
  b.send("VKWebAppInit");
})();
