# Полная поставка курса PrairieLearn

Текущие кандидаты — Exporter 8.2.2 и bundle Core 8.2.3 (**unreleased**).
API Core 8.1, Body v2 и delivery v3 имеют собственные версии и не повышаются
вместе с номером bundle. Для разработки используйте целые локальные checkout
или архивы закреплённых commits; новые теги устанавливаются после публикации.
Совместимость контрактов не подтверждает наличие тегов или опубликованного OCI digest.

Полная поставка создаётся из банка без ручного binding или native shell.
Установите совместимые Core и PrairieLearn через `quarto add` внутри `tasks`.
Из этого каталога выполните:

```sh
quarto run tasks/_extensions/course-prairielearn/entrypoints/export-course.ts . native --instance pilot --checks-output checks.json --runtime-registry /path/to/platform/runtime-profiles.json
```

Реестр рабочей среды исполнения должен содержать настоящий опубликованный digest.
Только для приватной локальной проверки `--candidate-image sha256:ACTUAL_LOCAL_IMAGE_ID`
явно выбирает уже собранный образ; такая поставка помечается `candidate` и
не публикуется. Файлы `reference` сохраняются в закрытом checks inventory
и не входят в native delivery.

Пилот явно задаёт тестовый интервал публикации 1970–9999. Учебный экземпляр должен
объявить собственные `publishing.start-date` и `end-date` со смещениями времени.
Отсутствующие или некорректные даты отклоняют экспорт; доступ Student определяется
одновременно доступностью экземпляра и назначенными assessment labels.
