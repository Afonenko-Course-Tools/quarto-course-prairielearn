local contract = require("./contract")
local assessment = require("./assessment")
local diagnostics = require("./diagnostics")
local M = {}
local directory = pandoc.path.directory(debug.getinfo(1, "S").source:sub(2))
function M.source()
  local root = assert(quarto.project.directory)
  local input = quarto.doc.input_file
  if pandoc.path.is_relative(input) then input = pandoc.path.join({root, input}) end
  return pandoc.path.make_relative(input, root)
end
function M.read(doc)
  local source = M.source()
  local value = {source = source, exercises = pandoc.List(),
    assessment = assessment.collect(doc.meta)}
  doc:walk({traverse = "topdown", Div = function(d)
    -- Core resolves this reserved public projection alongside full source facts.
    -- It is service transport, not a second authored platform exercise.
    if d.classes:includes("course-export-projection") and
      d.attributes["data-course-export-projection"] == "public" then return d, false end
    if d.attributes.target == contract.name then
      value.exercises:insert({id = d.identifier, payload = {grading = contract.vocabulary.grading[1]}})
    end
  end})
  return value
end
function M.vet(value, definition, context)
  pandoc.system.with_temporary_directory("course-adapter-", function(temp)
    local json = pandoc.path.join({temp, "candidate.json"})
    local file = assert(io.open(json, "w")); file:write(pandoc.json.encode(value)); file:close()
    local source = pandoc.path.join({temp, "source.cue"})
    file = assert(io.open(source, "w")); file:write('package course\n#Source: {inline: string & !=""} | {file: string & =~"^/[^.]"}\n'); file:close()
    local tool = os.getenv("CUE") or "cue"
    local ok, cause = pcall(pandoc.pipe, tool, {"vet", directory .. "/" .. contract.rules, source, json, "-d", definition, "-c", "--all-errors"}, "")
    if not ok then
      assert(false, diagnostics.message(nil, "Не удалось выполнить внешнюю проверку CUE (" .. tool .. ") для " .. definition, context) .. "\n" .. tostring(cause))
    end
  end)
end
function M.write(doc, value)
  local root = assert(quarto.project.directory)
  local profiles = pandoc.List()
  for _, profile in ipairs(quarto.project.profile or {}) do profiles:insert(profile) end
  local output = quarto.doc.output_file
  if not pandoc.path.is_relative(output) then output = pandoc.path.make_relative(output, quarto.project.output_directory or root) end
  value.scope = "document"
  value.adapter = contract.name
  value.course = {id = doc.meta.course.id and pandoc.utils.stringify(doc.meta.course.id) or nil, view = doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil}
  value.document = {source = value.source, format = FORMAT, output = output, profiles = profiles}
  local view = value.course.view or "default"
  assert(view == "student" or view == "full" or view == "default", diagnostics.message("PL.NATIVE_INVALID", "Неверное представление адаптера", {source = value.source, field = "course.view"}))
  local hash = pandoc.utils.sha1(value.source .. "\0" .. FORMAT .. "\0" .. table.concat(profiles, "\0"))
  local function save(folder)
    pandoc.system.make_directory(folder, true)
    local file = assert(io.open(folder .. "/" .. hash .. ".json", "w"))
    file:write(pandoc.json.encode(value)); file:close()
  end
  save(root .. "/_generated/course-spec/adapters/" .. contract.name .. "/" .. view)
  local pointer = io.open(root .. "/_generated/course-spec/active-native-run.json", "r")
  if pointer then
    local run = pandoc.json.decode(pointer:read("*a")); pointer:close()
    assert(run.schema == "course-native-run-pointer-v1" and run.projectRoot == root, diagnostics.message("PL.NATIVE_INVALID", "Неверный указатель native-сборки", {source = value.source, field = "active-native-run"}))
    assert(pandoc.path.directory(run.directory) == root .. "/_generated/course-spec/native-runs", diagnostics.message("PL.NATIVE_INVALID", "Неверный каталог native-сборки", {source = value.source, field = "active-native-run.directory"}))
    assert(pandoc.json.encode(run.profiles) == pandoc.json.encode(profiles), diagnostics.message("PL.NATIVE_INVALID", "Профили адаптера расходятся с native-сборкой", {source = value.source, field = "active-native-run.profiles"}))
    local folder = run.directory .. "/adapters/" .. contract.name
    save(folder)
    local file = assert(io.open(folder .. "/contract.json", "w"))
    file:write(pandoc.json.encode({name = contract.name, rules = contract.rules, directory = directory})); file:close()
  end
end
return M
