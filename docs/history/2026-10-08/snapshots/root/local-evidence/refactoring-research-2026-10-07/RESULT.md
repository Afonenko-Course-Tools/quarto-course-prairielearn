# Исследование рефакторинга — 7 октября 2026

Проведены чтение текущей архитектуры девяти репозиториев, проверка GitHub main,
анализ существующих проверок и первичных документов Quarto/Pandoc/Rust/Clang.
Рабочий код не изменялся; обновлены только планы и точка входа.

## Проверенная база

Точные source SHA, tracked main и исходные изменения:
[source-baseline.json](source-baseline.json).
Удалённые main прочитаны GitHub API и совпали со всеми девятью local HEAD;
remote receipt — [remote-heads.json](remote-heads.json). Fetch/reset не выполнялись.
Предшествующие изменения owner-планов сохранены.

## Нативные пробы

30 завершённых сравнительных запусков на Quarto 1.10.18/1.11.5.
Все probes — временные минимальные документы, не изменения runtime расширений.
Изначальная попытка остановилась до Lua из-за readonly default Sass KV cache;
для исследования XDG_CACHE_HOME направлен в отдельный writable /tmp каталог,
HOME не менялся. Environment failure не трактуется как warning policy.

| Проба | Без strict | С native strict | Одинаково на обеих версиях |
| --- | --- | --- | --- |
| pandoc.log.warn | exit 0, HTML создан | exit 1, HTML не создан | Да |
| quarto.log.warning | exit 0 | exit 0 | Да |
| plain stderr WARNING | exit 0 | exit 0 | Да |
| quarto.log.error | exit 0 | exit 0 | Да |
| Publisher, strict только у root CLI | child warning, root/child HTML созданы | exit 0 | Да |
| Publisher, native strict у child | Не проверялось | exit 1, root/child HTML не созданы | Да |
| Публичная config strict + CLI override false | Не проверялось | Явный false даёт exit 0 | Да |

Receipts: [warnings.json](warnings.json),
[composition-warnings.json](composition-warnings.json),
[native-override.json](native-override.json).
Сохранённые fixtures/logs лежат в internal `probes/`; исходные временные
запуски — /tmp/course-refactor-*-20261007. Их ошибочные примеры не публикуются
в руководстве или демонстрационных группах.

Source на обеих версиях: native default показывает встроенный источник;
native repo показывает один GitHub URL; нынешняя пара code-tools repo и
repo-actions source — два одинаковых URL. Reveal render проходит, но HTML
Code Tools не показывает. Native lang ru сохранён во всех восьми случаях.
Receipt: [native-source.json](native-source.json).

## Архитектурные выводы

Core уже несёт source/ID в DocumentResult/Body. Удаляемые повторы локальны:
contract.kind/metadata перед describe и повторный raw assessment collection.
Raw/projected collection, Release/CUE/Body API guards сохраняют отдельные входы.
Global accumulator не нужен: native CUE --all-errors уже существует, остальное
остаётся последовательным. Experimental diagnostics/report/Graphlib не переносится.

Внешние причины сейчас местами теряются в answer catches и ADAPTER wrappers;
Core/QRC warning regex отличается от native policy. План сохраняет tool/exit/
stdout/stderr/cause, существующие ID и нынешнюю организацию CI. Широкий ADAPTER
не переименовывается; компонент/вопрос/поле и подсказка делают его информативнее.

Документация остаётся native website. Для central default выбираются стандартные
Code Tools без второго source действия; repo/URL варианты продолжают иметь
штатный смысл. Все producer переводы выполняются до новой immutable поставки;
central готовые HTML не переписываются. Отрицательные тесты остаются внутренними.

## Первичные источники

- [Rust: структура и стиль диагностик](https://rustc-dev-guide.rust-lang.org/diagnostics.html):
  отделить сообщение, контекст и подсказку, избегать повторов одной причины.
- [Clang: проверка диагностик](https://clang.llvm.org/docs/InternalsManual.html#verifying-diagnostics):
  проверять ожидаемую диагностику и лишние сообщения, а не только факт отказа.
- [Pandoc log API](https://pandoc.org/lua-filters.html#module-pandoc.log):
  native ScriptingWarning и журнал Pandoc.
- [Pandoc fail-if-warnings](https://pandoc.org/MANUAL.html#general-options):
  native warning failure и boolean override; поведение проверено локально.
- [Quarto Code Tools](https://quarto.org/docs/output-formats/html-code.html#code-tools),
  [repo links](https://quarto.org/docs/websites/website-navigation.html#github-links),
  [code-links](https://quarto.org/docs/output-formats/html-basics.html#code-links-and-other-links):
  разные назначения текущего исходника и связанных файлов.
- [Quarto language](https://quarto.org/docs/authoring/language.html):
  native локаль не переводит написанные автором объяснения.
- [Project scripts](https://quarto.org/docs/projects/scripts.html):
  самостоятельные операции pre/post и их public environment.

Текущее source исследование не является полным прогоном инструментального CI.
По Core отдельно прошли native-release, canonical-model, vocabulary sync и
navigation-model. Остальные полные проверки перечислены как будущие шаги плана.
Ни tool releases, ни Pages, ни курс не изменялись.

## Проверка готового плана

Выполнено самостоятельное сопоставление задач с требованиями, сигнатурами
и зависимостями. Дополнительные reviews нашли и исправили пропущенные import/
ownership guards, отдельные bank configs, неточные пути и термин promotion Print.
CLI-проверка сохранения cause добавлена как отдельное условие будущей реализации.

[Baseline checks](baseline-checks.json) повторены корневым агентом: native-release,
canonical-model, vocabulary sync и navigation-model завершились успешно.
[Проверка документов](plan-validation.json): 15 документов, 95 локальных ссылок,
сохранение прежних частей семи owner-планов, whitespace checks девяти репозиториев.
Все runtime/author QMD/config/workflow исходники остались без изменений;
новые файлы репозиториев — только пять планов самостоятельных владельцев.

Следующий шаг — пользовательское ревью плана, затем отдельно выбранное выполнение.
Неразрешённых требований по итогам исследования нет; новые вопросы при реализации
возвращаются в обсуждение до зависимых изменений.
