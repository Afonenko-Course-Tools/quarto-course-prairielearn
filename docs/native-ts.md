# Native TS: границы PrairieLearn

Эта ветка переносит потребителя на публичную текущую операцию Core. Кандидат
проверяется с Core `54d93f3a4f720b1455e4a9980ac39464dea1dff1`; независимая
приёмка producer→consumer, полная course composition и выпуск выполняются отдельно.
Штатные `entrypoints/export-course.ts` и `export.ts` пока сохраняют прежнюю
композицию: окончательное переключение требует публичного assessment Body и
assignment materialization от Core. Ограниченные проверки ниже не означают
готовность установленного курса.

## Ранняя запись

После Core native pre hook вызывают `prepareNativeAdapter(Core, expectation)`.
`expectation` задаёт физический owner, projection и outputDirectory. Если profiles
не переданы, функция берёт точный ordered список из действительного
`QUARTO_PROFILE` этого native pre. Родительские аргументы рендера список не задают.
Повторная preparation той же generation проверяет сохранённый request; прежние
raw captures остаются на месте. Другая generation получает отдельный каталог.

`native-ts/raw-capture.lua` работает до Core audience projection и независимо
читает exact target через `quarto.format.format_identifier()`. Поддержаны HTML и
revealjs. Capture связывает source, witness, generation, profiles, projection и
фактический document format.

C request сохраняет публично проверенные pending identity, source bindings и
outputDirectory. Внутренний `readNativeAdapterExpectation` читает их как CLI
correlation candidate. Затем требуется новый `Core.withCurrentNativeOperation` с
точным expectation и `createNativeAdapter({root, core, preparedIdentity})`.
Сам request полномочий на материалы не даёт. Stale/foreign identity, смена
profiles/output и отсутствующее поле отказывают до выпуска файлов.

## Исполняемая проверка

Adapter запрашивает ровно четыре `nativeMetadataReadSet` slots:
`configuration`, `assessment`, `projectChecks`, `projectMaterialization`.
Обе стороны сравнения проходят один C canon. Отдельно сохраняется различие
между запрошенным отсутствующим slot и неподдержанным producer envelope.
Lone `configuration` не используется.

`adapter.validateCourse(operation, {expectedSources, courseId})` сначала получает
все authentic callback inputs через публичный `validateRelease`, затем проверяет
grading composition всех документов. При неудаче consumable business state
очищается. Прямой `adapter.validate` сохраняет строгий отказ для неполной
cross-document composition. Закрытые canonical `declaration.answer` потребляет
только PL composition; они не добавляются к public Body/catalog/proof/README/ZIP.
Raw ответ содержит только presence marker. Авторский YAML ответа разбирает Core.

Пять canonical форм lowered в существующий question builder: manual, numeric,
multipart, matching и single-choice. Private `server.py` выставляет конечный
результат по равным автоматическим leaves; manual части остаются вне их
знаменателя. Native формы используют стандартные
[элементы PrairieLearn](https://docs.prairielearn.com/elements/pl-string-input/)
и [server.py](https://docs.prairielearn.com/question/server/). Проверки сгенерированных
функций не заменяют исполнение полного вопроса на закреплённом PrairieLearn.

## Проекты и публикация

`selectNativeCompilerInputs` читает проверенные A1 plans/inventories. Он сохраняет
actual targets `src/main/java`, `src/api/java`, `src/test/java` и
`author/<group>/...`. Дополнительные reference-классы разрешены в своей declared
solution group. Роли, bytes/SHA256/size, расширения, размеры, count и API subset
проверяются до построения runtime descriptor. Прежний `source-selection.ts`
с ограничением student partition остаётся частью прежнего пути.

`java-build` допускает library JAR с двумя ключами `kind` и `artifact`.
Присутствующий `main-class` проходит прежнюю строгую проверку; null/пустое значение
не означают omission. Genuine Gradle recipe, API и JUnit принадлежат Platform.

`exportCourse` принимает готовые `nativeInputs` и private `nativeAnswers` от
composition. Для native operation используют `deferPublish: true`: builder
возвращает `delivery`, одноразовый `publish()` и `discard()`. Публикацию вызывают
после успешного внешнего Core final fence; при исключении подготовку удаляют.

Для Workspace `include-git` проверяется по authentic materialization policy и
исходному `seed_recipe.py`. Непустые `common-files` требуют exact binding к
проверенному student inventory: `student/` задаёт partition, оставшаяся часть —
actual A1 target. C не создаёт новый target из metadata. Source path после native
Quarto rebasing нормализуется в том же C canon относительно authentic source;
containment, declared dependency и bytes match сохраняются. Каноническая A/main
и upstream seed передаются существующим Workspace helpers. Фактический image и
возврат из запущенного Workspace квалифицируются отдельно.
