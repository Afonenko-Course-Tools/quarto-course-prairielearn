---
type: specification-index
component: course-prairielearn
status: current
updated: 2026-10-08
---

# Индекс спецификаций PrairieLearn

Версия расширения определяется только [course-prairielearn/_extension.yml](../_extensions/course-prairielearn/_extension.yml) того же Git ref. На проверенной базе descriptor содержит `2.1.1`; опубликованный `v2.1.1` имеет SHA `916fe55cbedcf9e9f49ecefd2ba908add2d346b5`. Изменения `main` после тега являются **unreleased**, даже если descriptor ещё содержит номер предыдущего выпуска. Контракт установленного выпуска читается из того же тега, что и код: [документ `v2.1.1`](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/blob/v2.1.1/docs/authoring.md). Новый тег до реализации/проверок не объявлен.

`current` означает правила кода на выбранном ref; `accepted-next` — согласованный контракт будущего выпуска, который ещё не реализован. `historical` сохраняет происхождение решений без нормативной силы. У каждого правила один владелец: общую модель задаёт Core, этот репозиторий задаёт только свой экспорт или сопровождение сайта. README, руководство, планы и примеры не образуют отдельного общего контракта.

| Документ | type | component | status | Нормативный владелец и область |
| --- | --- | --- | --- | --- |
| [PrairieLearn: действующий контракт](../docs/authoring.md) | specification | course-prairielearn | current | native/CUE binding и selected participant delivery; client/tests/reference |
| [Диагностика](../docs/diagnostics.md) | reference | course-prairielearn | current | Собственные ID и внешние причины этого адаптера |
| [Body Core](../../quarto-course/docs/body-export.md) | specification | course-core | current | Общий producer transport и selected source input |
| [Следующая авторская модель](../../quarto-course/spec/authoring-model-next.md) | specification | course-core | accepted-next | Банк, условия, решения и назначения следующего выпуска |
| [План владельца](../docs/plans/2026-10-08-implementation.md) | plan | course-prairielearn | in-progress | Шаги 10 и завершение общего маршрута |
| [Карта сохранённой истории](../docs/history/2026-10-08/README.md) | history | course-prairielearn | historical | Исходные планы, probes/evidence, refs и provenance |

Новый `exercise-bank`, `statementVisibility`, `assignments`, stage и новая связь решений остаются `accepted-next` до совместного изменения Core и потребителей. Этот индекс не объявляет их поддержанными существующим выпуском. Порядок внедрения — [линейный план](../../quarto-course/docs/plans/2026-10-08-course-tools-implementation.md).
