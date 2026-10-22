# Ручная часть, публичные ресурсы и выбор задачи

В `prairielearn.question-defaults` или адресном `prairielearn` вопроса `grading: {method: manual}` задаёт штатный Manual upload без фиктивного runtime/project-check. `grading: {method: mixed}` сохраняет External проверку и требует обе явно заданные части `auto-points`/`manual-points`. Эти компоненты нельзя смешивать с `question-points`/ceiling. Числа остаются политикой конкретного курса, exporter их не выбирает.

Один `.task-alternatives` с `selection=choice requirement=required` задаёт один обязательный слот. Экспорт создаёт отдельную зону `bestQuestions:1`, показывает все варианты и не превращает выбор студента в random. `selection=random` сохраняет штатный `numberChoose:1`.

Private stage передаёт Core materialization receipt через `--staging-receipt`. Exporter читает точный student inventory, а ZIP собирает установленный Download; второго assembler нет. Вопрос содержит starter ZIP, README и адресные ресурсные ссылки. Закрытый teacher overlay не включается в эти материалы. Bibliographic Cite/references исключаются только из native body projection; обычный текст, код со скобками, смысловые заголовки и полезные авторские ссылки сохраняются.

Delivery v3 хранит явные grading/submission bindings всех вопросов. Public case feedback задаётся в существующем `project-check` через `public-cases`: обязательные `id`, короткое `name` (что проверяется), `test`, `expected`, хотя бы одно из `input/state/action`. Только явный публичный случай может получить observed actual/status; закрытые проверки остаются private. Название и данные показываются в RESULTS, а не приписываются условию.

Для unlimited Homework retries существующий `question-defaults.single-variant: true` передаётся в native `singleVariant:true`. Его фактическая семантика, лучший результат, доступность и ручная часть проверяются на конкретной конфигурации; одно число attempts само по себе не означает unlimited.
