/* Пустышка. Playgama Bridge для ВК сам грузит VK Bridge с unpkg.com; в playgama-bridge.js адрес
   заменён на этот файл (строка "js/vk-bridge-loaded.js"), потому что VK Bridge уже загружен раньше —
   js/vk-bridge.min.js в <head> (и VKWebAppInit отправлен сразу, см. js/vk-start.js).
   Так приложение не зависит от unpkg.com, а VKWebAppInit уходит в первые миллисекунды. */
