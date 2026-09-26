# Programming Course PrairieLearn

Дополнение **1.2** к Course Core **1.1** для проектных заданий с внешней проверкой
и декларативной политики контрольных. Оно извлекает и проверяет авторские
данные Quarto; экспортёр курса PrairieLearn в эту поставку не входит.
Описания упражнений версии 1.0 остаются совместимыми.

## Установка

```sh
quarto add AfonenkoA/programming-course-core-specification
quarto add AfonenkoA/programming-course-prairielearn-specification
```

Нужны Quarto ≥ 1.10, CUE ≥ 0.17 и Course Core ≥ 1.1. Рабочий путь не должен
содержать пробелы из-за разбора project hooks в Quarto 1.10/1.11. Кириллица
допустима. Python, Node.js и отдельный Deno не требуются.

В `_quarto.yml`:

```yaml
course:
  schema: "1.0"
  id: programming
  validate: true
filters: [course-core, course-prairielearn]
prairielearn:
  assessment-defaults:
    attempts: 3
    pass:
      at-least: 2
    assignment:
      mode: assessment-id
```

## Задание и контрольная

````qmd
---
assessment:
  kind: test
  prairielearn: {}
---

# Защита исследования {#sec-essay-decoding}

::::: {.when-full}

:::: {#exr-decoding-experiment target="prairielearn" project="/decoding/projects/experiment"}
## Анализ декодирования

Условие задания с точным контрактом входных и выходных данных.

::: {.grading-notes}
Критерии проверки и ограничения закрытых тестов.
:::
::::

<!-- Два остальных упражнения определяются аналогично. -->

::: {.assessment-items}
1. @exr-decoding-experiment
2. @exr-decoding-tests
3. @exr-decoding-implementation
:::

:::::
````

Первый блок упражнения — заголовок. `project` указывает существующий каталог
от корня проекта Quarto; допустима произвольная глубина вложенности.
`.when-full` — компактная форма видимости Course Core. Закрытые блоки
удаляются до извлечения модели `student`.

`assessment.prairielearn: {}` явно подключает общие значения. Локальные поля
переопределяют их; локальная `assignment` заменяет общую стратегию целиком.
Без этого раздела политика PrairieLearn не применяется. Все члены подключённой
контрольной должны иметь `target="prairielearn"`. Порог — число полностью
выполненных заданий; количество заданий определяется ссылками.

Режим `assignment.mode: assessment-id` создаёт устойчивую метку из
`course.id` и канонического ID контрольной. Перемещение страницы не меняет
метку. Явное `assignment.student-label` также допустимо, например для
объединения основной защиты и пересдачи. Эти сведения не назначают вариант
студенту на сервере.

Условие хранится в QMD, а `.grading-notes` ядро отделяет от него в модели.
Вручную создавать `question.html` не требуется. Публичные демонстрации
оформляются с `target="manual"` и не становятся вопросами PrairieLearn.
Нормативные правила и граница будущего экспорта описаны в
[авторском профиле](docs/authoring.md).

## Пример и проверка

```sh
cd examples/course
quarto add AfonenkoA/programming-course-core-specification
quarto add ../..
quarto render --profile student
quarto render --profile full
```

В примере есть публичное упражнение, закрытая контрольная с тремя проектными
вопросами и демонстрация `manual`. Для локального ядра вместо GitHub укажите
путь к репозиторию ядра. После изменения расширения обновите установленную
копию командой `quarto add ../..`.

Из корня репозитория:

```sh
quarto run tests/check.ts /absolute/path/to/course-core
```

Аргумент — каталог расширения, содержащий `_extension.yml` и `spec/core.cue`.
Проверка рендерит временный курс, проверяет профили, стабильность меток,
наследование политики, совместимость и отклонение неверных данных.
Пути к программам можно задать через `QUARTO` и `CUE`.

В Git хранятся исходники, QMD, примеры, спецификации и `.gitignore`.
Установленные зависимости примеров и результаты сборки исключены.
Адрес репозитория участвует только в установке и не используется при рендере.
