# Задания курса в PrairieLearn

Расширение извлекает платформенные параметры заданий и работ, проверяет их CUE
и явно экспортирует выбранные вопросы в нативные каталоги PrairieLearn.
Общий банк и `.task-items` принадлежат Core; правила попыток, назначения и
оценки принадлежат PrairieLearn.

```sh
cd bank
quarto add Afonenko-Course-Tools/quarto-course@v3.0.0 --no-prompt
quarto add Afonenko-Course-Tools/quarto-course-prairielearn@v2.1.0 --no-prompt
```

```yaml
project:
  pre-render: _extensions/Afonenko-Course-Tools/course-core/entrypoints/pre.ts
  post-render: _extensions/Afonenko-Course-Tools/course-core/entrypoints/post.ts
course:
  adapters: [prairielearn]
filters: [course-core, course-prairielearn]
```

Задайте `course.id` один раз в корне логического курса. Установите Core и
адаптер в экспортную книгу штатной командой `quarto add` с конкретными
совместимыми релизами. Фильтр Core предшествует адаптеру. `course-role` и
`difficulty` необязательны; заданные значения проверяются. Путь `project`
проектного задания относится к корню выбранной книги.

````qmd
:::: {#exr-clamp target="prairielearn" project="/projects/clamp"}
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

::: {.task-items}
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

```json
{"questions":{"exr-clamp":{"topic":"Java","files":["Clamp.java"],
"externalGradingOptions":{"image":"docker.io/library/gradle:9.1.0-jdk25",
"entrypoint":["sh","/grade/tests/grade.sh"],"timeout":60}}}}
```

Результат: `questions/<course-id>/<exr-id>/info.json`, `question.html`,
`clientFilesQuestion` из `<project>/student` и приватные `tests` из
`<project>/tests`. Соседний `reference` не публикуется. UUID определяется
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
