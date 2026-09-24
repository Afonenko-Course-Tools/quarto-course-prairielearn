# Пример курса

Quarto ≥ 1.10 и CUE ≥ 0.17.

Из корня репозитория:

```sh
cd examples/course
quarto add AfonenkoA/programming-course-core-specification@v1.0.0
quarto add ../..
quarto render
quarto preview
```

Если ядро находится в соседнем репозитории полного комплекта, установите его из примера командой `quarto add ../../../programming-course-core-specification` вместо загрузки с GitHub.

`quarto add ../..` копирует расширение из корня репозитория в этот пример. После изменения исходников расширения повторите команду. Установленные копии и результаты рендера исключены через `.gitignore`; QMD и авторские ресурсы остаются под контролем версий.
