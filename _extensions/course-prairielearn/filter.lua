local assessment = require("./assessment")
local contract = require("./contract")

return {{Pandoc = function(doc)
  if not doc.meta.course then return doc end
  assert(doc.meta["course-core-processed"] == true,
    "Фильтр course-core должен предшествовать course-prairielearn: видимость обрабатывается до извлечения данных")
  local root = assert(quarto.project.directory)
  local input = quarto.doc.input_file
  if pandoc.path.is_relative(input) then input = pandoc.path.join({root, input}) end
  local source = pandoc.path.make_relative(input, root)
  local value = {source = source, exercises = pandoc.List(),
    assessment = assessment.collect(doc.meta)}
  doc:walk({Div = function(d)
    if d.attributes.target == contract.name then
      value.exercises:insert({id = d.identifier, payload = {grading = contract.vocabulary.grading[1]}})
    end
  end})
  local directory = root .. "/_generated/course-spec/" .. contract.name
  pandoc.system.make_directory(directory, true)
  local file = assert(io.open(directory .. "/" .. pandoc.utils.sha1(source) .. ".json", "w"))
  file:write(pandoc.json.encode(value)); file:close()
  return doc
end}}
