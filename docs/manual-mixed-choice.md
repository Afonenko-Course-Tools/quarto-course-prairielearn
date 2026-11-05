# Ручная часть, публичные ресурсы и выбор задачи

В `prairielearn.question-defaults` или адресном `prairielearn` вопроса `grading: {method: manual}` задаёт штатный Manual upload без фиктивного runtime/project-check. `grading: {method: mixed}` сохраняет External проверку и требует обе явно заданные части `auto-points`/`manual-points`. Эти компоненты нельзя смешивать с `question-points`/ceiling. Числа остаются политикой конкретного курса, exporter их не выбирает.

Один `.task-alternatives` с `selection=choice requirement=required` задаёт один обязательный слот. Экспорт создаёт отдельную зону `bestQuestions:1`, показывает все варианты и не превращает выбор студента в random. `selection=random` сохраняет штатный `numberChoose:1`.

Экспортёр получает действительные student-файлы через текущую операцию Core;
ZIP собирает установленный Download. Вопрос содержит заготовку, README и
адресные ресурсные ссылки. Закрытые преподавательские материалы в них не входят.
Библиографические ссылки обрабатывает native projection Core; авторские текст,
код, смысловые заголовки и полезные ссылки сохраняются.

Delivery v5 хранит явные grading/submission bindings всех вопросов.
Описания открытых проверок автор пишет обычным Markdown в Pandoc Div
`.public-tests` внутри условия. Тот же блок проходит через существующий Body
в вопрос PrairieLearn и через Core materializer в README стартового комплекта.
Таблицы, код, формулы и ссылки остаются обычными узлами Pandoc; отдельного
формата полей для описания проверок нет. Настоящие публичные JUnit-файлы
остаются частью стартового комплекта; закрытые проверки не публикуются.

Для unlimited Homework retries существующий `question-defaults.single-variant: true` передаётся в native `singleVariant:true`. Его фактическая семантика, лучший результат, доступность и ручная часть проверяются на конкретной конфигурации; одно число attempts само по себе не означает unlimited.
