---
type: specification
component: course-prairielearn
status: current
updated: 2026-10-10
---

# Спецификация заданий и контрольных работ

Общую модель банка и producer Body определяет [Core](../../quarto-course/docs/body-export.md). Этот документ описывает действующие правила потребителя на выбранном Git ref. [Индекс](../spec/index.md) связывает текущие контракты владельцев; документация выпуска читается из того же тега, что и код.

Документ задаёт текущие правила разметки и нормализованной модели
`course-prairielearn`. Ядро и адаптер используют единый текущий контракт без
переключения версий схемы. Контракты этого ref: адаптер 4.0.0 и Core 5.0.0; публикация тегов и runtime OCI digest проверяется отдельно у владельцев. Полный экспорт создаёт native курс, вопросы, работы и декларации доступа; Gateway применяет назначения и авторитетный predicate выполнения.
Канонические `#exr-*` имеют уникальные ID внутри явной области
`exercise-bank: true`, собственные обязательные `difficulty` и положительное
целое `time`. Эффективная `statement-visibility` берётся из атрибута задачи либо
`exercise-statement-visibility` native metadata; отсутствие политики — ошибка.
`course-role` необязателен. Native упражнения вне банка сохраняют обычные правила Quarto.
`course.id` задаётся в корне курса и передаётся в контекст полного экспорта.
Обычная нативная разметка не требует экспортных метаданных.

## Область ответственности

Ядро курса применяет правила видимости и собирает общую модель: задания,
условия, критерии проверки, состав занятий и устойчивые идентификаторы.
Адаптер добавляет параметры внешней проверки и правила контрольных работ.
CUE проверяет полученную модель и отклоняет неизвестные поля.

Стартовый проект, авторское решение и тесты хранятся в обычном каталоге,
на который указывает `project`. Автору не требуется создавать `question.html`,
`info.json` и UUID: их создаёт явный экспортёр выбранной работы.
Конфигурацию внешней проверки (`image` и при необходимости `entrypoint`,
`timeout`, `enableNetworking`, `environment`) автор явно задаёт в `binding.json`.

## Правила контрольной работы

`assessment.prairielearn` — явное подключение правил к конкретной контрольной.
Пустая карта `{}` подключает значения из `prairielearn.assessment-defaults`.
Без подключения глобальные значения не действуют, в том числе на контрольные
с упражнениями других платформ. Видимость обрабатывается ядром раньше
адаптера: restricted условия и закрытые блоки не остаются в студенческой
проекции. Заголовок работы и её `.assessment-preview` доступны на сайте.

После объединения требуются все поля:

| Поле | Значение |
|---|---|
| `attempts` | Положительное целое число оцениваемых попыток для каждого задания. |
| `pass.at-least` | Положительное целое число полностью выполненных required заданий, не больше числа required участников `.task-items`. |
| `assignment` | Одна стратегия назначения: `mode: assessment-id` либо `student-label: <метка>`. |

Локальные поля переопределяют общие; карты объединяются рекурсивно. Исключение —
`assignment`: локальная стратегия целиком заменяет общую. В одной стратегии
нельзя одновременно задавать `mode` и `student-label`. Неизвестные поля и
неподдерживаемые режимы — ошибка. Все задания, входящие в такую контрольную, должны иметь
`target="prairielearn"`. Их количество определяется ссылками в `.task-items`;
отдельный счётчик не используется. Повторы и ссылки на отсутствующие задания
проверяет ядро.

При `mode: assessment-id` адаптер получает идентификатор контрольной от
ядра курса (`course-assessment-id`) и вычисляет:

```text
student-label = "pl-" + sha1(UTF8(course.id) + byte(0) + UTF8(assessment.id))
```

Хеш SHA-1 здесь — детерминированная метка, не средство безопасности. Перемещение QMD
и изменение названия не меняют метку при сохранении ID. Изменение `course.id`
или ID контрольной меняет её. При доступном ID курса в модель попадает
`assignment.student-label`; исходный `mode` удаляется. Обычный вложенный банк без
локального ID сохраняет режим до явного экспорта из корня курса. Явная метка допустима,
например для общей защиты и пересдачи, и соответствует
`^[a-z][a-z0-9-]*$`. Вычисление метки не назначает её студенту и не ограничивает
доступ на сервере: это отдельная операция развёртывания.

## Условие и критерии проверки

Ядро извлекает `.grading-notes` из упражнения в отдельное необязательное поле
`gradingNotes` модели, а `body` содержит условие без этих заметок. Адаптер
сохраняет эту границу. `.grading-notes` требует явного `course.view` и
автоматически удаляется в представлении `student`. В представлении `full`
заметки остаются в книге и в отдельном поле модели. Политика закрытого условия
задаётся `statement-visibility="restricted"`; маркер grading-notes сам по себе
условие не скрывает. Условие и ссылка назначения restricted задачи удаляются
из student-сайта, а работа сохраняет публичный preview.
Заметки допускаются только внутри одного упражнения, без вложенных
`.grading-notes`, упражнений и `.task-items`.

Экспортёр использует публичную проекцию Body как условие задания. Поле
`gradingNotes`, авторское решение и закрытые тесты не должны попадать
в материалы студента.
`project` — путь к исходному проекту, а не разрешение публиковать весь каталог.
Состав поставки задаёт выбранная работа. Несвязанная открытая демонстрация
сохраняется в банке и не входит в эту поставку. Задание с программным проектом
и явной привязкой PrairieLearn можно экспортировать без определения платформы по `target`. Доставка архива стартовых файлов
описывается независимым расширением `project-download`.

## Граница поставки и настройки платформы

В контрольную входят только задания, перечисленные в её `.task-items`,
в указанном порядке. Экспортёр должен использовать пары идентификаторов
`(course.id, assessment.id)` и `(course.id, exercise.id)` как устойчивые ключи.
Путь файла, номер главы и её название на эти ключи не влияют. Для
контрольной используется полный исходный захват выбранной книги для экспорта, независимо от HTML представления `student`.

`attempts: 3` задаёт три оцениваемые попытки без снижения максимального балла.
`pass.at-least: 2` означает две полностью выполненные задачи. Частичный балл
за незавершённую задачу не считается выполненной задачей. Полная поставка сохраняет эту семантику в закрытом `works[].completion`, который применяет gateway к доверенным per-question results. Native raw grade остаётся отдельным показателем.
API доступа, назначение пользователей и запуск внешней проверки относятся к PrairieLearn.
Экспортёр требует явную привязку каждого вопроса к `image`; `entrypoint`,
`timeout`, `enableNetworking`, `environment` — необязательные явные настройки. Он создаёт файлы
вопросов, стартовые файлы и закрытые тесты; запуск платформы сюда не входит.

## Поставка вопросов

Legacy `entrypoints/export.ts` создаёт только нативные вопросы с внешней проверкой
(`gradingMethod: "External"`), публичным условием, стартовыми файлами
в `clientFilesQuestion` и закрытыми тестами. См. README и автономную
`examples/java-gradle` группу. Передача `attempts`, `pass`, `assignment` в метаданных
не создаёт оцениваемые работы на платформе; корректную семантику порога, обязательных
и дополнительных заданий задаёт преподаватель в конфигурации PrairieLearn.
Никакая сумма баллов не объявляется эквивалентом обязательности заданий.
Реальный импорт и контейнерный проверяющий инструмент проверяются отдельно.

В обычном вложенном банке без локального `course.id` текущий `assignment.mode`
сохраняется до явного экспорта из корня. При экспорте `assessment-id`
разрешается в стабильный `student-label` по корневому ID курса и ID работы.

## Ошибки и повторный экспорт

[Справочник диагностики](diagnostics.md) объясняет ID адаптера, контекст работы
и вопроса, а также исходные отказы Core, CUE и Pandoc. После ошибки результат
не создаётся; для повторного экспорта нужен новый каталог поставки.

## Общие назначения и participant Body

Работа имеет `kind: lab|seminar|practical|test`. Несколько `.task-items` образуют
один упорядоченный состав. Stage списка необязателен, его значения —
`demonstration|classroom|homework`; значение не выводится из заголовка.
На Span ссылки задаются `requirement="required|optional"` и
`work-mode="individual|pair|group"`, по умолчанию required/individual.
Работы test/practical назначают только restricted задачи. Открытые разборы
помещаются в `.assessment-preview` вне назначений. Stage demonstration требует
open условия, канонической роли demonstration и фактического публичного решения.

Body сохраняет `schema: course-body-package-v1`. Question содержит
`statementVisibility: open|restricted`, boolean `hasPublicSolution` и
необязательный `purpose: demonstration|discussion|independent-study|control`.
`visibility: public` означает безопасный participant payload, включая выбранное
restricted условие. Решения, ключи, gradingNotes и закрытые маркеры не входят
в `question.html`; их guards сохраняются.

Body work содержит qualified `items` и обязательные `assignments` с точно теми
же ключами. Значение — `{stage?, requirement, workMode}` с указанными enum.
Необязательный `theoryTime` — положительное конечное число минут, включая дробное;
адаптер принимает его без собственного расчёта времени. Native CUE продолжает
проверять локальную Course-модель. Binding вопросов по локальному `q.id` —
самостоятельная платформенная карта, его ключи не заменяются Body assignments.

В поставку входят выбранные условия, поля ответа и проверенные ресурсы;
внутренние заголовки условия сохраняются. Preview, внешние заголовки работы,
окружающая проза и неназначенные задачи исключены producer Core.
В режиме upload `clientFilesQuestion` получает `<project>/student`, `tests` остаются приватными,
`reference` не поставляется. `delivery.json` сохраняет общий состав назначений;
attempts/pass/assignment и права доступа задаются отдельно на платформе.

## Ввод решения в браузере

В binding вопроса необязательное поле `submission` явно выбирает способ сдачи:

```json
{"submission":{"mode":"editor","aceMode":"ace/mode/java"}}
```

`mode: editor` использует штатный `pl-file-editor`. Для каждого имени из `files`
требуется одноимённый текстовый starter UTF-8 без NUL из `<project>/student`,
размером не больше 1 MiB. Его содержимое становится начальным текстом поля;
HTML и literal Mustache braces экранируются, Unicode сохраняется. `aceMode`
необязателен и имеет форму `ace/mode/<name>`. Остальные student-файлы не
публикуются, download/upload элементы не создаются. Ресурсы самого условия
по-прежнему поставляются по публичному Body-контракту. Приватные tests и
external grading options сохраняются; PL преобразует ввод в `_files` и
`/grade/student/<file>` без отдельного `server.py`.

Без поля `submission` действует `mode: upload` для совместимости существующих
курсов. У upload нет `aceMode`. Неизвестные поля/режимы, отсутствующая заготовка
или двоичные данные отклоняются до публикации результата.

Для Core Java обычный сценарий — одно поле с заготовкой класса/метода. Полная
сборка, Examples, README и .gitignore нужны автору для локальной проверки либо
студенту для автономного выполнения. Поставка ZIP является отдельным сценарием
`project-download`; проект с VSCode/workspace требует отдельной настройки PL.

Контракт сверён с официальными [pl-file-editor](https://docs.prairielearn.com/elements/pl-file-editor/)
и [external grading](https://docs.prairielearn.com/externalGrading/) и исходниками
закреплённого PL `92584fe426ececb84bc2d09de9975c7056c0c5f6`.

## Полная native-поставка

`export-course.ts` создаёт весь native course из свежей модели Core и закрытых
metadata `prairielearn.delivery`, `question-defaults` и `assessment-defaults`.
Пример полного формата находится в `examples/native-course/tasks/_quarto.yml`.
Состав выбранных работ определяется только `.task-items`; каждый участник должен
иметь эффективный target PrairieLearn и именованный `project-check`.

```sh
quarto run tasks/_extensions/course-prairielearn/entrypoints/export-course.ts COURSE_ROOT NATIVE --instance pilot --checks-output PRIVATE/checks.json --runtime-registry PLATFORM/runtime-profiles.json
```

Для namespace-установки путь включает `Afonenko-Course-Tools/`. `--book` по умолчанию
равен `tasks`; `delivery.book` должен совпадать. Registry можно также задать через
`PRAIRIELEARN_RUNTIME_REGISTRY`; последний стандартный путь —
`COURSE_ROOT/prairielearn/runtime-profiles.json`. Production требует опубликованный
OCI digest. Private testing допускает явный `--candidate-image sha256:IMAGE_ID`,
который CLI проверяет через локальный Docker; delivery помечается `candidate`.

Question defaults задают только topic/submission. Редкие атрибуты
`prairielearn-topic` и `prairielearn-submission="editor|upload"` переопределяют
платформенные поля. Runtime и источники выбирает общий project-check. Unknown
metadata/attributes, missing inputs, symlinks, binary/NUL/oversize и изменение
snapshot отклоняются до публикации. Package paths сохраняются от source root;
выбранные `.java` — единственные submission files. В student-tests оцениваемая
suite остаётся отдельной от trusted variant fixtures.

Доставка содержит `infoCourse.json`, выбранную instance, assessments, questions,
server-side tests и closed `tests/grading-job.json`. Starter UTF-8 встроен в editor;
server-side `serverFilesQuestion/starter` сохраняет его точный snapshot для проверки
паритета. Reference, verification tests, contract fixtures, Gradle и README не
входят в этот payload. Частный checks manifest записывается отдельно и включает
все явно подключённые проекты, в том числе demonstrations без native export.

Pinned upstream schemas (`spec/upstream/provenance.json`) проверяют native JSON
перед atomic rename свежего каталога. `delivery.json` хранит sourceSnapshotHash,
неизменный Core inventoryHash, file→SHA256 inventory и deliveryHash SHA256 от
canonical sorted-key JSON без deliveryHash. Inventory исключает сам delivery.json.
Question UUID сохраняет прежний exporter algorithm. Course UUID — UUIDv5 DNS
`course/<courseId>`, instance/assessment — UUIDv5 в namespace курса. Instance и
assessment используют modern `accessControl`: закрытый default (release9999,
beforeRelease.listed:false) и override по стабильному assignment.student-label
(release1970,due:null). Instance.studentLabels объявляет эти labels со стабильными
instance-scoped UUID. Bridge предоставляет доступ штатным enrollment/label API,
без staff/admin роли и без правки опубликованной source policy. `selfEnrollment.enabled` и попытки
`triesPerVariant` вычисляются из деклараций. Native `maxPoints` равен числу всех
участников и сохраняет raw grade; он не является completion threshold.
`works[].completion` задаёт отдельный required-only completion predicate.


### Доверенный completion bridge

`application/completion.ts` экспортирует `completionPolicy(courseId, work)` и
`evaluateCompletion(policy, results)`. Policy в `delivery.works[].completion`:
`schemaVersion:1`, `mode:required-question-completion`,
`source:per-question-results-v1`, qualified `questionIds`/`requiredQuestionIds`,
`atLeast`, `fullyCompletedScore:1`. Порог больше required pool отклоняется.
Gateway сначала проверяет user/activity/course-instance/assessment и текущий
`deliveryHash`, затем читает доверенный narrow bridge и применяет predicate.
Aggregate gradebook score не поддерживается как источник completion.

Results закрыты: `schemaVersion:1`, `source:per-question-results-v1`,
`questions:[{questionId, score, status}]`; score — конечное число0..1,
status — graded/ungraded. Нужна ровно одна строка для каждого участника, включая
ещё не начатые optional вопросы (score0,ungraded). Неизвестные/дублирующиеся/
отсутствующие вопросы и неверные scores отклоняются. Только graded score===1
из required pool считается выполненным. Predicate возвращает completedRequired,
requiredTotal,atLeast,passed и локальный completion score0/1. Для защиты Gateway
отправляет в AGS `scoreGiven=completedRequired`, `scoreMaximum=requiredTotal`;
pass определяется отдельным порогом atLeast. Обычная лабораторная передаёт
свой объявленный raw score, сохраняя weighted question scores. Три scores0.7
при pass2 дают completedRequired0;
полностью выполненные optional вопросы не заменяют невыполненные required.
Native assessment text разъясняет отдельный критерий выполнения, preferences
сохраняют courseRequirement каждого участника.

`verificationInventoryHash` — SHA256 от canonical sorted списка
`{qualifiedId,scenario,optional}`: starter, все declared reference:NAME и
contract:ID. Это opaque обязательство полной проверки; private решения и случаи
не попадают в native payload. Platform сверяет hash и receipt coverage.
Discovery нормализуется одинаково: min-executed1,allow-skippedfalse, затем
объявленные поля, в том числе partial/empty maps.


Native label и access override UUID — UUIDv5 в namespace курса от
`student-label/<instance>/<label>` и `access/<instance>/<workId>`. Оффлайн test
`tests/native-acl.ts` выполняет настоящий pinned Community resolver против
экспортированных JSON: unassigned/foreign/revoked label denied и не listed;
assigned обычный enrollment granted/submittable. Реальный Student session,
прямой URL и Moodle AGS проверяются отдельно до readiness.


В exporter 4.0.0 каждый instance требует явную закрытую декларацию публикации:

```yaml
publishing:
  start-date: '2026-09-01T00:00:00+03:00'
  end-date: '2027-07-01T00:00:00+03:00'
```

Оба значения — реальные ISO даты со временем и offset; начало строго раньше
конца. Неизвестные поля, отсутствие policy, календарно неверные даты и даты без
offset отвергаются. Экспорт переносит их в native `publishing.startDate/endDate`.
Интервал разрешает доступ enrolled Student к instance; label ACL отдельно
разрешает назначенные работы. `selfEnrollment` объявляется отдельно, старое
instance `allowAccess` не генерируется: pinned Community запрещает сочетать их.
Даты 1970–9999 в native примере — явная политика локального тестового pilot;
преподаватель задаёт даты своего учебного потока. Teacher не получает PL admin
из этой декларации. Правила попыток и pass.at-least наследуются через Core;
декодер нормализует только эти числовые scalar поля перед CUE validation.

Native `infoAssessment` сохраняет requirement в question preferences; каждый
question `info.json.preferences.courseRequirement` объявляет встроенную схему
`{type: string, default: required, enum: [required, optional]}`. Pinned Community
92584 проверяет assessment override по этой question schema при sync. Она не
заменяет authoritative completion predicate, который использует закрытую
политику delivery. Отдельный `preferences.schema.json` этим upstream не читается.
