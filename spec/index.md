---
type: specification-index
component: course-prairielearn
status: current
version: 8.0.0
updated: 2026-10-21
---

# Индекс спецификаций PrairieLearn

Версия расширения определяется [descriptor](../_extensions/course-prairielearn/_extension.yml) того же Git ref.
Код, descriptor и документация выпуска читаются из одного точного тега. Изменения main после выпущенного тега — **unreleased**.

`current` означает правила кода на выбранном ref; `accepted-next` — согласованный контракт будущего выпуска, который ещё не реализован. `historical` сохраняет происхождение решений без нормативной силы. У каждого правила один владелец: общую модель задаёт Core, этот репозиторий задаёт только свой экспорт или сопровождение сайта. README, руководство, планы и примеры не образуют отдельного общего контракта.

| Документ | type | component | status | Нормативный владелец и область |
| --- | --- | --- | --- | --- |
| [PrairieLearn: действующий контракт](../docs/authoring.md) | specification | course-prairielearn | current | native/CUE binding и selected participant delivery; client/tests/reference |
| [Диагностика](../docs/diagnostics.md) | reference | course-prairielearn | current | Собственные ID и внешние причины этого адаптера |
| [Body Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/438c1477672895df12297dbdeab507927ab9cfcd/docs/body-export.md) | specification | course-core | current | Общий producer transport и selected source input |
| [Авторская модель Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/438c1477672895df12297dbdeab507927ab9cfcd/spec/index.md) | specification/index | course-core | current | Банк, условия, решения и назначения |

Банк и назначения принадлежат текущему Core; этот адаптер проверяет свой вход
на собственной границе. Неизменяемые выпуски и assets находятся в [GitHub Releases](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/releases).

## Full native export

`application/declarations.ts` and `#PrairieLearnDeclarations` close the delivery
configuration. `source-selection.ts` verifies Core SourceSelection SHA256 and
preserves submission paths. `export-course.ts` produces a complete atomic native
course and independent private checks inventory; IDs derive from stable Core keys.
Pinned official PrairieLearn JSON schemas and bundled offline Ajv validators are
recorded in `spec/upstream/provenance.json`. The runner descriptor is Platform-owned,
not a second author configuration or a private GradingJob.

## Текущая совместимость 8.0.0

Exporter 8.0.0 использует Core 8.0.0 и delivery v3. Body v2 и public results v2
не переименовываются. Manual/mixed/choice требуют согласованного native reader;
Platform/Gateway проверяются отдельно по exact source/digest, без заявления
совместимости прежних service releases. Download — необязательный consumer
готового Core inventory, не зависимость этого экспортёра.

## Историческая совместимость 7.1.1

Экспортёр 7.1.1 использует Core 7.3.0 и прежний Body v2. Изменён descriptor,
исполняемые файлы сохранены. Версии Core 7.2.0 / exporter 7.1.0 опубликованы.
