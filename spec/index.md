---
type: specification-index
component: course-prairielearn
status: current
version: 8.2.2
updated: 2026-10-24
---

# Индекс спецификаций PrairieLearn

Версия расширения определяется [descriptor](../_extensions/course-prairielearn/_extension.yml) того же Git ref.
Код, descriptor и документация выпуска читаются из одного точного тега. Изменения main после выпущенного тега — **unreleased**.

`current` означает правила кода на выбранном ref; `accepted-next` — согласованный контракт будущего выпуска, который ещё не реализован. `historical` сохраняет происхождение решений без нормативной силы. У каждого правила один владелец: общую модель задаёт Core, этот репозиторий задаёт только свой экспорт или сопровождение сайта. README, руководство, планы и примеры не образуют отдельного общего контракта.

| Документ | type | component | status | Нормативный владелец и область |
| --- | --- | --- | --- | --- |
| [PrairieLearn: действующий контракт](../docs/authoring.md) | specification | course-prairielearn | current | native/CUE binding и selected participant delivery; client/tests/reference |
| [Диагностика](../docs/diagnostics.md) | reference | course-prairielearn | current | Собственные ID и внешние причины этого адаптера |
| [Body Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/dc3bd4d7d035359289fc13c44446947830defeb0/docs/body-export.md) | specification | course-core | current | Общий producer transport и selected source input |
| [Авторская модель Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/dc3bd4d7d035359289fc13c44446947830defeb0/spec/index.md) | specification/index | course-core | current | Банк, условия, решения и назначения |

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

## Текущая совместимость кандидата 8.2.2

Кандидат Exporter 8.2.2 использует проверяемый Core-кандидат 8.2.3 с API Core 8.1
и delivery v3. Сохранённое `core-version: 8.2.2` в metadata descriptor не
используется как проверка равенства bundle или нижней границы версии; оно
не заменяет точный companion SHA. Body v2 и public results v2
не переименовываются. Manual/mixed/choice требуют согласованного native reader;
Platform/Gateway проверяются отдельно по exact source/digest, без заявления
совместимости прежних service releases. Download — необязательный consumer
готового Core inventory, не зависимость этого экспортёра.

## Историческая совместимость 7.1.1

Экспортёр 7.1.1 использует Core 7.3.0 и прежний Body v2. Изменён descriptor,
исполняемые файлы сохранены. Версии Core 7.2.0 / exporter 7.1.0 опубликованы.

## Reference-only единицы и повторные вопросы из 8.2.1

Кандидат 8.2.1 добавил публичный контекст исходных optional меню для
однопозиционных `sec-unit-*` работ и отказывает при различии повторного
question payload, source mapping, grading/submission или ресурсов.
Используется прежний public Body/renderer; новых полей схемы и registry нет.
Эта история не подтверждает новый тег или готовность курса.

## Owned overlay в 8.2.1

Writer адаптера допускает active pointer-v3 и common witness-v2 только в
раннем штатном Core callpath с actual JSON writer, `full`, export context и
единственным owned profile. Закрытые refs связывают fixed source-context и
witness; SHA256, filesystem identity и currentness проверяет Core до вызова
адаптера. Restored/completed run не разрешает новую запись. Ordinary/v2
поведение сохраняется; публичных author flags и новых delivery schemas нет.

Текущая installed regression закрепляет Core-кандидат 8.2.3
`dc3bd4d7d035359289fc13c44446947830defeb0`. Локальные проверки и этот
ref не подтверждают публикацию выпуска.

## Контекст наблюдения 8.2.2

Канонические фасады сохраняют ABI 1 и добавляют `attributes.extension_id`.
Необязательный `document_id` требует явного контекста одного документа;
экспорт книги и пакетные команды не выбирают произвольный документ.
Четыре границы дочерних процессов в export-course, inspect-grading и
application/export используют полный снимок окружения через `childEnv` и
`clearEnv: true`. Авторские схемы, Body v2 и delivery v3 сохраняются.
Общий runtime и полное семантическое покрытие функций не вводятся.

CI проверяет Core 8.2.3 с точным SHA выше, QRC 3.1.1 и Site 5.1.4 по закреплённым
commits. `tests/performance-context.ts` самодостаточен и не импортирует продукт
Performance. Полные native/Java проверки, CI итогового HEAD и новая установленная
матрица принимаются отдельно; прежнее evidence не подтверждает их прохождение.
