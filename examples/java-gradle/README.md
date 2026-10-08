# Демонстрационная группа Java и Gradle

Авторская разметка текущего Git ref для `v3.0.0`.
Общая модель принадлежит Core `v4.0.0`; минимум — Quarto 1.11.5 и CUE 0.17.1.
[План владельца](../../docs/plans/2026-10-08-implementation.md) фиксирует
фактические проверки и дальнейший выпуск.

Для локального кандидата из корня репозитория PrairieLearn:

```sh
CORE=/absolute/path/to/quarto-course bash tools/check-java.sh
```

Установка закреплённых выпусков из каталога этой группы:

```sh
cd bank
quarto add Afonenko-Course-Tools/quarto-course@v4.0.0 --no-prompt
quarto add Afonenko-Course-Tools/quarto-course-prairielearn@v3.0.0 --no-prompt
cd ..
quarto run build.ts
```

Native source-ссылки ведут к tool tag `v3.0.0` того же producer commit.
Готовая группа выпускается в отдельном immutable Release `demo-20261008`.
`BUILD.json` фиксирует точный commit,
зависимости, профиль и `sourceDirty: false` для готового asset. Tool tag и demo tag
должны указывать на одну clean ревизию. HTML использует внешнее native действие
GitHub source, без source modal и копирования закрытых QMD в student output.

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
