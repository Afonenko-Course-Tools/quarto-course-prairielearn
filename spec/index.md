---
type: specification-index
component: course-prairielearn
status: current
updated: 2026-10-08
---

# Индекс спецификаций PrairieLearn

Версия расширения определяется [descriptor](../_extensions/course-prairielearn/_extension.yml) того же Git ref.
Код, descriptor и документация выпуска читаются из одного точного тега. Изменения main после выпущенного тега — **unreleased**.

`current` означает правила кода на выбранном ref; `accepted-next` — согласованный контракт будущего выпуска, который ещё не реализован. `historical` сохраняет происхождение решений без нормативной силы. У каждого правила один владелец: общую модель задаёт Core, этот репозиторий задаёт только свой экспорт или сопровождение сайта. README, руководство, планы и примеры не образуют отдельного общего контракта.

| Документ | type | component | status | Нормативный владелец и область |
| --- | --- | --- | --- | --- |
| [PrairieLearn: действующий контракт](../docs/authoring.md) | specification | course-prairielearn | current | native/CUE binding и selected participant delivery; client/tests/reference |
| [Диагностика](../docs/diagnostics.md) | reference | course-prairielearn | current | Собственные ID и внешние причины этого адаптера |
| [Body Core](../../quarto-course/docs/body-export.md) | specification | course-core | current | Общий producer transport и selected source input |
| [Авторская модель Core](../../quarto-course/spec/index.md) | specification/index | course-core | current | Банк, условия, решения и назначения |
| [Результат реализации](../docs/releases/2026-10-08-implementation.md) | implementation-report | course-prairielearn | historical | Шаги 10 и завершение общего маршрута |
| [Карта сохранённой истории](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/blob/70f62d424fb87ca2355a492123d89d32db5126dd/docs/history/2026-10-08/README.md) | history | course-prairielearn | historical | Исходные планы, probes/evidence, refs и provenance |

Банк и назначения принадлежат текущему Core; этот адаптер проверяет свой вход
на собственной границе. Порядок выпуска и финальные проверки сохраняются в
[отчёте реализации](../docs/releases/2026-10-08-implementation.md).

## Full native export

`application/declarations.ts` and `#PrairieLearnDeclarations` close the delivery
configuration. `source-selection.ts` verifies Core SourceSelection SHA256 and
preserves submission paths. `export-course.ts` produces a complete atomic native
course and independent private checks inventory; IDs derive from stable Core keys.
Pinned official PrairieLearn JSON schemas and bundled offline Ajv validators are
recorded in `spec/upstream/provenance.json`. The runner descriptor is Platform-owned,
not a second author configuration or a private GradingJob.
