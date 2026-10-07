# PrairieLearn: план владельца

Статус: следующий этап, реализация не начата. Выполнять пункт 10 и затем
пункты 12–13/17–18 [линейного плана](../../../quarto-course/docs/plans/2026-10-08-course-tools-implementation.md).
[Целевой контракт Core](../../../quarto-course/spec/authoring-model-next.md)
задаёт поля банка/работ/назначений. Quarto 1.11.5 / CUE 0.17.1;
широкую Windows CI matrix не добавлять.

## Изменения, документация и проверки

Согласовать `_extensions/course-prairielearn/application/export.ts`, `_extensions/course-prairielearn/{assessment,validate,native,contract}.lua`, `_extensions/course-prairielearn/validate-paths.ts`, `_extensions/course-prairielearn/entrypoints/export.ts`, при необходимости filter, с новым Core bank/assignment/body shape. Нынешний guard `q.visibility !== public` защищает participant payload, его не ослаблять. Добавить отдельное statementVisibility из банка: restricted назначенное условие экспортируется в safe participant payload без закрытых partitions и page preview. Сохранить выбранную work question closure, exact native resource slots, per-question binding и разделение client/tests/reference. Не вводить ручное оценивание, новые platform activities или общий grading backend.

Создать небольшой `_extensions/course-prairielearn/application/diagnostics.ts`; native.vet получает optional known context input/exercise/work/field, CUE predicates остаются в `_extensions/course-prairielearn/spec/prairielearn.cue`. Сохранить PL001_externalAssessmentMembers/Core/ADAPTER IDs и исходный CUE/Pandoc/Gradle output, добавить контекст и узкую CLI границу; PL.INPUT_INVALID только input guards. Проверить cleanup staging и отсутствие конечной delivery после отказа. При изменении словаря обновить `_extensions/course-prairielearn/contract.json`, CUE, `tools/sync-contract.ts`, fixtures и `docs/authoring.md` совместно.

Обновить `README.md`, создать `docs/diagnostics.md`, owner plan, `tests/{check,identity,native-model,native-ordinary}.ts`, `tests/export.test.ts`, `examples/java-gradle` configs/QMD/build.ts/bindings. Own bank difficulty/time обязательны; ordinary document tests остаются отдельной проверкой вне opt-in. Native lang/source links не меняют Java identifiers/API.

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
