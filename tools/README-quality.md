# Проверка качества собственного TypeScript

Обычная локальная команда и CI используют один блокирующий вход:

```sh
npm ci --ignore-scripts
npm run check-quality
```

Команда проверяет фактические tracked и untracked исходники production из `scope`
в `eslint.config.mjs`. Пустой scope и `strict: false` завершаются ошибкой.
Полный выбранный production scope получает typed ESLint: `no-explicit-any`,
`no-unsafe-type-assertion`, `switch-exhaustiveness-check`, запрет подавляющих
`@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` comments. Inline отключения
правил запрещены; baseline известных нарушений не используется.

Типы берутся из фактического `deno info --json` graph и настоящего `deno types`.
Импорты Quarto берутся из установленного `quarto --paths`; существующие карты
публичных providers сохраняются. Компилятор строит строгую программу с действующими
compilerOptions проекта. Диагностики собственного production scope блокируют
проверку; сторонние библиотеки читаются для разрешения типов, но не объявляются
собственным проверенным кодом. Для объединённых Deno declarations удаляются
только повторные ссылки на уже включённые Deno libs. `skipLibCheck` пропускает семантическую проверку declarations (в том числе
собственных .d.ts адаптеров и сгенерированных validators); их реальные типы
используются при проверке потребляющих production .ts файлов. Полные Deno
source checks сохраняются отдельно.

TypeScript в npm devDependencies обслуживает parser/ESLint. Это не компилятор
продуктового toolchain: существующие Deno, Quarto, системный `tsc` и Compiler API
проверки сохраняют свои команды. Точный host TypeScript не требуется. Финальный
JSON печатает фактические версии TypeScript/parser/ESLint, число типизированных
файлов, число файлов со structural rules и размер прочитанного Deno graph.

`complexity <= 30`, `max-depth <= 5`, `max-params <= 5` блокируют явный законченный
production-пакет `structuralScope` в конфигурации. Эти ограничения пока не покрывают
все старые функции. Это ограничение охвата, а не baseline нарушений: расширение
scope требует содержательной декомпозиции оставшегося долга. Новые файлы в этих
пакетах нужно включать в structuralScope и обычные строгие source inventories.

Dependency-cruiser проверяет настоящий TS/JS import graph и запрещает runtime
циклы во всём production scope. Циклы, содержащие `import type`, разрешены;
публичные границы проверяют и type-only imports. Vendor, node_modules,
generated и _generated исключены. Lua, shell, Python, JS checkJs, installed
копии и hooks/config loading имеют собственные существующие проверки: TS graph
не объявляется проверкой динамически вычисленных импортов или всего расширения.

Новые source файлы не получают произвольных any/stub declarations для зелёного
линтера. Полные старые строгие команды сохраняются отдельно и проверяют также
тесты и служебный код, не входящие в production ESLint scope.

Typed scope — все собственные TS модули `_extensions/course-prairielearn`.
Структурный пакет — перечисленные export/course/publication модули.
Существующий публичный ABI `renderPublicBody` имеет семь аргументов; только
его файл получает ограничение max-params 7, остальные structural файлы — 5.
Старые native-course/native-workspace/grading-policy и другие не перечисленные
модули пока не входят в structuralScope. Импорты Core/QRC/Download разрешены
только через публичный `public.ts`.

С картой фактических CI providers применяется та же команда:

```sh
npm run check-quality -- .ci-deps/pl-native-imports.json
```

Без аргумента existing `native-core-import-map.ts` строит карту соседних source
репозиториев. Полный строгий source вход остаётся `deno run --no-config -A
 tools/check-types.ts <import-map>` и существующий `typecheck:tools` для CJS.
