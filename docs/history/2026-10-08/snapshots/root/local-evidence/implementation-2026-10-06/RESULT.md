# Результат реализации 6–7 октября 2026

Маршрут завершён: инструменты main + immutable Releases, локально проверенная документация main без Pages, открытый PR курса.

Начало UTC 2026-10-06 20:46:37; завершение проверок UTC 2026-10-07 00:03. В пределах лимита 10 часов. Исходный /home/tolya/Cybersecurity не изменён: HEAD, staged/unstaged diff и 644 dirty entries сохранены.

## Потребители

- [PR курса 3](https://github.com/BSU-RFCT-Afonenko-Courses/Cybersecurity/pull/3): OPEN, source 605da5dfcb0f38e08d3c0bf61e065c08b32aa923; оба финальных CI успешны, deploy skipped.
- [Документация PR 16](https://github.com/Afonenko-Course-Tools/quarto-template-course/pull/16): MERGED, main 7055f5e; финальный CI успешен, workflow без deploy/push. Native preview http://127.0.0.1:4444/catalog/ оставлен открытым.
- Документация: 9 QMD, 39 HTML с готовыми ресурсами, 789 local links. Все файлы 8 готовых групп перенесены побайтно; guide/catalog searchable, teaching text excluded. Actual Task failure/repeat tests с Unicode/spaces прошли. Native browser book/slides/notes/mode проверены.
- Курс: 21 HTML student/23 HTML full. Current links 772/884; stable 753/863. Anchors/control inventory/public-resource isolation passed. 18 installed scopes совпадают с релизными `_extensions`.
- Selected backup export: 1 work/1 question в full/public, work cybersecurity/sec-work-data-integrity-backup, requirements exr-lab-data-integrity-backup=required. Core patched demo root export: 1 question, вложенная презентация исключена из JSON source pass.

| Локальная полная сборка | Секунды | Результат |
| --- | ---: | --- |
| current-student | 81.77 | exit 0 |
| current-full | 90.23 | exit 0 |
| stable-student | 86.26 | exit 0 |
| stable-full | 90.91 | exit 0 |

## Текущие версии

Core/Presentation/Navigation 3.0.1; Publisher 4.0.0; QRC 2.2.0; Print/Moodle 0.2.0; PrairieLearn/Cloud 2.1.0; Download 1.1.0. Все tool PR merged после local checks и финального CI. Core 3.0.1 исправляет bank physical ownership; исходный 3.0.0 и старый demo immutable и не перезаписаны. Другие producer demos имеют свои одиночные банки и сохраняют проверенный Core 3.0.0.

## Готовые группы

| Группа | Release | Exact source |
| --- | --- | --- |
| core | demo-20261007-patch1 | `0b1beee584cdb9708def5c4e73f83bc0e208954b` |
| composition | demo-20261007 | `1f5c0f3890b71c98fa500933e322e2d5cf4b7df0` |
| qrc | demo-20261007 | `b25c1d2933767041adb7171ed037c10c5e7f43e7` |
| external | demo-20261007 | `b25c1d2933767041adb7171ed037c10c5e7f43e7` |
| print | demo-20261007 | `2c8bab9b96254bd4e8300a612a385f18c6b7f9ce` |
| moodle | demo-20261007 | `42c8709d4b8be985796f894084400a8e8c8d44ab` |
| prairielearn | demo-20261007 | `c65550182121c4ba3e3795c5d05d7c97e15ddd7c` |
| cloud | demo-20261007 | `2915cee2c44b3518791491c06c6d34fc18ca5665` |

Все assets загружены в draft, скачаны и побайтно проверены до immutable publication. RELEASE.json хранит SHA256/size.17 verified receipts (9 tool + 8 independent demo releases, включая неизменяемые прежние Core artifacts) в published-releases-final.json.

## Evidence

- course-final-times.json, course-final-verification.log: 4 полные native renders 1.10.18/1.11.5, 82–91 с.
- course-final-ci.json: run 37549390867, оба native jobs success, deploy skipped.
- template-final-ci.json: run 37549277462 success; template-final-resource-fix.log и template-final-complete-tree-check.log.
- course-final-tagged-payload-compare.json: 18 exact installed copies; template-eight-groups-provenance.json: 8 immutable sources.
- core-full-suite-patch1.log:complete current suite PASS (~5.5min), core-bank-ownership-stable.log:stable focused PASS 21.12 с; independent review-core-bank-ownership.md resolves source symlink finding.
- publisher-clean-ci-2026-10-07/native-ci.log:literal 18-command matrix PASS 553 с; earlier independent owner review reports saved.
- original-course-preserved-final.json: unchanged source authoring checkout.

## Ограничения и следующий шаг

Два исходных exam QMD имели только заголовки. Они сохранены как full-only авторские черновики; реальные контрольные условия/решения не выдуманы. Архитектура общего банка и явных назначений проверена на настоящих producer вариантах. Авторское наполнение курса — следующий содержательный шаг.

Windows/macOS фактически не запускались на этом Linux ноутбуке; их filesystem ветки документированы без неподтверждённых заявлений. PrairieLearn проверен реальными 6 Java assertions/reference success+expected starter failure; live LMS/container/Cloud VM не заявлены.

Последующая работа: пользовательское ревью PR курса, авторское наполнение, отдельно разрешённое слияние/публикация. Текущий PR курса оставлен открытым. Пострелизные audit records в owner планах сохранены локально; runtime trees соответствуют выпущенным SHA.
