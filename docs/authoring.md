---
type: specification
component: course-prairielearn
status: current
updated: 2026-10-22
---

# Спецификация заданий и контрольных работ

Общую модель банка и producer Body определяет [Core](https://github.com/Afonenko-Course-Tools/quarto-course/blob/bdf63e40348d7d6f9be5958565260e32c22384ec/docs/body-export.md). Этот документ описывает действующие правила потребителя на выбранном Git ref. [Индекс](../spec/index.md) связывает текущие контракты владельцев; документация выпуска читается из того же тега, что и код.

Документ задаёт текущие правила разметки и нормализованной модели
`course-prairielearn`. Ядро и адаптер используют единый текущий контракт без
переключения версий схемы. Контракты этого ref: адаптер-кандидат8.2.1 и Core-кандидат8.2.2, delivery v3, Body v2 и public results v2; публикация тегов и runtime OCI digest проверяется отдельно у владельцев. Прежние service releases не подтверждают совместимость нового reader. Полный экспорт создаёт native курс, вопросы, работы и декларации доступа; Gateway применяет назначения и авторитетный predicate выполнения.
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
| `pass.at-least` | Положительное целое число полностью выполненных required заданий, не больше числа required позиций `.task-items`. |
| `assignment` | Одна стратегия назначения: `mode: assessment-id` либо `student-label: <метка>`. |

Локальные поля переопределяют общие; карты объединяются рекурсивно. Исключение —
`assignment`: локальная стратегия целиком заменяет общую. В одной стратегии
нельзя одновременно задавать `mode` и `student-label`. Неизвестные поля и
неподдерживаемые режимы — ошибка. Все задания, входящие в такую контрольную, должны иметь
`target="prairielearn"`. Их количество определяется позициями в `.task-items`;
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
за незавершённую задачу не считается выполненной задачей. Полная поставка сохраняет эту семантику в закрытом `works[].completion`, который применяет gateway к доверенным per-slot results. Native raw grade остаётся отдельным показателем.
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

Body сохраняет `schema: course-body-package-v2`. Question содержит
`statementVisibility: open|restricted`, boolean `hasPublicSolution` и
необязательный `purpose: demonstration|discussion|independent-study|control`.
`visibility: public` означает безопасный participant payload, включая выбранное
restricted условие. Решения, ключи, gradingNotes и закрытые маркеры не входят
в `question.html`; их guards сохраняются.

Body work содержит qualified `slots`: позиция `course/work/slot`, candidates
`course/exr-*`, selection fixed/random и assignment `{stage?,requirement,workMode}`.
TheoryTime — положительное конечное число минут; Core владеет диапазонами времени.
Кандидаты всех позиций совпадают с каталогом выбранных вопросов. Binding вопросов
использует local q.id независимо от slot.id. Прежние items/assignments не принимаются.

В поставку входят выбранные условия, поля ответа и проверенные ресурсы;
внутренние заголовки условия сохраняются. Локальная Link-ссылка `#fragment`
принимается только при наличии единственной цели в фактически экспортируемом
публичном условии. У поддерживаемого Pandoc Table учитываются также
семантические Attr TableHead/Body/Foot, Row и Cell, включая промежуточные
заголовки тела таблицы. Header и остальные AST ID вместе со ссылками получают
стабильный namespace UUID вопроса: одинаковые native `#ref-*` или section ID
разных вопросов не конфликтуют. Отсутствующие и повторные цели отклоняются.
Native библиографические записи и оформление цитат сохраняются. Image-ссылки,
файлы и `file#fragment` продолжают проверяться как ресурсы; локальная ссылка
не подменяет отсутствующее вложение. Raw/Cite/Note и приватные роли по-прежнему
отклоняются. Preview, внешние заголовки работы,
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

Question defaults задают topic/submission и необязательный YAML boolean
`single-variant`. Он переносится в native `singleVariant` без подстановки;
отсутствующее поле опускается (документированный default pinned PL: `false`).
Явное `true` сохраняет прежний режим единственного варианта.
`prairielearn-single-variant="true|false"` переопределяет настройку упражнения;
`inspect-grading` показывает эффективное значение. Редкие атрибуты
`prairielearn-topic` и `prairielearn-submission="editor|upload"` переопределяют
платформенные поля. Runtime и источники выбирает общий project-check. Unknown
metadata/attributes, missing inputs, symlinks, binary/NUL/oversize и изменение
snapshot отклоняются до публикации. Package paths сохраняются от source root;
Для Java выбранные `.java` — единственные submission files. Невыпущенное
расширение runtime registry допускает явный `sourceExtensions: [".fish"]`
для текстовых источников другого runtime. Отсутствующее поле сохраняет
Java-only поведение; Java profile с `javaRelease` не допускает иных расширений.
Не-Java descriptor не получает фиктивные настройки JDK. Core project-check
остаётся владельцем выбора источников; registry — владельцем допустимых
расширений конкретного исполняющего образа. В student-tests оцениваемая
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
assessment используют modern `accessControl`. Только защита с явным
`relatedExercise` получает закрытый default (release9999,beforeRelease.listed:false)
и override по стабильному assignment.student-label (release1970,due:null).
Instance.studentLabels объявляет только labels защит со стабильными instance-scoped
UUID. Обычная лабораторная доступна enrolled Student в опубликованной instance
без выбора защиты; её native default release1970/due:null и delivery policy не
содержат assignment label. Авторские inherited assignment defaults нормализуются
как раньше, но label применяется только к защите. Bridge предоставляет доступ штатным enrollment/label API,
без staff/admin роли и без правки опубликованной source policy. `selfEnrollment.enabled` и попытки
`triesPerVariant` вычисляются из деклараций. Native `maxPoints` равен числу всех
участников и сохраняет raw grade; он не является completion threshold.
`works[].completion` задаёт отдельный required-only completion predicate.


### Доверенный completion bridge

`application/completion.ts` экспортирует `completionPolicy(courseId, work)` и
`evaluateCompletion(policy, results)`. Policy в `delivery.works[].completion`:
`schemaVersion:2`, `mode:required-slot-completion`,
`source:per-slot-results-v2`, qualified `slotIds`/`requiredSlotIds`,
`atLeast`, `fullyCompletedScore:1`. Порог больше required pool отклоняется.
Gateway сначала проверяет user/activity/course-instance/assessment и текущий
`deliveryHash`, затем читает доверенный narrow bridge и применяет predicate.
Aggregate gradebook score не поддерживается как источник completion.

Локальный evaluateCompletion принимает закрытый v2 с `slots:[{slotId,qualifiedId,
score,status}]`, где статус complete/grading/unanswered. Ровно одна строка относится
к назначенной позиции. Только complete score1 обязательной позиции учитывается.
Полный Platform bridge дополнительно связывает state/currentAttempt, assignmentId/
version, точки points/maxPoints и полный selected native instance_questions scope;
Gateway проверяет эти данные независимо. Not-started не выдумывает выбор.
Обычная lab передаёт фактическую взвешенную native оценку отдельно от completion.

## Авторские баллы и повторные попытки (exporter 7.0.0)

Ключ `prairielearn.delivery.instances` — безопасный lowercase slug
`^[a-z0-9][a-z0-9-]*$`, например `pilot` или `2026-2027-s1`.
Начальная цифра допускает учебный год; slash, dot, пробел и underscore запрещены.
Это правило instance, а не assignment label или work ID. UUID продолжает
вычисляться в прежнем namespace `instance/<key>` относительно course UUID;
добавление нового семестра не переименовывает прежний `pilot`.

Версия7.0.0 требует явной цены каждой позиции выбранной работы. Defaults
question-points/question-max-points и attempts задают общие значения,
slot-overrides меняет их по local slot ID. Случайная группа имеет общую максимальную
цену и попытки. Прежние версии Body/delivery/completion не поддерживаются.
Номер в документации сам по себе не подтверждает опубликованный тег или OCI image.

Настройки задаются в metadata курса/книги, `_quarto.yml`, `_metadata.yml`,
подключённом через native `metadata-files` файле `_*.yaml` либо front matter
документа. Quarto определяет порядок слияния; адаптер нормализует только известные
числовые поля. Слияние одного и того же metadata path выполняет Quarto: например,
`prairielearn.assessment-defaults.question-points` в `_quarto.yml: [9,7,5]`
и directory `_metadata.yml: [4,2]` даёт `[9,7,5,4,2]`. Экспортёр сохраняет этот
целиком авторский список. Если concatenation делает Exam schedule возрастающим,
экспорт отказывается с диагностикой; проверьте результат через `inspect-grading`.

Отдельное объединение адаптера применяется между разными путями: inherited
`prairielearn.assessment-defaults`, локальная `assessment.prairielearn` и
`slot-overrides`. На этих границах списки заменяются целиком, maps сливаются,
а явный null очищает ceiling. Это не отменяет предварительное native слияние
Quarto по одному пути. Для предсказуемого авторства используйте scalar course
points 1, а Exam schedule задавайте в document `assessment.prairielearn` или
per-question override. Например, общий авторский default:

```yaml
prairielearn:
  assessment-defaults:
    attempts: 3
    question-points: 1
    pass: {at-least: 2}
    # Необязательные author-controlled параметры:
    grade-rate-minutes: 0
    advance-score-perc: 0
    allow-multiple-instances: false
```

Документ может переопределить баллы/попытки и отдельных участников:

```yaml
assessment:
  kind: test
  prairielearn:
    question-points: [5, 3, 1]
    question-max-points: null
    allow-multiple-instances: true
    slot-overrides:
      exr-first:
        question-points: [4, 2]
        attempts: 2
```

`question-points` — native question `points`: неотрицательное число для Homework;
для Exam также непустой невозрастающий список баллов за последовательные попытки.
Required вопросы требуют строго положительных баллов и question ceiling (если он объявлен); native zero-ceiling не может дать полную awarded стоимость. Optional вопрос допускает нулевой ceiling. Нулевой знаменатель
completion не поддерживается. Optional вопрос допускает ноль и не входит в
required completion. Homework с нулевыми баллами не допускает положительный ceiling.

`question-max-points` — необязательный Homework question `maxPoints`; Exam его
запрещает. Явный YAML `null` очищает inherited ceiling. Поле `max-points` задаёт
необязательный ceiling всей работы, отдельный от question ceiling и completion
threshold. Отсутствующие/null ceilings опускаются: native PrairieLearn вычисляет
свои значения. Экспортёр не вставляет баллы 1, maxPoints 1 или число участников.

Авторский `attempts` — положительное целое, переносимое в question
`triesPerVariant`: число graded submissions для варианта вопроса. Это не число
экземпляров assessment. `allow-multiple-instances` — native `multipleInstance`:
boolean разрешён для Exam, Homework допускает только false. `grade-rate-minutes`
— native `gradeRateMinutes`, неотрицательный минимальный интервал graded submissions.
`advance-score-perc` — question `advanceScorePerc`, число 0–100 для перехода к
следующим вопросам. Отсутствующие optional retry controls опускаются, поведение
определяет pinned Community. `slot-overrides` задаётся по точным локальным
ID участников и допускает points/max-points/attempts/advance-score-perc; неизвестные
ID и поля отвергаются. `maxVariants` и другие неподдерживаемые knobs запрещены.
Проектные runtime/limits/networking остаются закрытым отдельным project-check
контрактом; grading metadata их не открывает.

Перед созданием native файлов автор может увидеть effective значения:

```sh
quarto run tasks/_extensions/course-prairielearn/entrypoints/inspect-grading.ts . --instance pilot --output effective-grading.json
```

Отчёт содержит source, kind, разрешённую policy и точный native mapping каждого
вопроса; production registry/image не нужны, native артефакт не создаётся. Missing
points вызывает actionable отказ с source/work/question и местом объявления.
Delivery сохраняет все effective grading поля и overrides; у ordinary labs
удаляется только assignment, который им не нужен. Completion по полностью
выполненным required вопросам остаётся отдельной закрытой политикой.

Native awarded score и результат тестов различаются. Gateway берёт
`instance_question.score_perc / 100`, а completion требует ровно 1. Pinned
Community92584 `src/lib/question-points.ts:105` вычисляет percentage как
awarded points / question max points; Exam начисляет приращение по стоимости
текущей попытки (`computeInstanceQuestionPointsExam`, строки130–143). Например,
для `[5, 3, 1]` после первой полностью неверной попытки правильный ответ на второй
даёт 3/5 = 0.6 native credit и не завершает required вопрос, хотя тесты проходят.
Если автор хочет сохранять полную стоимость для каждой попытки, он объявляет
одинаковые значения (`[5, 5, 5]`) либо scalar по native правилам. Экспортёр не
превращает diminishing credit в completion, не заменяет его JUnit score и не
меняет подсчёт required вопросов на weighted grade. Аналогично высокий Homework
ceiling может требовать накопления native credit до полной стоимости.

## Случайные позиции и транспорт v2

Core 7.0.0 задаёт `slots` вместо прежних `items/assignments`. Экспортёр 7.0.0
принимает только Body `course-body-package-v2`. `slot.id` в Body и delivery —
`course/work/slot`, кандидаты — `course/exr-*`. Все кандидаты экспортируются и
проверяются атомарно, включая неназначенные конкретному студенту. Повтор снимка
сохраняет стабильные UUID, полный каталог и delivery hash.

Случайный Span `[@exr-a; @exr-b]{.task-alternatives #alt-x selection="random"}`
создаёт один native блок `{numberChoose:1, points, triesPerVariant, alternatives}`.
`preferences.courseRequirement` задаётся каждому кандидату внутри `alternatives`;
preferences на самом pool запрещены pinned native sync. Общие баллы, потолок и
triesPerVariant наследуются только выбранным вопросом, без дополнительных позиций.
Обычная fixed позиция создаёт блок с `id`. Одновременные id/alternatives и выбор
подмножества всей зоны отклоняются. В native БД fixed также имеет alternative group.

`slot-overrides` заменяет прежнее поле question-overrides и адресует местный ID
позиции exr-* или alt-*. Баллы, потолок и попытки действуют на всю группу: варианты
имеют одинаковую максимальную цену. Completion v2 использует slotIds/requiredSlotIds,
`mode: required-slot-completion`, `source: per-slot-results-v2`. Порог pass.at-least
считает обязательные позиции; частичный балл и optional их не заменяют.
Native delivery имеет schemaVersion2, work.slots и полный questions каталог.

## Название, учебные метаданные и обзор работы (unreleased)

Selected Body v2 передаёт вопросу читаемый `title`, необязательные `difficulty`
и `time`, работе — публичный `introduction`. Для native delivery название
обязательно и попадает в `info.json.title`; canonical ID/key и UUID сохраняются.
Сложность и ожидаемое учебное время показаны одним компактным блоком условия,
не добавляются в native JSON и не изменяют timeout проверяющего инструмента.

Публичное введение переносится в `infoAssessment.json.text` как HTML.
Оно не повторяет назначения/альтернативы из native zones. Общий renderer
сохраняет проверки fragments, public resources и private roles, переносит
вложения обзора в `clientFilesCourse` и использует штатный assessment токен
`{{ client_files_course }}`. Question token остаётся отдельным
`{{options.client_files_question_url}}`. Буквальные авторские Mustache строки
экранируются до добавления служебных токенов. Материалы открываются в отдельной
вкладке, локальные anchors остаются внутри вопроса. Самостоятельный self-target
убирается Core по canonical identity; остальные ссылки разрешаются через
публичный QRC контракт. Неизвестные цели не становятся фиктивными URL.

## Необязательные дополнительные исходники Java

Локальный unreleased candidate переносит Core project-check `additional-java-sources` в закрытое `additionalJavaSources` runtime descriptor. Опция относится только к `java25-junit-v1` / implementation и не является новым PL submission option. Editor-режим сохраняет основные редакторы и добавляет один штатный `pl-file-upload optional-file-names`; upload-режим использует тот же единственный upload с обязательными основными и необязательным ZIP именем. Без policy UI прежний.

Интерфейс сообщает maxFiles/maxFileBytes/maxTotalBytes/maxArchiveBytes и ручной fallback. Штатный общий предел PrairieLearn 5 MB включает весь ответ с редакторными файлами: номинальные 2 MiB ZIP не гарантируются при больших основных файлах. ZIP необязателен и не вводит student helper API. Безопасную инвентаризацию, sourcepath и API staging определяет Platform; student/trusted/reference partitions и exact delivery hashes сохраняются. Это локальная проверяемая поставка, без утверждения о live PL или опубликованном образе.

## Закрытый native Gradle build record

В Core 8.2.2 `java-build` содержит ровно `kind: gradle-jar-v1`, `main-class`
и `artifact`. Имя класса соответствует
`^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$`, имя JAR —
`^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.jar$` (до105 ASCII bytes).
Только exact `java25-gradle-junit-v1` в implementation требует и допускает
этот record; runtime profile должен явно задавать Java25 implementation.
Exporter преобразует только имя `main-class` в `mainClass` внутри
`javaBuild`. Некорректный или отсутствующий record отвергается до публикации
payload, не заменяется старым Java runtime/image. `sourceFiles/testFiles`,
selected byte hashes и API/extras boundary сохраняются. Student Gradle scripts,
публичные tests и заранее собранные JAR не становятся production sources.

Descriptor остаётся schemaVersion1. Рецепт и реальная сборка принадлежат
Platform; source candidate не доказывает archive/image/runtime/course readiness.

## Reference-only work и публичный контекст меню (кандидат8.2.1)

Обычная работа `sec-unit-<суффикс exr>` содержит ровно один fixed slot с
`id: exr-<суффикс>`, одним таким же candidate и required local assignment.
Это транспортная ссылка на существующую задачу, не копия условия или новый
педагогический вид работы. Добровольность всей выбранной единицы, её100
баллов и отдельный учёт задаются принятым содержательным договором и
существующими downstream средствами; экспортёр не добавляет course-final-weight.

Для такой единицы exporter находит optional memberships её exr в
нормализованных исходных assessments. Их независимо проецированные
`publicWork.introduction` получает через существующий `input.body(menu.id)` и
тот же `renderPublicBody`, сохраняя исходные resources и clientFilesCourse.
Меню не становится выбранным assessment и не получает completion/grading.
Отсутствующая или чужая public projection отвергается; raw/full body не
используется как запасной источник.

Повторное использование course/exr сохраняет один question directory только
при равенстве public question facts, grading/submission/source mapping,
ресурсов и всех готовых файлов, включая student artifact. Разные байты либо
семантика вызывают отказ до публикации каталога; первый payload не
побеждает молча. Неоднозначные resource targets также отвергаются.
Общая поддержка external-only вопросов вне конкретного учебного банка
сохраняется. Mixed по-прежнему имеет native External и отдельные auto/manual
компоненты; manual не получает фиктивных tests/runtime.

Bodyv2, deliveryv3 и public resultsv2 сохранены. Exact Core-кандидат закреплён в CI.
Новый whole-course capture/export, доступ Student, Moodle учёт и публикация
кандидата8.2.1 — отдельные последующие проверки.
