# Programming Course PrairieLearn

Дополнение к учебному профилю **1.0** для заданий PrairieLearn с внешней проверкой проекта. Упражнение содержит путь к проекту; расширение добавляет `extensions.prairielearn.grading: external` в нормализованную модель Course Core.

Рабочий каталог должен находиться в пути без пробелов: это ограничение разбора проектных hooks в Quarto 1.10/1.11. Кириллица допустима.

## Установка

```sh
quarto add AfonenkoA/programming-course-core-specification@v1.0.0
quarto add AfonenkoA/programming-course-prairielearn-specification@v1.0.0
```

В `_quarto.yml`:

```yaml
course:
  schema: "1.0"
  id: programming
  validate: true
filters: [course-core, course-prairielearn]
```

Требования: Quarto ≥ 1.10 и CUE ≥ 0.17. Python, Node.js и отдельный Deno для инструментов не нужны.

## Задание

````qmd
:::: {#exr-clamp target="prairielearn" project="/projects/clamp"}
## Ограничение диапазона

Реализуйте функцию, ограничивающую число заданным диапазоном.
::::
````

`project` обязателен и указывает существующий каталог от корня проекта Quarto. Первый блок упражнения — заголовок. Обычные подзаголовки допустимы. В состав лабораторной, контрольной или экзамена задание включается штатным контейнером `.assessment-items` ядра.

## Пример

```sh
cd examples/course
quarto add AfonenkoA/programming-course-core-specification@v1.0.0
quarto add ../..
quarto render
quarto preview
```

`quarto add ../..` устанавливает текущее расширение из корня этого репозитория. Для локального ядра замените команду установки с GitHub на `quarto add ../../../programming-course-core-specification`, если репозитории расположены рядом. Можно указать любой другой путь к ядру; имя рабочего каталога не используется кодом расширения.

Пример содержит упражнение `clamp`, Java-заготовку студента, авторскую реализацию и лабораторную. Java не запускается при сборке книги. Облачные ВМ и каталог ссылок этому примеру не нужны.

Схема поставляется в `_extensions/course-prairielearn/spec/prairielearn.cue`. Расширение проверяет профиль авторских заданий. Генерация PrairieLearn `info.json`, UUID, контейнеров grader, `results.json` и выполнение Java относятся к отдельному компилятору. Идентичность задания задаётся парой `course.id + exercise.id`, независимо от расположения QMD.

## Хранение в Git

Коммитьте исходники расширения в корневом `_extensions/`, спецификации, QMD, ресурсы и `.gitignore`. Установленные копии в `examples/**/_extensions/` и результаты сборки примеров исключены из Git. После изменения расширения повторите `quarto add ../..` из примера, чтобы обновить его копию.

Адрес `AfonenkoA/...` в инструкции — источник установки пакета. Расширение не обращается к этому адресу при сборке. Для форка или локальной копии изменяется только команда `quarto add`.
