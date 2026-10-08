# Демонстрационная группа Java и Gradle

Подготовка следующего выпуска (`accepted-next`). Эти исходники показывают
согласованный новый банк; совместный runtime/render ещё проверяется по
[плану владельца](../../docs/plans/2026-10-08-implementation.md).
Минимум — Quarto 1.11.5 и CUE 0.17.1. [Правила миграции](../../docs/authoring-next.md).

Для локального кандидата из корня репозитория PrairieLearn:

```sh
CORE=/absolute/path/to/quarto-course bash tools/check-java.sh
```

Последняя опубликованная группа закреплена на Core `v3.0.2`, PrairieLearn `v2.1.1`
и [demo-20261007-ru1](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/tree/demo-20261007-ru1/examples/java-gradle).
Эти refs описывают прежнюю готовую группу; pins новых исходников будут заменены
точными опубликованными тегами после проверки. Новый demo URL пока не объявлен.
`BUILD.json` готового результата должен сохранить точный producer commit,
фактические зависимости и профиль. Готовый HTML использует внешние native
GitHub source-ссылки, без копирования закрытых QMD в student output.

## Java и выбранная поставка

Core и PrairieLearn устанавливаются в `bank`; `course.id` объявлен один раз
в корне. Варианты А и Б назначают restricted задачи. Открытый разбор
`exr-clamp-demo` имеет фактическое публичное решение и используется только
в `.assessment-preview`. Общий банк явно включён, собственные difficulty/time
не наследуются от страницы. В student остаются название работы и preview,
а условия вариантов и их ссылки удаляются. Профили пишут в отдельные
`_book/student` и `_book/full`; full по умолчанию — политика демонстрации.

`binding.json` задаёт отдельную явную привязку каждого выбранного вопроса.
`build.ts` создаёт два delivery: participant condition и starter идут студенту,
`tests` остаются закрытыми, `reference` не поставляется. Функциональный профиль
`feature` добавляет рекомендации к условию выбранной задачи; он не открывает
её на student-сайте. Preview и текст вне условий не входят в delivery.

Нужны Java и Gradle. Без Maven/JUnit задача JavaCompile/JavaExec выполняет
шесть проверок авторского решения; незавершённый student starter должен получить
отказ. Native исходный вывод сохраняется. Локальные проверки Java подтверждают
поведение программы; импорт PrairieLearn, image, entrypoint и серверное
исполнение требуют проверки на целевой установке. Экспорт не создаёт activity,
не назначает пользователей и не настраивает порог/доступ.

[Диагностика](../../docs/diagnostics.md).
