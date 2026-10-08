---
type: plan
component: course-prairielearn
status: in-progress
updated: 2026-10-08
---

# PrairieLearn: план владельца

Статус: текущие runtime и авторские документы подготовлены на рабочей ветке;
финальные совместные проверки, merge/CI и выпуск остаются отдельными gates. Выполнять пункт 10 и затем
пункты 12–13/17–18 [линейного плана](../../../quarto-course/docs/plans/2026-10-08-course-tools-implementation.md).
[Текущие контракты Core](../../../quarto-course/spec/index.md)
задают поля банка/работ/назначений. Quarto 1.11.5 / CUE 0.17.1;
широкую Windows CI matrix не добавлять.

## Изменения, документация и проверки

Согласовать `_extensions/course-prairielearn/application/export.ts`, `_extensions/course-prairielearn/{assessment,validate,native,contract}.lua`, `_extensions/course-prairielearn/validate-paths.ts`, `_extensions/course-prairielearn/entrypoints/export.ts`, при необходимости filter, с новым Core bank/assignment/body shape. Нынешний guard `q.visibility !== public` защищает participant payload, его не ослаблять. Добавить отдельное statementVisibility из банка: restricted назначенное условие экспортируется в safe participant payload без закрытых partitions и page preview. Сохранить выбранную work question closure, exact native resource slots, per-question binding и разделение client/tests/reference. Не вводить ручное оценивание, новые platform activities или общий grading backend.

Свежий main уже содержит `_extensions/course-prairielearn/application/diagnostics.ts`, CLI и cleanup staging; сверить существующий optional known context input/exercise/work/field в native.vet, CUE predicates остаются в `_extensions/course-prairielearn/spec/prairielearn.cue`. Сохранить PL001_externalAssessmentMembers/Core/ADAPTER IDs и исходный CUE/Pandoc/Gradle output, добавить контекст и узкую CLI границу; PL.INPUT_INVALID только input guards. Проверить cleanup staging и отсутствие конечной delivery после отказа. При изменении словаря обновить `_extensions/course-prairielearn/contract.json`, CUE, `tools/sync-contract.ts`, fixtures и `docs/authoring.md` совместно.

Обновить `README.md`, уточнить существующий `docs/diagnostics.md`, owner plan, `tests/{check,identity,native-model,native-ordinary}.ts`, `tests/export.test.ts`, `examples/java-gradle` configs/QMD/build.ts/bindings. Own bank difficulty/time обязательны; ordinary document tests остаются отдельной проверкой вне opt-in. Native lang/source links не меняют Java identifiers/API.

Проверки: `quarto run tools/sync-contract.ts --check`; `quarto run tests/native-model.ts /home/tolya/course-tools/quarto-course`, аналогично `native-ordinary`, `identity`, `check`; `deno test --no-config --allow-read --allow-write --allow-run --allow-env tests/export.test.ts`; `CORE=/home/tolya/course-tools/quarto-course bash tools/check-java.sh`. Последняя проверка включает installed CLI и настоящие Java/Gradle assertions. В repo нет `tools/check.sh`; не писать в плане несуществующую команду.

## Завершение

Оформить актуальный индекс спецификаций, README и собственный справочник
диагностик; примеры показывают правильную русскую авторскую разметку.
Старые plans/probes сохранить в Git до удаления из активной ветки.

Сверить свежие required checks и owner PR, слить в main и проверить merged SHA.
Выпустить новую версию с точными уже выпущенными зависимостями; готовую группу
демо, если она есть, выпускать отдельным проверенным asset. Старые Releases
не заменять. Финальная очистка веток только после общего маршрута:
main + служебная gh-pages, если используется, + heads OPEN automatic PR.
Здесь сохранить commit/PR/tag/SHA, фактические проверки и ссылки на готовые assets.

## Выполнение шагов 1–2 — 8 октября 2026

Общий старт: 02:36 Europe/Minsk; дедлайн: 11:36. Рабочая ветка — `feat/authoring-model-20261008`, создана в существующем checkout; дополнительные репозитории/worktrees не создавались.

- [x] Fresh `git fetch origin --tags`, live remote heads, releases и OPEN PR: сохранены в [inventory/history](../history/2026-10-08/README.md). Открытых PR на момент чтения нет. Все старые refs/tags и пользовательские worktrees оставлены.
- [x] Dirty tracked/untracked owner-планы и выбранные root mixed документы сохранены exact snapshots: `be5b1327b4610121291384c65172dd7d7e10ac8a`. [Provenance](../history/2026-10-08/provenance.json) содержит исходный путь, mtime, bytes и SHA-256; старые evidence не считаются текущим CI.
- [x] Свежий `origin/main` `ff4797947fc0d802ef1c5f7cef8cde2a41918884` объединён в рабочую ветку коммитом `7d7094b05aa86498df0da415a31d49b6e8aad88c`. В адаптерах add/add касается только старого diagnostics-плана; upstream вариант принят после сохранения исходного, оба остаются в Git.
- [x] Добавлен [spec/index.md](../../spec/index.md), type/component/status, links из README, явный main unreleased и accepted-next. Прежний план и historical snapshots удалены из активной ветки после exact Git-byte проверки; карта истории и исходные root файлы сохранены.

Текущая база: выпуск `v2.1.1` (`916fe55cbedcf9e9f49ecefd2ba908add2d346b5`), descriptor `2.1.1`, ready demo `demo-20261007-ru1`.

Проверки: exact bytes/SHA-256 всех выбранных root snapshots; Git whitespace check; локальная проверка новых документационных links/меток; diff относительно свежего origin/main ограничен документацией и историей. Runtime suites и CI не запускались: эти шаги не меняют поведение. Meaningful ignored авторских исходников вне известных generated/cache/dependency trees не найдено; BUILD и hashes ready archives учтены, существующие результаты оставлены на диске.

Сохранение истории завершено до cleanup: исходные тексты восстанавливаются по preservation/merge SHA, а active docs/spec содержат действующие документы и dated owner-план. Root источники, runtime, generated результаты и пользовательские worktrees не удалялись.

Ограничение исполнителя: текущий агент наследует настройку родителя; отдельное включение ultra для этой документационной подзадачи через доступные инструменты не выполнялось. Блокеров шагов 1–2 нет; реализация следующего контракта, проверки, новые pins/releases и публикация ожидают последовательных шагов 10/12–18.


## Подготовка документации пункта 10 — 8 октября 2026

Документационный исполнитель работает по принятым Core решениям; модель не
менялась. Добавлена [сохранённая подготовка авторства](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/blob/d173cb6b0a36ac74c0101a260de5e16b6150a51a/docs/authoring-next.md) `accepted-next`,
ссылки из README и индекса. Существующие current API/контракты не объявлены
мигрированными до проверки runtime. Примеры на этой ветке предназначены для
следующей модели; native ordinary Quarto сохранён вне bank opt-in.

- Свежая проверка: `git diff --check`; 34 локальных Markdown-ссылок
  README/spec/docs/плана/README примеров существуют; 10 авторских YAML
  файлов успешно прочитаны. Проверка исключает generated/dependency деревья.
- Активные примеры не содержат старых kinds exam/handout, solution `for`,
  fixture sentinel/literal текста и Quarto 1.10.x. Русский lang сохраняется,
  публичные native проекты задают `fail-if-warnings: true`.
- Машинные descriptors/workflows и runtime/tests не изменялись этим исполнителем.
  Старые выпущенные dependency/demo/source pins сохранены как baseline;
  **новые release pins ожидают решения о версиях и фактических Releases**.

- Статически сверены банковские области: `examples/java-gradle/bank` — 3 задач / 2 работ, `examples/course` — 5 задач / 2 работ. Для каждой задачи собственные difficulty/time и эффективная open/restricted policy; ID состава существуют, не повторяются, test/practical назначают только restricted. Это проверка разметки, не native AST/render.

Full dependent suites/CI/render против меняющегося Core здесь не запускались.
Следующий runtime исполнитель выполняет команды выше, проверяет текущие
student/full outputs и выбранный экспорт, после чего документальная подготовка
переносится в current README/контракт. Merge/push/release/публикация не выполнены.

Дополнительно: `deno fmt --check examples/java-gradle/build.ts` — прошёл. Переведены только два сообщения авторского build script; Java API/имена не менялись.

Координация runtime: главы работы и контрольного банка теперь входят в shared
native состав student/full. Student должен показывать title/assessment-preview,
но не restricted body/ссылки назначений/их ресурсы/search. Старые demo-profile
assertions отсутствия самой страницы работы требуется заменить проверкой этой
проекции. Добавленный открытый разбор не входит в выбранную delivery/PDF/XML.

Ruling: process/diagnostics/CLI/cleanup уже существуют в свежем main; старое указание создать их заменено сверкой фактической границы.


## Текущие контракты и release-pinned примеры — 8 октября 2026

Документальный commit: `29c47efe05d021b4816b1f0638681a68a43c6218`.
Принята версия `v3.0.0`; descriptor подготовлен отдельным runtime
исполнителем. На момент этой записи новые Releases ещё не опубликованы;
merge/main, финальный CI, готовая release-сборка и публикация выполняются root
по линейному плану. Эта запись не подтверждает общий финальный integration gate.

- Правила подготовки перенесены в действующие README/spec/тематические docs.
  `current` описывает код того же ref; документация выпуска читается из того же
  immutable tag. В README/examples нет временных заявлений о доступности Release.
- `docs/authoring-next.md` удалён только после проверки точного Git blob
  `8397130f2084eca1c59dd70a230b2ca3ed82bed0` на commit
  `d173cb6b0a36ac74c0101a260de5e16b6150a51a`; восстановление записано в карте истории.
- Install/source/BUILD pins задают Core `v4.0.0`, Publisher `v5.0.0`, QRC `v3.0.0`
  и свою новую версию там, где эти зависимости используются. Native source-ссылки
  ведут на tool tag производителя; планируемый demo tag — `demo-20261008`,
  из того же clean producer SHA с `BUILD.sourceDirty: false`. Download не получает
  собственного demo Release. Механизм provenance/build runtime не менялся.
- Свежая статическая проверка: 14 YAML/front matter без повторных
  ключей, 32 существующих локальных Markdown-ссылок, 3 native
  source-конфигураций. У всех public base `_quarto.yml` — `lang: ru` и
  `fail-if-warnings: true`. Активные авторские документы не содержат Quarto 1.10,
  старой requirements карты/kinds, solution for и переходных contract ссылок.
- examples/java-gradle/bank: 3 задач, 2 работ, 2 назначений; examples/course: 5 задач, 2 работ, 4 назначений
  Это проверка авторской разметки и ссылок, не native AST/render.
- `git diff --check` и staged whitespace — PASS. `deno fmt --check`
  существующих build/build-info scripts — PASS там, где они есть. Публичные
  API, runtime/tests/.github/CI этим документальным исполнителем не изменены.

Команды проверки и полные результаты: `/tmp/consumer-docs-final-20261008/verify.py`,
`bank-check.py`, `verify.log`, `bank-check.log`, `checks.json`, `bank-checks.json`.
Широкие native suites и release demo builds здесь не запускались параллельно:
их свежие результаты записывает отдельный integration исполнитель и root.
