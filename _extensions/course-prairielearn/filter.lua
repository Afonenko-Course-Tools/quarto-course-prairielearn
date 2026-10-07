local native = require("./native")
local diagnostics = require("./diagnostics")
return {{Pandoc = function(doc)
  if not doc.meta.course then return doc end
  assert(doc.meta["course-core-processed"] == true,
    diagnostics.message("PL.FILTER_ORDER", "Фильтр course-core должен предшествовать course-prairielearn: видимость обрабатывается до извлечения данных", {source = quarto.doc.input_file, field = "filters", hint = "Укажите filters: [course-core, course-prairielearn]"}))
  local active = false
  for _, name in ipairs(doc.meta.course.adapters or {}) do
    if pandoc.utils.stringify(name) == "prairielearn" then active = true end
  end
  if not active then return doc end
  native.write(doc, native.read(doc))
  return doc
end}}
