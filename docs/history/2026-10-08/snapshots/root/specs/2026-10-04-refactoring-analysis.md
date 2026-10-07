> Исторический материал общего каталога. Актуальный маршрут: [план от 8 октября 2026](../quarto-course/docs/plans/2026-10-08-course-tools-implementation.md).
> Этот каталог не Git-репозиторий: нужные решения и исходные снимки сохранить у владельцев до очистки.
> Старые версии, ограничения публикации и статусы реализации не являются действующим контрактом.

# Анализ архитектуры и проект рефакторинга Quarto

Анализ подготовлен 4 октября 2026 года по запросу о рефакторинге существующего проекта. Основная рекомендация — сохранить технологический стек и независимые расширения, выделить модель протокола и жизненного цикла в Core и переработать организацию тестов Template как второй основной приоритет. Усиление типов и разделение обязанностей печатного адаптера — следующий независимый этап. Переписывание всех расширений или переход на новый framework не обоснованы найденным кодом.

Это результат анализа и предлагаемый проект изменений. Исходный код пока не изменён. Требования и история из `START-NEXT-CODEX.md` использованы как контекст незавершённой поставки; содержащиеся там команды продолжения не рассматривались как новый запрос на публикацию или интеграцию.

## Область анализа

Изучены только собственные исходники восьми оригинальных репозиториев расширений и собственная интеграция актуального Template. Вложенные установленные копии расширений, альтернативные рабочие копии, архивы, старые evidence outputs, `node_modules`, vendor и исходники библиотек исключены. У библиотек проверены только зависимости, точки вызова и роль в поставке. Тема BSU отсутствует среди оригинальных репозиториев workspace и отдельно не оценивалась.

| Исходный репозиторий | Проверенная ревизия | Роль |
| --- | --- | --- |
| `quarto-course` | `fe576c4` | Core, Presentation, Navigation |
| `quarto-reference-catalog` | `9a4bf6a` | Каталоги и окончательные ссылки |
| `quarto-project-publish` | `ae6b532` | Координация совместного выпуска |
| `quarto-project-download` | `d78a533` | Подготовка архивов и владение запросами |
| `quarto-course-print` | `1ae4f0c` | Публичный пакет и печать PDF |
| `quarto-course-moodle` | `58d988b` | Экспериментальный экспорт банка вопросов XML |
| `quarto-course-cloud` | `b9477d2` | Извлечение и проверка конфигурации среды |
| `quarto-course-prairielearn` | `e56027f` | Извлечение и проверка платформенных настроек |
| Template, checkout `quarto-template-pages-profile-split` | `4c33b15` | Авторская интеграция и потребительские проверки |

Все девять проверенных рабочих деревьев были чистыми. Для Template выбран актуальный кандидат из того же Git-репозитория; старый основной checkout и остальные worktrees не анализировались. Альтернативная Body-реализация не анализировалась; её место в дальнейшем порядке работ взято из существующего плана интеграции.

## Размер и распределение собственного кода

Подсчёт использует физические строки TS, JS, Lua, CUE, Python и shell, включая комментарии и пустые строки. Установленные копии, библиотечный код, assets и отдельные производные словари исключены. Встроенные производные участки схем дают небольшую погрешность, поэтому размеры runtime ниже округлены. Тесты, инструменты и исполняемые fixtures посчитаны отдельно; YAML workflows и документация в эти числа не входят.

| Компонент | Собственный runtime и схемы | Тесты, инструменты и fixtures | Наиболее крупный runtime файл |
| --- | ---: | ---: | --- |
| Core, Navigation, Presentation | около 10 600 | 11 374 | `owner.ts`, 1 738 |
| QRC | около 890 | 1 255 | `navigation.js`, 91 |
| Publisher | 1 753 | 4 386 | `config.ts`, 255 |
| Download | 332 | 211 | `runtime.ts`, 73 |
| Print | 736 | 1 233 | `materialize.ts`, 357 |
| Moodle | 256 | 334 | `transport.ts`, 152 |
| Cloud | 179 | 124 | `cloud.cue`, 72 |
| PrairieLearn | 142 | 329 | `assessment.lua`, 60 |
| Собственная интеграция Template | 174 | 13 127 | `prepare.ts`, 70 |

Около 9 128 строк Core сосредоточены в `owner-preflight`. Шесть файлов содержат большую часть этой сложности: `owner.ts` 1 738, `resources.ts` 1 013, `publication-resources.ts` 987, `native-listing-addresses.ts` 980, `native-listing.ts` 802 и `navigation.ts` 754. Для QRC, Download, Cloud и PrairieLearn общего монолита не обнаружено.

У Publisher крупнейший файл — проверочный `tests/failure-hooks.ts`, 1 930 строк. У Template крупнейшие файлы тоже проверочные: `actual-main-transfer-guards.ts` 1 094, fixture `state.ts` 891 и `actual-main-consumer.ts` 711. Поэтому исходное впечатление о размере расширений следует разделить на runtime, проверки и поставляемые сторонние библиотеки.

Подробный разбор Template, сравнение Deno.test, pytest и BDD, карта целей и предлагаемый первый этап находятся в [проекте структуры тестов](/home/tolya/course-tools/specs/2026-10-04-template-testing-design.md). Проверены не только возможности новой документации, но и API Deno 2.7.14, встроенного в оба канала Quarto.

## Целесообразность инструментов

| Инструмент | Оценка и предлагаемое решение |
| --- | --- |
| Quarto и Pandoc | Сохранить как источник эффективной конфигурации, нативного AST, render outputs и форматного вывода. Собственный parser Markdown или повторная реализация render engine не нужны. |
| Lua | Сохранить для traversal и преобразования Pandoc AST. Это штатный механизм фильтров без отдельного устанавливаемого интерпретатора. [Документация Quarto](https://quarto.org/docs/extensions/lua.html). |
| TypeScript и Deno | Сохранить для оркестрации, файлов и процессов. `quarto run` предоставляет встроенный Deno и алиасы `stdlib/*`; перенос в Node или Python сам по себе не устраняет связанные обязанности. [Project Scripts](https://quarto.org/docs/projects/scripts.html). |
| CUE | Сохранить для учебных ограничений и ресурсной политики. CUE проверяет JSON/YAML по выбранной схеме; TypeScript должен готовить факты и проверять операционную актуальность. [Документация cue vet](https://cuelang.org/docs/reference/command/cue-help-vet/). |
| parse5, xmlbuilder2 | Используются по назначению: QRC разбирает HTML готовой библиотекой, Moodle создаёт XML готовым builder. Собственных универсальных HTML/XML parsers здесь нет. |
| Python | Оправдан в проверках установленной поставки и транспорте CI. Оснований переносить туда общий backend не обнаружено. |
| Node, npm, esbuild, Playwright | В рассмотренных местах это инструменты разработки, подготовки bundles и браузерных проверок. Их следует отличать от требований установленного runtime. |
| ZIP writer Download | Собственная реализация занимает 36 строк и выпускает детерминированный STORE ZIP. Замена оправдана при требовании compression, streaming или ZIP64; текущий размер не свидетельствует о необходимости новой зависимости. |

Новые библиотеки должны поставляться внутри соответствующего `_extensions` с локальными импортами. Наличие helper или npm cache в developer checkout не доказывает работоспособность установленного расширения. Quarto документирует локальное включение сторонних библиотек для скриптов. [Project Scripts](https://quarto.org/docs/projects/scripts.html).

Graphlib, Ajv и Cytoscape из будущего плана не следует добавлять ради текущего рефакторинга: соответствующие новые графовые, транспортные и визуальные возможности ещё не входят в выбранный этап. При появлении таких требований использовать готовые библиотеки разумно; собственные алгоритмы или вторую систему учебных правил создавать не требуется.

## Архитектура и границы ответственности

Разделение расширений в целом оправдано. Core отвечает за учебные факты, проекции и актуальность владельца; Presentation — за оформление; самостоятельное расширение Navigation — за интерфейс навигации, history и search в Reveal. Контроль согласованной навигационной публикации находится отдельно в Core `owner-preflight/navigation.ts`. QRC отвечает за каталоги и конечные адреса, Publisher — за совместный staging и выпуск, Download — за архивы, Print и LMS — за представление выбранного пакета.

Публичные точки интеграции уже существуют. В Core есть небольшой [CheckPorts](/home/tolya/course-tools/quarto-course/_extensions/course-core/application/check.ts:3) и чистая [сборка модели](/home/tolya/course-tools/quarto-course/_extensions/course-core/domain/assemble.ts:7). QRC структурно принимает небольшой контекст Publisher, сохраняя самостоятельную установку. Download предоставляет [публичный API владения запросами](/home/tolya/course-tools/quarto-project-download/_extensions/project-download/ownership.ts:7). Это подходящие опоры для рефакторинга.

Основное нарушение границ находится внутри Core. [owner.ts](/home/tolya/course-tools/quarto-course/_extensions/course-core/owner-preflight/owner.ts:175) одновременно выполняет аудит источников, запускает инструменты, проверяет пути, определяет transport types, читает sessions, интегрирует Download, выполняет capture/reconciliation/finish и содержит командный runner. `resources`, `navigation`, `capture-projections` и другие модули импортируют типы и runtime-функции обратно из `owner.ts`. Между `owner` и `navigation` есть взаимные runtime-вызовы; дополнительный цикл `native-listing-addresses` ↔ `publication-resources` использует динамический импорт.

Простое распределение функций по нескольким файлам сохранит эти циклы. Требуется выделить нижний слой типов и технических операций, а orchestration и специализированные validators разместить выше него. Остаточные циклы между Navigation, ресурсами и завершением нужно разбирать по одному, сохраняя различия их authority checks.

Отдельный следующий узел — [build в publication-resources](/home/tolya/course-tools/quarto-course/_extensions/course-core/owner-preflight/publication-resources.ts:497), около 443 строк. Он совмещает сбор witnesses, проверку child owners, регистрацию runtime, обработку collisions и grants. Его разделение лучше выполнять после выделения общего протокола, чтобы не создать новые взаимные импорты.

## Предметная модель и строковые значения

Учебный словарь уже имеет единый источник: [contract-vocabulary.json](/home/tolya/course-tools/quarto-course/_extensions/course-core/contract-vocabulary.json) и [генератор согласованных представлений](/home/tolya/course-tools/quarto-course/tools/sync-contract.mjs:16). Похожий подход есть у QRC, Cloud и PrairieLearn. Эти механизмы следует развивать.

Проблема проявляется в двух местах. Во-первых, существующие типы используются непоследовательно: например, [Assessment.kind](/home/tolya/course-tools/quarto-course/_extensions/course-core/domain/model.ts:9) объявлен как `string`, хотя словарь содержит `AssessmentKind`. Во-вторых, operational model многократно повторяет профили, фазы, роли и origins, а внешние inspect/JSON данные переходят в `any`. [Session и Invocation](/home/tolya/course-tools/quarto-course/_extensions/course-core/owner-preflight/owner.ts:430) сосредоточены в orchestration-файле; [Template State](/home/tolya/course-tools/quarto-template-pages-profile-split/_publication/state.ts:8) использует широкие строковые ключи и непосредственно присваивает результат `JSON.parse` типизированной переменной.

Предлагается использовать общие union-типы и небольшой словарь протокола у владельца, проверять JSON как `unknown` и выдавать типизированные результаты после существующих guards. Для различающихся идентичностей полезны отдельные типы owner, attempt, namespace и canonical key, но только там, где это предотвращает реальное смешение значений. Классы для каждой строки и глобальный список всех YAML keys сделают код менее ясным.

Сериализуемые поля, filter IDs, Quarto formats, diagnostic codes и пути установленных assets остаются частью внешнего контракта. Их значения сохраняются. Учебные ограничения продолжают принадлежать CUE; новые TS-типы не должны становиться независимым semantic validator.

Локальное дублирование правил всё же найдено: [native-listing.cue](/home/tolya/course-tools/quarto-course/_extensions/course-core/owner-preflight/native-listing.cue:31) и [native-listing.ts](/home/tolya/course-tools/quarto-course/_extensions/course-core/owner-preflight/native-listing.ts:670) повторяют ограничения sort, pageSize и UI. Удаление таких проверок меняет путь отказа и требует отдельного сравнения диагностик. В первый механический этап его включать не следует.

## Другие конкретные улучшения

В Print определён [PublicBodyPackage](/home/tolya/course-tools/quarto-course-print/_extensions/course-print/infrastructure/transport.ts:3), но входы `validatePackage`, `preparePrint` и [materialize](/home/tolya/course-tools/quarto-course-print/_extensions/course-print/application/materialize.ts:125) продолжают принимать `any`. `materialize` объединяет fingerprint, reuse receipts, подготовку файлов, compiler invocation, dependency closure, promotion и rollback. Типизированные входы и разделение этих обязанностей дадут больше пользы, чем замена инструментов печати.

Print и Moodle содержат одинаковый 107-строчный блок helper функций для поддерживаемого AST, ресурсов и subprocesses. Это риск расхождения протокола. Сейчас лучше закрепить совместимые примеры и проверки; новый общий runtime-пакет добавлять только после выбора владельца публичной Body-границы. Production-пакет Print и экспериментальная capability Moodle имеют разные требования к закрытым данным и не должны сливаться в один неограниченный DTO.

У Publisher имеет смысл отделить native/filesystem discovery от pure normalization в [config.ts](/home/tolya/course-tools/quarto-project-publish/_extensions/project-publish/infrastructure/config.ts:21), вынести `FailurePoint` и чистую композицию `failureError` из инфраструктуры и разделить большой failure suite на сценарии. Публичные context types уже находятся в domain. У Download следует явно оформить существующий optional Core resolver; общий publisher архивов сейчас знает `course-model` и `exr-`. Эти изменения имеют меньший приоритет, чем Core и Print.

Cloud и PrairieLearn сейчас извлекают и проверяют настройки. Их контракты отмечают `export_implemented: false`; они не являются готовыми системами платформенной доставки. Moodle реализует экспериментальный XML exporter банка вопросов; реальный серверный roundtrip не подтверждён. Рефакторинг не закрывает эти функциональные этапы автоматически.

Два небольших кандидата на отдельные исправления: Print [по умолчанию ищет P0 fixture в соседнем историческом worktree](/home/tolya/course-tools/quarto-course-print/tests/export.test.ts:8); Moodle [проверяет defaultGrade через coercing comparison](/home/tolya/course-tools/quarto-course-moodle/_extensions/course-moodle/application/export.ts:12), допускающий числовую строку и `Infinity`. Явный fixture и конечное положительное число улучшают воспроизводимость и контракт входа. Это изменения поведения проверки, поэтому они должны сопровождаться соответствующими отрицательными сценариями и отдельными коммитами.

## Предлагаемый первый этап

Рассмотрены три подхода. Только механическое разбиение быстрее, но оставляет слабые типы и циклы. Полное переустройство стеков и новый общий framework существенно увеличивают риск и объём повторной приёмки. Рекомендуется последовательное выделение модулей с сохранением публичных фасадов.

| Изменение | Конкретная граница | Критерий результата |
| --- | --- | --- |
| Template быстрые тесты | Synthetic factories, именованные contract cases, разделение public transfer и diagnostic retention; проверенный Deno launcher | Сохранены все прежние случаи и независимые expected facts; цель и результат каждого случая видны отдельно |
| Core protocol types | Небольшие модули под `course-core/owner-preflight/owner/` для protocol, failure и runtime primitives | `PreparedOwner`, `Session`, `Invocation`, `OwnerFailure` и существующие функции экспортируются прежним `owner.ts`; нижние модули перестают импортировать facade ради этих определений |
| Core session и source audit | Выделенные parsing/validation и source fingerprint operations | Orchestration не содержит определения transport DTO и длинный session parser; проверки текущих файлов и идентичностей сохраняются |
| Core vocabulary usage | Использование существующего `View` и применимых generated domain types | Повторяющиеся ручные unions уменьшаются; JSON/YAML и диагностика остаются прежними |
| Print transport | `unknown` на входе, проверенный public/experimental result, типизированные header, resources, receipt и Pandoc document | Ошибки формы выявляются существующими guards; закрытые данные по-прежнему отклоняются до материализации |
| Print lifecycle | Отдельные receipt, recipe/dependency, compiler и promotion operations | Главная функция явно координирует этапы; fingerprints, reuse, rollback и asset lookup сохраняются |
| Необязательные малые исправления | Явный Print fixture и конечный положительный Moodle grade | Положительные случаи сохранены; отрицательные случаи воспроизводят прежний пробел и подтверждают исправление |

Точные имена новых внутренних файлов уточняются при составлении implementation plan; новый публичный API не вводится. Весь runtime остаётся внутри устанавливаемого расширения. Выделение общего кода между репозиториями в этот этап не входит.

Сохраняются публичные пути модулей и entrypoints, identity класса `OwnerFailure`, error codes и exit codes 0/1/2, `protocol: 1`, поля и порядок сериализации hashed receipts, schema paths, порядок фильтров и freeze hook, закрытость service/capture ресурсов, current source/attempt/channel authority и сохранность предыдущего публичного выпуска при отказе. Цель — уменьшить связанность и сделать обязанности видимыми; снижение общего числа строк не является самостоятельным критерием.

При переносе функций пути к extension и CUE schemas следует передавать от существующего facade или получать через один фиксированный locator расширения. Механическое сохранение `import.meta.url` после перемещения в `owner/` изменит относительные глубины. Класс `OwnerFailure` определяется ровно один раз и переэкспортируется; отдельные `NativeListingFailure` и `NativeListingProviderFailure` сохраняют свои conversion/catch semantics.

## Незавершённая поставка и проверка

Первый открытый gate из переданного состояния — Template Task3. После него остаются Task4 Body и Navigation, Task5 единая установленная composition и production pins, Task6 итоговый checkpoint. При первой read-only проверке GitHub в ходе анализа Draft PR11 оставался на `55d9fcf`: 13 зарегистрированных checks были успешны, 2 выполнялись; оставшиеся зависимые проверки ещё не зарегистрированы. Кандидат `4c33b15` не опубликован в этом снимке. Последующее обновление API не удалось из-за соединения; это датированное наблюдение, а не текущий онлайн-статус или приёмка кандидата. [PR11](https://github.com/Afonenko-Course-Tools/quarto-template-course/pull/11).

Предлагаемые изменения можно готовить отдельно от текущей попытки приёмки. Объединение Body и Navigation и изменение consumer pins сохраняют исходный порядок gates. Краткие pure checks рефакторинга не заменяют native installed acceptance.

На ноутбуке доступно 8 CPU и около 16 ГБ RAM. Проверены Quarto 1.10.18 и 1.11.5. Системный Deno — 2.9.7, встроенный в Quarto — 2.7.14; CUE из PATH сообщает development build с language 0.16.1 вместо закреплённого 0.17.1. Совместимость текущей среды со всем обязательным corpus пока не установлена. Быстрые проверки следует запускать параллельно; тяжёлые native попытки требуют отдельных output/runtime/temp и контроля памяти.

Свежие проверки, фактически выполненные в ходе анализа:

- Core: согласованность словаря, navigation model, typecheck Navigation/publication resources; pure writer contracts с 52 проверками; Listing address contracts и capture projection contracts.
- Template: 26 Pages transport tests и 163 bounded ActualMain проверки contracts, public transfer и diagnostic retention.
- QRC: package boundaries и import safety.
- Publisher: 19 schema cases.
- Download: архивы, профили, Git ignore, воспроизводимость и очистка.
- Print: 5 Python guards и 7 production pure tests; native PDF case отфильтрован в этом наборе.
- Moodle: 6 Python guards.
- Cloud и PrairieLearn: согласованность производных словарей.

Все перечисленные наборы завершились успешно. Первоначальный прямой запуск трёх pure Core тестов через Deno остановился до выполнения тестов из-за отсутствующей JSR metadata в default cache. Те же тесты прошли через документированный `quarto run` без изменения исходников. Это подтверждает необходимость различать системный Deno и runtime окружение Quarto. TypeScript execution и typecheck также являются отдельными операциями. [Документация Deno](https://docs.deno.com/runtime/fundamentals/typescript/).

После изменений потребуются прежние bounded contracts, проверки malformed/current/stale данных, настоящий installed smoke на обоих каналах и релевантные негативные сценарии. Проверки полного принятого corpus расширяются только при затронутых поведении или неразрешённом риске. Source-проверки, использующие текстовые seams для извлечения production `build`, надо адаптировать к новым модулям, сохранив проверку настоящих predicates.

До 18:00 по Минску разумная цель — законченный первый этап быстрых Template тестов и выделения протокола Core в feature branches с проверкой изменённых границ и компактным итогом. Print следует брать после проверки этого этапа и при достаточном остатке времени. Полная последовательная native приёмка Template и последующая Body-интеграция занимают часы и не могут заранее считаться достижимыми в этот срок. Незакрытые проверки должны быть явно сохранены, а не объявлены выполненными по результатам pure tests.
