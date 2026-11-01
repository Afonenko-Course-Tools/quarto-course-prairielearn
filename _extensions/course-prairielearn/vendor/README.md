# Локальная runtime-зависимость

`zod/` содержит ESM, лицензию и metadata `zod@4.6.7`. Точный tarball и SHA-512
закреплены в `../package-lock.json`. Runtime ESM сохранён без изменений;
в `.d.ts` ссылки `.js` заменены на `.d.ts` для локального Deno.

`tools/vendor-pl-zod.py TAR_GZ` сверяет lock перед записью. Render использует
относительные импорты и не загружает npm-зависимости из сети. Сторонние bytes
не форматируются.
