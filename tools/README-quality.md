# Проверка качества собственного production-кода

Локальная проверка и CI используют одни блокирующие команды:

```sh
npm ci --ignore-scripts
npm run check-quality
npm run check-quality:controls
```

`scope` в `eslint.config.mjs` задаёт production-каталоги. Все существующие и
новые tracked/untracked `.ts`, `.js`, `.mjs`, `.cjs` обнаруживаются автоматически.
Vendor, node_modules, generated и \_generated не входят в собственный код.
Пустой scope и `strict: false` запрещены. Структурные правила действуют на весь
собственный production-код: `complexity <= 30`, `max-depth <= 5`, `max-params <= 5`.
Исключение PL — существующий именованный ABI `renderPublicBody` с семью аргументами.
Списка успешно прошедших старых файлов, baseline и подавлений нет.

Typed ESLint проверяет `no-explicit-any`, `no-unsafe-type-assertion`,
`no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-call`,
`no-unsafe-member-access`, `no-unsafe-return`, `switch-exhaustiveness-check`.
`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` и inline отключения ESLint
завершают gate ошибкой. Линтер печатает конкретные диагностики и считает
предупреждения ошибками. Типизация не заменяется произвольными any или stub API.

Для TypeScript строится строгая программа из реального `deno info --json`
graph, `deno types`, Quarto import map и фактических публичных providers.
`CORE`, `PL`, `QRC`, `DOWNLOAD`, `SITE`, `COURSE_PERFORMANCE_SOURCE` позволяют
указать source roots; существующая переданная import map сохраняет приоритет.
Проверяются диагностики собственных production `.ts`. Декларации `.d.ts`
обслуживают реальные типы потребителей; `skipLibCheck` пропускает их отдельную
семантическую проверку. Полные существующие Deno/source gates сохраняются.

JavaScript проверяется отдельной строгой `allowJs/checkJs` программой с
действующим `typecheck/javascript.json` либо `typecheck/browser.json` и настоящими
DOM/Node declarations. Deno globals в браузерный JS не подмешиваются. Структурные
и typed правила одинаково действуют на обнаруженный собственный JS. PL
`application/native-validators.js` — standalone AJV artifact генератора; его
воспроизводимость и потребляющий декларации API проверяются существующими
контрактами generated validators, а не линтером минифицированного output.

TypeScript в npm devDependencies — совместимый peer parser/ESLint. Это отдельная
зависимость линтера; системный `tsc`, Compiler API, установленный CLI и Quarto/Deno
сохраняют продуктовые проверки. Точная версия host TypeScript не требуется.
TypeScript 7.0.2 фактически отвергнут текущим parser peer `<6.1.0`; принудительная
установка с `--force` или `--legacy-peer-deps` не используется.

Dependency-cruiser проверяет разрешаемый статический TS/JS import graph,
публичные границы providers и runtime cycles. Type-only цикл допускается;
импорт внутренних provider modules запрещён и для type-only связи. Динамически
вычисленный импорт не объявляется статически доказанным. Lua, Python и shell
сохраняют собственные существующие language-server/typechecker/lint gates;
прохождение TS graph не означает проверку всего Lua или dynamic graph.

`check-quality:controls` сначала требует чистый production gate, затем по одному
создаёт новые временные production-файлы и запускает ту же `check-quality`
команду. Независимо проверяются каждое правило typed/structural набора, запрет
подавления, malformed AST, цикл и импорт внутренностей. Выход должен быть
ненулевым с диагностикой именно проверяемого правила. Файлы удаляются в `finally`.
Эту команду нельзя запускать одновременно с другим source gate того же checkout.
В CI она обязательна после положительного gate. Итоговый JSON положительного
входа сообщает TS/JS/structural counts и реальные версии parser/ESLint/compiler.

## Форматы и проверки остальных языков

Та же `npm run check-quality` после typed ESLint и dependency-cruiser блокирует
любой сбой инструментов и проверяет tracked/untracked собственные файлы:
Prettier 3.8.1 — TS/JS/MJS/CJS, JSON, YAML и Markdown; Ruff 0.17.5 — Python;
StyLua 2.6.0 — Lua; shfmt 3.14.1 — shell; Taplo — TOML. У каждого языка один форматтер.
Форматирование вызывается отдельно стандартным `--write`/`-w`; gate ничего
не перезаписывает. CJS/MJS также проходят `node --check`. Все собственные tools/tests и корневые
CJS/MJS config-файлы входят в строгий `checkJs` через `tsconfig.tools.json`;
ошибка типа в новом helper проверяется отдельным отрицательным control.

Python в `tools`, `tests` и runtime trusted-git автоматически входит в строгий
Pyright. Ruff блокирует E4/E7/E9/F, B, ANN (включая `Any` в аннотации),
blind `type: ignore`/`noqa` и неиспользованные `noqa`. Новые Python-файлы в этих
каталогах не требуют расширять список. LuaLS запускает canonical проверку из
`COURSE_PERFORMANCE_SOURCE`/`PERFORMANCE` с настоящими Quarto/Pandoc types и
полным каталогом расширения, исключая vendor. Luacheck использует Lua 5.4 и
явные Quarto/Pandoc globals; предупреждения блокируют gate. Длину строк задаёт
StyLua, поэтому Luacheck повторно не задаёт длину для LuaDoc-аннотаций.
ShellCheck работает с `--norc --enable=all --severity=style` и shebang каждого
файла. yamllint проверяет YAML строго, actionlint — семантику всех workflows
и embedded shell через ShellCheck. Переносы и длину YAML задаёт Prettier;
структура, duplicate keys, truthy, отступы и прочие содержательные правила
остаются в yamllint. `on` явно разрешён как имя GitHub Actions trigger.

Закреплённые upstream PL schemas, Zod vendor и generated validators остаются
внешними/генерируемыми входами существующих provenance/reproduction gates.
Исторический SP snapshot `6b4ffbe` в `application/trusted-git` и
`tests/fixtures/git-recipes` сохраняет точные source segments и байты:
`python tests/trusted-git-helper.py <System-Practice>` проверяет SHA256, размер,
Git blob/tree, import order, текст каждого AST segment и функциональное Git
состояние до и после. Static CI получает этот точный commit отдельным стандартным
checkout и обязательно выполняет provenance gate. Это исключение относится только к названным закреплённым
снимкам, не ко всем helper-файлам. Строгие типы двух runtime-модулей сохраняются.
Bridge TS/Lua имеет canonical владельца Performance; формат и изменения
переносятся оттуда, Lua-копия проходит StyLua/Luacheck/LuaLS в потребителе.

`check-quality:controls` дополнительно проверяет новый `.mjs` с unsafe assignment,
новый MJS helper с ошибкой возвращаемого типа, новые Python с B006 и ошибкой возвращаемого типа, Lua с неизвестным global,
shell с unquoted variable, YAML с truthy и workflow с неизвестным context.
Отдельные controls проверяют новый неформатированный TS, ослабление JS config
и ненулевой выход настоящего subprocess-инструмента. Временные production
файлы и изменённый JS config восстанавливаются в `finally`; заглушка отказавшего
инструмента живёт в отдельном `/tmp` каталоге. Положительный gate всегда
выполняется перед controls.

Все собственные `.toml`, включая `.stylua.toml` и `pyproject.toml`, автоматически
обнаруживаются и проходят `taplo lint --no-auto-config --no-schema` и
`taplo fmt --no-auto-config --check`. Проверяется синтаксис и стандартный формат;
внешние schema catalogs не требуются. CI устанавливает стандартный
`@taplo/cli@0.7.0`. Два отдельных controls создают новый TOML с неверным
синтаксисом и с корректными, но неформатированными данными.

ESLint 10 использует совместимый parser peer; scoped overrides `minimatch`
относятся только к ESLint и `@typescript-eslint/typescript-estree`. Штатные
`npm ci`, `npm ls` и `npm audit` проверяют разрешённый lock без `--force`
или `--legacy-peer-deps`.

Прямой Ajv закреплён на `8.20.0` с исправлением GHSA-2g4f-4pwh-qvx6.
Canonical generator и provenance указывают ту же версию; повторная генерация
сохраняет точные прежние JS/declaration bytes. Закреплённые официальные схемы,
API и смысл оценивания сохраняются. Проверены реальные exported payloads всех
четырёх validators, обязательные поля и отрицательные границы типов.
