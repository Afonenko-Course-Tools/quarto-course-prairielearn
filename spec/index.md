---
type: specification-index
component: course-prairielearn
status: current
version: 9.0.1
updated: 2026-10-26
---

# Индекс спецификаций PrairieLearn

Версия расширения определяется [descriptor](../_extensions/course-prairielearn/_extension.yml) того же Git ref.
Код, descriptor и документация выпуска читаются из одного точного тега. Изменения main после выпущенного тега — **unreleased**.

`current` означает правила кода на выбранном ref; `accepted-next` — согласованный контракт будущего выпуска, который ещё не реализован. `historical` сохраняет происхождение решений без нормативной силы. У каждого правила один владелец: общую модель задаёт Core, этот репозиторий задаёт только свой экспорт или сопровождение сайта. README, руководство, планы и примеры не образуют отдельного общего контракта.

| Документ | type | component | status | Нормативный владелец и область |
| --- | --- | --- | --- | --- |
| [PrairieLearn: действующий контракт](../docs/authoring.md) | specification | course-prairielearn | current | native TS binding и selected participant delivery; client/tests/reference |
| [Диагностика](../docs/diagnostics.md) | reference | course-prairielearn | current | Собственные ID и внешние причины этого адаптера |
| [Body Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/946ad619830aa1affcbdaf4b5b447324e3d41002/docs/body-export.md) | specification | course-core | current exact source pin | Общий producer transport и selected source input |
| [Авторская модель Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/946ad619830aa1affcbdaf4b5b447324e3d41002/spec/index.md) | specification/index | course-core | current exact source pin | Банк, условия, решения и назначения |

Банк и назначения принадлежат текущему Core; этот адаптер проверяет свой вход
на собственной границе. Неизменяемые выпуски и assets находятся в [GitHub Releases](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/releases).

## Полный native export

Исполняемый TS-контракт `application/declarations.ts` замыкает конфигурацию
поставки. Существующий `native-checks.ts` нормализует PL policy из raw plane
того же Core capture. `native-check-inventory.ts` связывает выбранные настоящие
A1 raw origins и сохраняет точные прежние hash области; transport witness и
selection scope имеют отдельные имена. `native-course.ts` организует genuine
operation, а `export-course.ts` атомарно публикует полный native course и
приватный checks inventory после закрывающего Core fence.
Закреплённые официальные PrairieLearn JSON schemas и offline Ajv validators
описаны в `spec/upstream/provenance.json`. Descriptor runner принадлежит
Platform и не становится второй авторской конфигурацией или private GradingJob.

## Текущая совместимость кандидата 9.0.1

Кандидат использует native TS Core 9. Body v2, public results v2 и строгие
delivery v3/v4 сохраняют собственные версии. `contract.json.name` устанавливает
владельца; исполняемые business contracts находятся в TypeScript.
Точная source dependency задаётся CI; номера descriptor не дают runtime authority.
Полная поставка требует genuine Core operation, independent prior P и проверенного
Platform image digest. Частичный publication vet — data inspection без assignment
прав. Новый кандидат не объявляется выпущенным до OTHER review и paired CI.

## Reference-only единицы и повторные вопросы

Кандидат8.2.1 добавляет публичный контекст исходных optional меню для
однопозиционных `sec-unit-*` работ и отказывает при различии повторного
question payload, source mapping, grading/submission или ресурсов.
Используется прежний public Body/renderer; новых полей схемы и registry нет.
Тег8.2.1 и course readiness этой веткой не подтверждаются.

## Owned overlay в 8.2.1

Writer адаптера допускает active pointer-v3 и common witness-v2 только в
раннем штатном Core callpath с actual JSON writer, `full`, export context и
единственным owned profile. Закрытые refs связывают fixed source-context и
witness; SHA256, filesystem identity и currentness проверяет Core до вызова
адаптера. Restored/completed run не разрешает новую запись. Ordinary/v2
поведение сохраняется; публичных author flags и новых delivery schemas нет.

Точный CI pin Core 9 указан в workflow данного Git ref после независимой
технической рецензии исходников. Настоящий paired CI и публикация выпуска
проверяются отдельно; локальные проверки не заменяют эти этапы.

## Сохранение ABI 1 при объединении main

Сохранены `attributes.extension_id` и явный `document_id`, ordinary active
child snapshot/clearEnv и identity scoped permissions. Новый native entry
использует только публичный Core capture seam, а C auxiliary children —
принятый frozen env с pre/post currentness. Подробности и граница проверок
приведены в [спецификации](../docs/authoring.md#контекст-наблюдения-после-объединения-main).
Информационное `core-version: 9.0.0` не заменяет точный CI SHA или runtime qualification.
