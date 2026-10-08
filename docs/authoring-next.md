---
type: authoring-guide
component: course-prairielearn
status: accepted-next
updated: 2026-10-08
---

# Новый банк и поставка PrairieLearn

Это подготовка согласованного следующего выпуска, а не обещание опубликованной версии. [Целевой контракт Core](../../quarto-course/spec/authoring-model-next.md) задаёт общую модель; [план владельца](plans/2026-10-08-implementation.md) фиксирует порядок внедрения и свежие проверки. Существующие публичные API владельца сохраняются. После реализации и проверки эти правила переносятся в действующий контракт и README. Минимум следующего выпуска — Quarto 1.11.5, CUE 0.17.1.

Core владеет банком, условиями, решениями и общими назначениями. PrairieLearn сохраняет свою отдельную политику `assessment.prairielearn`, binding вопросов, student starter и закрытые tests. `target`/`project` подключают платформу, а не включают банк.

Канонические задачи находятся только в явной области `exercise-bank: true`. У каждой свои `difficulty` и положительное целое `time`; эффективное `statement-visibility` задано на задаче или через `exercise-statement-visibility` в native metadata. Обычный Quarto вне этой области не получает обязательных банковских полей.

Body сохраняет `schema: course-body-package-v1`. `visibility: public` остаётся participant-safe payload, а `statementVisibility: open|restricted` отвечает за публикацию условия. Restricted выбранное условие можно выдать участнику в `question.html`. Guard public не ослабляется: solution/closedKey/gradingNotes и закрытые маркеры всё ещё отклоняются. `clientFilesQuestion` берётся из `student`, `tests` остаются приватными, `reference` не поставляется.

Работа имеет kind `lab|seminar|practical|test`, упорядоченные qualified `items` и обязательные `assignments` с точно теми же qualified ключами. Значение — `{stage?, requirement, workMode}` с общими enum Core. Для test/practical все вопросы restricted. Binding по локальному `q.id` — отдельная платформенная карта; его не следует переписывать в ключи assignments. Native CUE также продолжает читать локальную Course-модель.

Несколько `.task-items` образуют один состав; у назначения `requirement`/`work-mode` задаются на Span ссылки. Stage demonstration допустим только для открытой канонической demonstration с фактическим публичным решением. Для test/practical ссылку на открытый разбор помещают в `.assessment-preview`, вне назначений. В delivery не входят preview, внешние заголовки и неназначенные задачи; внутренний заголовок условия остаётся.

`attempts`, `pass.at-least` и `assignment` принадлежат PrairieLearn и не подменяют общую обязательность работы. Экспорт вопросов не создаёт activity, не назначает пользователей и не запускает image. `examples/java-gradle` выполняет настоящие локальные Java/Gradle проверки и отдельно создаёт поставки. Серверный импорт/контейнерное исполнение подтверждаются на платформе.

Сейчас release pins ещё указывают на последние опубликованные теги. Новые install/demo/source refs появятся только после решения о версиях и успешных releases; новый URL до этого не выдумывается. Готовый asset должен содержать точный producer commit и фактические зависимости в `BUILD.json`. Эта подготовка не подтверждает render, CI или выпуск.
