> Исторический план/исследование. Актуальный маршрут от 8 октября 2026: [план владельца](2026-10-08-implementation.md).
> Исходный текст сохранён без правок; его старые статусы и конфликтующие правила не действуют.
> Нужные материалы сохранить в Git до удаления из активной ветки.

# План рефакторинга диагностики PrairieLearn — 7 октября 2026

Для исполнения: subagent-driven-development либо executing-plans по выбранному
способу. **Цель:** русские сообщения с вопросом/работой/binding и исходной
диагностикой Core/CUE/Pandoc. **Архитектура:** Core activation/CUE facts;
CLI installed Core collectExport → buildBodies → exportPrairieLearn → staged delivery.
**Средства:** нынешние Lua/Deno/CUE/Pandoc; Java/Gradle только у demo.
**Основание:** [общий план](../../../specs/course-change-plan.md#исследование-и-план-рефакторинга-7-октября-2026).
База main `c655501`, подтверждена через GitHub.

Условия: PL001_externalAssessmentMembers, Core/Body и ADAPTER сохраняются;
не вводить общую формулу оценки или новые types; negative fixtures только tests.
Инструментальная CI-матрица остаётся, нового warning gate нет.
При ревью проверить: missing member, foreign Core failure, неверный binding,
unsupported body/resource, отказ внешней команды без конечного output.

## L1 Контекст activation и native CUE

Изменить: `_extensions/course-prairielearn/validate.lua`, `native.lua`,
`validate-paths.ts`, `contract.lua`, `assessment.lua`; при необходимости filter.
`native.vet(value,definition)` допускает optional третий context с input file,
exercise/work/field; текущие predicates остаются в CUE и контракте.

- [ ] В native-model/native-ordinary/identity/check tests закрепить прежний
  CUE ID, source/work/question context и сохранение standalone ordinary render.
- [ ] Перевести свои обёртки, сохранить исходный CUE вывод без regex-кодирования
  и без копирования его ограничений в TypeScript/Lua.
- [ ] Выполнить `quarto run tests/native-model.ts /home/tolya/course-tools/quarto-course`,
  native-ordinary, identity и check с тем же Core аргументом; PASS, проверка изменений и коммит.

## L2 Export failures и CLI

Создать: `_extensions/course-prairielearn/application/diagnostics.ts`:
`diagnostic(code,message,context?,cause?) → Error & {code:string}`.
Изменить: `application/export.ts`, `entrypoints/export.ts`.
`exportPrairieLearn(p,context,binding,output)` сохраняет нынешнюю сигнатуру;
fail остаётся локальным, ADAPTER получает вопрос/source/binding field/hint.
Новый `PL.INPUT_INVALID` относится только к неименованным CLI guards.

- [ ] В tests/export.test.ts проверить known ADAPTER с компонентом и полем,
  foreign Core/Pandoc ID/cause, cleanup staging и отсутствие нового output.
- [ ] Добавить контекст из уже известных фактов и русский текст, отделить
  внешнюю ошибку от capability/binding отказа. Узкий CLI catch не гасит unknown stack.
- [ ] Выполнить `deno test --no-config --allow-read --allow-write --allow-run --allow-env tests/export.test.ts`,
  installed CLI и check script на обеих версиях. Проверка изменений и коммит.

## L3 Документация и Java-группа

Создать: `docs/diagnostics.md`; изменить: README, `docs/authoring.md`,
`examples/java-gradle/_quarto.yml`, `examples/java-gradle/bank/_quarto.yml`,
index/bank QMD и README группы. У bank собственный lang и русский book.title.

- [ ] Русские объяснения, корректные примеры и таблица ID без контрпримеров;
  native lang/source, отдельные требования HTML/export/исполнения.
- [ ] Сохранить Java identifiers/API/bindings и оригинальный Gradle output.
  Ошибки Java demo не переклассифицировать в собственные PL semantic IDs.
- [ ] Выполнить `CORE=/home/tolya/course-tools/quarto-course bash tools/check-java.sh`
  с настоящими Gradle assertions. Проверка изменений, PR и новый immutable ready release
  на проверенных pinned Core/PL dependencies; consumer обновляет URL явно.
