---
type: implementation-report
component: quarto-course-prairielearn
status: completed
updated: 2026-10-08
---

# PrairieLearn: внедрение 8 октября 2026

Это отчёт проверенных операций. Нормативные правила принадлежат
[текущим спецификациям](../../spec/index.md) того же ref; контракт выпуска
читается по точному immutable тегу.

Выпущен [v3.0.0](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/releases/tag/v3.0.0), source SHA
`b9821b5b62863b7e1ae380a4c1a0a0bef855f8ba`, immutable Release ID `406379321`.
[PR #9](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/pull/9)
прошёл проверки и слит с сохранением истории; дерево merged main равно tested PR head.
[Main CI](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/actions/runs/37722438262)
завершился SUCCESS на указанном source SHA до публикации.

Core `v4.0.0`, PrairieLearn `v3.0.0`; Quarto 1.11.5 / CUE 0.17.1.
Штатный remote-tag `quarto add` прошёл: все **13** установленных
пути и bytes совпали с upstream `_extensions` этого Git object, без overlay
и лишних файлов. Draft assets были скачаны и сверены до immutable публикации.

Frozen identity/model/ordinary/policy и installed CLI delivery проверки прошли. Java 25 / Gradle 9.8: шесть reference assertions проходят; незавершённый student starter ожидаемо отказывает. Client/tests совпали с пятью authored source files; reference не поставляется.

Готовые группы выпущены в отдельном immutable
[demo-20261008](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/releases/tag/demo-20261008)
на том же producer SHA; `BUILD.sourceDirty:false`. Native build, HTML, resources,
sourceLinks и actual outputs прошли; полный ready map совпал с downloaded archive.

| Группа | Asset | Файлов | Archive SHA-256 |
| --- | --- | ---: | --- |
| prairielearn | `java-gradle.tar.gz` | 35 | `aed0fe92cd465eb7842a8fd6d95f3c537bd36feee2accb3c9c6b2e79fcc20198` |

Native sourceRef — собственный tool tag, catalog source — demo tag; оба
указывают на тот же source SHA. Старые immutable tags/assets сохранены.

Локальный Java/Gradle и delivery proof не подтверждают запуск image на hosted PL.

Нативный Windows прогон не заявляется. Узкие path/CUE-TEMP исправления Core 4.0.0
подтверждены fixtures; чужие warning streams сохраняются с фактическим exit.
Подробные receipts и общий результат — [центральный отчёт Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/main/docs/releases/2026-10-08-implementation.md).

Первый сохранённый owner history checkpoint: `70f62d424fb87ca2355a492123d89d32db5126dd`.
Шаг 17 выполнен; actual before/after receipt: `3 LOCAL / 1 REMOTE; main, all tags/Releases, serving gh-pages и API-confirmed OPEN bot heads сохранены`.
Более поздний docs/history main не переименовывает опубликованный source SHA.

Восстановление финальных снимков: [SOURCE-MAP](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/blob/70f62d424fb87ca2355a492123d89d32db5126dd/docs/history/2026-10-08-completion/SOURCE-MAP.json). После проверки exact Git blobs только этот новый датированный snapshot-каталог удаляется из active docs; архивный commit остаётся reachable. Последние планы и cleanup receipts: [Git checkpoint](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/blob/ff9e5684bd841be72c461eda95e18d3a789ba7f6/docs/history/2026-10-08-completion/final-journals/2026-10-08-implementation.md); [общая квитанция](https://github.com/Afonenko-Course-Tools/quarto-course/blob/35ab45a60d3859c4aa584499e4a49c5b8b6f14bf/docs/history/2026-10-08-completion/final-cleanup/03-verified-cleanup.json).
