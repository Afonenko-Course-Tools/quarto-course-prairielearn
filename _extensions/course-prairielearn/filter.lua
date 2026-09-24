-- The initial adapter profile supports external project grading only.
return {{Pandoc = function(doc)
  if not doc.meta.course then return doc end
  local root = assert(quarto.project.directory)
  local input = quarto.doc.input_file
  if pandoc.path.is_relative(input) then input = pandoc.path.join({root, input}) end
  local source = pandoc.path.make_relative(input, root)
  local value = {source = source, exercises = pandoc.List()}
  doc:walk({Div = function(d)
    if d.attributes.target == "prairielearn" then
      value.exercises:insert({id = d.identifier, payload = {grading = "external"}})
    end
  end})
  local directory = root .. "/_generated/course-spec/prairielearn"
  pandoc.system.make_directory(directory, true)
  local file = assert(io.open(directory .. "/" .. pandoc.utils.sha1(source) .. ".json", "w"))
  file:write(pandoc.json.encode(value)); file:close()
  return doc
end}}
