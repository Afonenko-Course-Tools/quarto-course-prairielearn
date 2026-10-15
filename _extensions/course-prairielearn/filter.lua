local __metrics=require("./observability/bridge").create_metrics("course-prairielearn",1)

local function __perfFilters(filters)
 for key,value in pairs(filters) do
  if type(value)=='function' then filters[key]=__metrics.wrap_sync({id="course-prairielearn.filter.handler."..tostring(key),kind=key=='Pandoc' and 'phase' or 'function'},value)
  elseif type(value)=='table' and type(key)=='number' then filters[key]=__perfFilters(value) end
 end
 return filters
end
local native = require("./native")
local diagnostics = require("./diagnostics")
return __perfFilters({{Pandoc = function(doc)
  if not doc.meta.course then return doc end
  assert(doc.meta["course-core-processed"] == true,
    diagnostics.message("PL.FILTER_ORDER", "Фильтр course-core должен предшествовать course-prairielearn: видимость обрабатывается до извлечения данных", {source = quarto.doc.input_file, field = "filters", hint = "Укажите filters: [course-core, course-prairielearn]"}))
  local active = false
  for _, name in ipairs(doc.meta.course.adapters or {}) do
    if pandoc.utils.stringify(name) == "prairielearn" then active = true end
  end
  if not active or doc.meta["course-adapters-read"] == true then return doc end
  native.write(doc, native.read(doc))
  return doc
end}})
