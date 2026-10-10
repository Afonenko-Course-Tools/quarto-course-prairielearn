---
type: documentation
component: course-prairielearn
status: current
updated: 2026-10-10
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

Контракт этого ref — **5.0.0**, совместимый с Core **5.0.0**.
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
quarto add Afonenko-Course-Tools/quarto-course@v5.0.0 --no-prompt
quarto add Afonenko-Course-Tools/quarto-course-prairielearn@v5.0.0 --no-prompt
```

Матрица совместимости задаёт контракты Core 5.0.0, exporter 5.0.0 и
Platform CLI/schema 1.0.0. Наличие тегов проверяется в репозиториях владельцев,
а production registry требует опубликованный OCI digest. Эта матрица не
подтверждает публикацию или готовность курса. История сохранена в `docs/releases`.

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

Контракт этого ref использует PrairieLearn `5.0.0` и Core `5.0.0`, Quarto 1.11.5
и CUE 0.17.1. Body использует отдельную
`statementVisibility` и обязательные qualified `assignments`; binding продолжает
использовать локальные ID. Restricted условия допустимы в выбранной participant
поставке, закрытые ключи и решения запрещены. Код и документация выпуска читаются
из одного immutable tag; установленные `_extensions` сохраняются в Git курса.

Полная native-поставка курса доступна через `entrypoints/export-course.ts`:
[пример](examples/native-course/README.md), [контракт автора](docs/authoring.md#полная-native-поставка).
Она не требует binding, export.json или ручного native shell; registry должен
содержать настоящий production digest либо явно выбранный private local candidate.

Полный exporter 5.0.0 требует авторский `question-points`; пример явно объявляет
default 1, который можно заменить в course/directory/document metadata. Баллы,
ceiling и повторные попытки описаны в [контракте](docs/authoring.md#авторские-баллы-и-повторные-попытки-exporter-500);
`inspect-grading.ts` показывает effective policy до создания native delivery.
Опубликованный 4.0.0 сохраняет прежний контракт; 5.0.0 устанавливается по тегу
после публикации и явного обновления metadata курса.

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
