---
type: documentation
component: course-prairielearn
status: current
updated: 2026-10-22
---

# Задания курса в PrairieLearn

[Индекс спецификаций](spec/index.md) описывает контракт текущего Git ref.
Версия определяется descriptor этого ref; код и документация устанавливаемого
выпуска читаются из одного тега. Изменения main после выпущенного тега —
**unreleased**. Минимум — Quarto 1.11.5 и CUE 0.17.1.

Расширение извлекает платформенные параметры заданий и работ, проверяет их CUE
и явно экспортирует выбранные вопросы в нативные каталоги PrairieLearn.
Общий банк и `.task-items` принадлежат Core; правила попыток, назначения и
оценки принадлежат PrairieLearn.

Кандидат выпуска этого ref — **8.2.4**, согласованный с Core **8.2.4**.
Он продолжает принятую линию 8.2.1 и добавляет опциональные внешние архивы условий;
изменения Performance 8.2.2 в эту линию не включены. Кандидат 8.2.4 исключает
прямые `.git` файлы из `starter/`, сохраняя исходный ZIP с историей.
Тег 8.2.4 ещё не опубликован.
Предыдущие Core 7.2.0 и exporter 7.1.0 опубликованы. Core 7.2.0 собирает факты API-предпроверки
и политики дополнительных Java-исходников, которые переносит этот exporter.
Расширение экспортирует полный native курс, сохраняет правила выполнения работ и
создаёт source editor с отдельной закрытой поставкой проверок. Для разработки
устанавливайте целые локальные checkout или архивы закреплённых commits:

```sh
cd tasks
quarto add /absolute/path/to/quarto-course --no-prompt
quarto add /absolute/path/to/quarto-course-prairielearn --no-prompt
```

Выпущенные версии устанавливайте по неизменяемым тегам после их публикации:

```sh
quarto add Afonenko-Course-Tools/quarto-course@v8.2.4 --no-prompt
quarto add Afonenko-Course-Tools/quarto-course-prairielearn@v8.2.4 --no-prompt
```

Матрица кандидата задаёт Core 8.2.4 и exporter-кандидат 8.2.4: delivery v3, Body v2 и public results v2.
Platform/Gateway требуют отдельной проверки exact source/digest/interface; прежние
service releases не объявляются совместимыми. Наличие тегов проверяется у владельцев,
а production registry требует опубликованный OCI digest. Эта матрица не
подтверждает публикацию или готовность курса. Выпуски и assets находятся в [GitHub Releases](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/releases); история исполнения сохраняется в Git.

```yaml
lang: ru
fail-if-warnings: true
project:
  pre-render: _extensions/Afonenko-Course-Tools/course-core/entrypoints/pre.ts
  post-render: _extensions/Afonenko-Course-Tools/course-core/entrypoints/post.ts
course:
  adapters: [prairielearn]
filters: [course-core, course-prairielearn]
```

Задайте `course.id` один раз в корне логического курса. Установите Core и
адаптер в экспортную книгу штатной командой `quarto add` с конкретными
совместимыми релизами. Фильтр Core предшествует адаптеру. Канонические задачи объявляются только
в области `exercise-bank: true`. У каждой обязательны собственные `difficulty`
и положительное целое `time`; эффективная политика условия задаётся явно.
`course-role` необязателен. Путь `project` относится к корню выбранной книги.
`target` и `project` задают платформенную привязку и сами банк не включают.

```yaml
# bank/_metadata.yml
exercise-bank: true
exercise-statement-visibility: restricted
```

````qmd
:::: {#exr-clamp difficulty="introductory" time="25" target="prairielearn" project="/projects/clamp"}

## Ограничение значения

Реализуйте метод для включительного интервала.

::: {.grading-notes}
Закрытые критерии проверки.
:::
::::
````

Страница работы имеет собственный стабильный ID (`[a-z][a-z0-9-]*`) и список заданий:

````qmd
---
assessment:
  kind: test
  prairielearn:
    attempts: 3
    pass: {at-least: 1}
    assignment: {mode: assessment-id}
---

# Вариант A {#sec-variant-a}

::: {.task-items stage="classroom"}
1. @exr-clamp
:::
````

При `assignment.mode: assessment-id` устойчивая метка зависит только от
`course.id` и ID работы. Явная `assignment.student-label` заменяет вычисление.
`prairielearn.assessment-defaults` применяется только к явно подключившей
его `assessment.prairielearn`; локальная assignment заменяет общую целиком.
Правила оценки дополнительных заданий задаются на платформе: они не должны
компенсировать невыполнение обязательных. Подробности — [правила авторства](docs/authoring.md).

## Явный экспорт вопросов

После установки запустите из корня логического курса установленный entrypoint:

```sh
quarto run bank/_extensions/Afonenko-Course-Tools/course-prairielearn/entrypoints/export.ts \
  . bank sec-variant-a binding.json /absolute/fresh/output
```

Последующие аргументы — функциональные профили, если они нужны. Core получает
полные исходники выбранной работы, включая контрольные QMD, исключённые из
student HTML. Полный HTML перед экспортом не требуется.

`binding.json` явно задаёт для каждого выбранного задания `topic`, список
принимаемых `files` и `externalGradingOptions` (обязательный `image`,
необязательные `entrypoint`, `timeout`, `enableNetworking`, `environment`).
Экспортёр не выбирает image и не переводит общие формулы оценки в LMS.

Для простого ввода кода задайте `"submission":{"mode":"editor","aceMode":"ace/mode/java"}`
в привязке вопроса. Экспортёр создаёт стандартный `pl-file-editor` с заготовкой
из каждого принятого `student/<file>`. В этом режиме другие файлы локального
проекта не копируются в публичную поставку и не появляются download/upload
элементы. Введённый текст PL сам передаёт external grader как файл; отдельный
workspace или VSCode не требуется. `aceMode` необязателен. По умолчанию либо
при `"submission":{"mode":"upload"}` сохраняется загрузка файлов.
Полные проекты и их ZIP для автономной работы обслуживает `project-download`.


```json
{"questions":{"exr-clamp":{"topic":"Java","files":["Clamp.java"],
"externalGradingOptions":{"image":"docker.io/library/gradle:9.1.0-jdk25",
"entrypoint":["sh","/grade/tests/grade.sh"],"timeout":60}}}}
```

Результат: `questions/<course-id>/<exr-id>/info.json`, `question.html`,
В режиме upload — `clientFilesQuestion` из `<project>/student` и приватные `tests` из
`<project>/tests`. Корневой `student/.gitignore` доставляется как обычный файл starter; прочие
скрытые файлы и вложенные `.gitignore` исключены. `.gitignore` в приватных tests
не доставляется. Соседний `reference` не публикуется. UUID определяется
ключом курса/задания, а не путём QMD. Условие содержит только публичный AST;
решения, ключи и grading notes не входят в HTML. Все проверки предшествуют
записи результата; output должен быть новым каталогом. Символьные ссылки
в исходном проекте отклоняются.

Это поставка вопросов для существующего курса PrairieLearn. Экспортёр не
создаёт assessment/course instance, не назначает пользователей, не запускает
контейнер и не устанавливает доступ. `delivery.json` сохраняет явный состав и
обязательность работы для преподавателя. Само наличие `info.json` не доказывает
серверный импорт или работу выбранного image.

[Автономная Java/Gradle группа](examples/java-gradle/README.md) содержит корень
курса, общий банк, два варианта, исходники и приватные тесты. Её build.ts
выполняет Gradle с шестью проверками авторского решения, требует отказа
незавершённого student starter, затем создаёт два delivery и HTML. Среды
производителей остаются у групп; центральная документация получает готовые
результаты. [Пример метаданных](examples/course/README.md) показывает наследование
правил и student/full; default full в демонстрациях намеренно публичен.

```sh
quarto run tools/sync-contract.ts --check
quarto run tests/check.ts ../quarto-course
deno test --no-config --allow-read --allow-write --allow-run --allow-env tests/export.test.ts
```

Интеграционные проверки устанавливают актуальные payload целиком; CI закрепляет
совместимый Core. Исходный `contract.json` задаёт словарь, CUE — ограничения.
Фильтры не выполняют команды заданий. Нативная поставка следует документации
[question info](https://docs.prairielearn.com/schemas/infoQuestion/),
[external grading](https://docs.prairielearn.com/externalGrading/) и
[client/server files](https://docs.prairielearn.com/clientServerFiles/).

Вложенная native-книга сохраняет `assignment.mode: assessment-id` без локального
`course.id`. Явный экспорт из корня разрешает устойчивую метку платформы по ID
корневого курса и выбранной работы. Функциональные профили, переданные через
Quarto `--profile`, сохраняются при экспорте.

Собственные сообщения содержат ID, русский смысл и доступные source, ID работы
или вопроса, поле и подсказку. Исходные ошибки Core, CUE и Pandoc сохраняются.
См. [справочник диагностики](docs/diagnostics.md).

Контракт этого ref использует exporter-кандидат `8.2.4` и Core `8.2.4`, Quarto 1.11.5
и CUE 0.17.1. Body использует отдельную
`statementVisibility` и обязательные qualified `slots`; binding продолжает
использовать локальные ID. Restricted условия допустимы в выбранной participant
поставке, закрытые ключи и решения запрещены. Код и документация выпуска читаются
из одного immutable tag; установленные `_extensions` сохраняются в Git курса.

Полная native-поставка курса доступна через `entrypoints/export-course.ts`:
[пример](examples/native-course/README.md), [контракт автора](docs/authoring.md#полная-native-поставка).
Она не требует binding, export.json или ручного native shell; registry должен
содержать настоящий production digest либо явно выбранный private local candidate.

Полный exporter 7.0.0 требует авторский `question-points`; пример явно объявляет
default 1, который можно заменить в course/directory/document metadata. Баллы,
ceiling и повторные попытки описаны в [контракте](docs/authoring.md#авторские-баллы-и-повторные-попытки-exporter-500);
`inspect-grading.ts` показывает effective policy до создания native delivery.
Текущий контракт 7.1.0 сохраняет Body v2; установка нового тега требует
фактической публикации и явного обновления metadata курса.

Question variant repetition is also authored metadata. Normal Quarto course,
`_*.yaml`/directory metadata, and document inheritance apply:

```yaml
prairielearn:
  question-defaults:
    topic: Java
    submission: {mode: editor, ace-mode: ace/mode/java}
    single-variant: true
```

An exercise may override this with `prairielearn-single-variant="false"`.
Only YAML booleans and the attribute literals `true`/`false` are accepted.
The normalized question policy carries `single-variant` to native
`info.json.singleVariant`; `inspect-grading` reports its effective value.
When absent the exporter omits the field: pinned Community documents its
native default as `false` (variants may be generated). Declare `true` explicitly
to preserve the earlier exporter's forced single-variant behavior.

## Метрики производительности

Значимые операции и явные обходы AST размечены локальным фасадом ABI 1.
В обычной сборке (`off`, по умолчанию) фабрики возвращают исходные функции:
агент, hooks, часы телеметрии и журналы не загружаются. Расширение самодостаточно.
Сбор метрик включается launcher проекта `quarto-course-performance`; установка
`COURSE_PERF_MODE` сама по себе агент не загружает и не обеспечивает валидные данные.
TypeScript использует wall time, Lua — CPU процесса; шкалы анализируются раздельно.
Counters обходов не являются числом посещённых AST-узлов.

Прежний `COURSE_BUILD_TRACE` удалён; для новых измерений используются фасады ABI 1.
Копии `observability/bridge.ts` и `bridge.lua` синхронизируются из проекта Performance.

## Совместимое обновление producer и consumer

Выпуск 7.0.0 ввёл отдельные `title`, необязательные `difficulty`/`time`
и публичное `introduction` Body v2. Старый закрытый consumer не принимает
новые поля; новый native consumer требует читаемое название. Для опубликованного 8.0.0 устанавливайте
Core 8.0.0 и exporter 8.0.0 вместе по точным неизменяемым тегам. Стабильные UUID
сохраняются; delivery v3 требует согласованного reader.

## Подготовка кандидата 8.2.1

Delivery v3 описывает `external`/`manual`/`mixed` и `selection=choice`. Полностью ручная
задача не получает фиктивную автоматическую оценку; `mixed` сохраняет реальные
автоматический и преподавательский компоненты. Студенческие ресурсы и текущий закрытый pointer проверяются
совместимым Core 8.2.2. Закрытые материалы не входят в student ZIP/site.
Body остаётся `course-body-package-v2`, public results projection — v2.

Обе задачи CI закрепляют один полный Core commit, без переопределения repository variable.
Экспортёр использует готовый Core inventory и не требует Download assembler.
До отдельной публикации `v8.2.1` это кандидат исходников; готовность курса и native service проверяется отдельно.

## Исторический выпуск совместимости 7.1.1

В выпуске 7.1.1 descriptor закреплял Core 7.3.0. Исполняемые файлы экспортёра и форматы
экспорта были сохранены; новое поле показа времени Core не меняет Body v2.

## Сохранённый контракт Native Gradle JAR из8.1.0

Закрытый captured `java-build` разрешён только для exact
`java25-gradle-junit-v1` / implementation и обязателен для этого runtime.
Exporter передаёт `javaBuild: {kind, mainClass, artifact}` без потери metadata;
kind равен `gradle-jar-v1`. Запрещены unknown fields, другой runtime/mode и
небезопасные имена. Sources остаются выбранными Java bytes: build scripts,
готовый JAR и student public tests не входят в native payload. API-precheck и
optional дополнительные Java sources сохраняют собственные границы.

Это локальный source candidate с Core 8.2.2. Полный Platform candidate, exact
registry/image и реальные build/archive/install/course proofs принимаются
отдельно; unit fixture digest не является опубликованным OCI pin. Старые
Core/Exporter 8.0.0 и immutable assets не меняются.

Точная source dependency Core-кандидата: `7c9388cb4d982caf66657ea8f96c09243d64a147`.
Оба CI jobs закрепляют этот commit; hosted exact-head CI ещё должен выполниться
после отдельного разрешённого push. Локальная установка не подтверждает published tag.

## Контекст меню и строгая дедупликация в кандидате8.2.1

Reference-only `sec-unit-*` использует одну исходную задачу и добавляет
публичное введение исходных optional меню через прежний Body renderer.
Raw/full body не подставляется при отсутствии public introduction.
Повторный вопрос сохраняется единожды только при совпадении condition,
source mapping, grading/submission, ресурсов, starter и всего native payload;
конфликт вызывает атомарный отказ. Ручная часть mixed и manual сохраняется.
Новых schema/registry/flags или канонических условий нет.

Это исходники нового кандидата от immutable Exporter8.1 commit0d5e20e6.
Существующий опубликованный8.1 и открытый PR22 не меняются. Тег8.2, hostedCI,
полный экспорт курсов, серверная поставка и Student proof здесь не заявлены.
