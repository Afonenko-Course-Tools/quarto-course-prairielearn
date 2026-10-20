local __metrics=require("./observability/bridge").create_metrics("course-prairielearn",1)
local __perfProbe={}
local __perfChildContext=__metrics.child_env(__perfProbe)~=__perfProbe
local __perfPipe=__metrics.wrap_sync({id="course-prairielearn.native.command.pipe",kind='command'},function(tool,args,input)
 if not __perfChildContext then return pandoc.pipe(tool,args,input) end
 return pandoc.system.with_environment(__metrics.child_env({}),function()return pandoc.pipe(tool,args,input)end)
end)
local __perfWalk1=__metrics.wrap_walk({id="course-prairielearn.native.walk.1",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
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
function M.target(effective, div)
  if effective and effective[div.identifier] then return effective[div.identifier].target end
  return div.attributes.target
end
function M.read(doc, effective)
  effective = effective or (doc.meta["course-effective-exercise-facts"] and pandoc.json.decode(pandoc.utils.stringify(doc.meta["course-effective-exercise-facts"]))) or {}
  local source = M.source()
  local value = {source = source, exercises = pandoc.List(),
    assessment = assessment.collect(doc.meta)}
  __perfWalk1(doc,{traverse = "topdown", Div = function(d)
    -- Core resolves this reserved public projection alongside full source facts.
    -- It is service transport, not a second authored platform exercise.
    if d.classes:includes("course-export-projection") and
      d.attributes["data-course-export-projection"] == "public" then return d, false end
    if M.target(effective, d) == contract.name then
      local payload = {grading = contract.vocabulary.grading[1]}
      if doc.meta.prairielearn and doc.meta.prairielearn["question-defaults"] then
        local defaults = doc.meta.prairielearn["question-defaults"]
        payload.topic = pandoc.utils.stringify(defaults.topic)
        if defaults.grading then
          payload.grading={}
          for key,value in pairs(defaults.grading) do payload.grading[key]=pandoc.utils.stringify(value) end
        end
        if defaults["single-variant"] ~= nil then payload["single-variant"] = defaults["single-variant"] end
        local submission = defaults.submission
        if submission then
          payload.submission = {mode = pandoc.utils.stringify(submission.mode)}
          if submission["ace-mode"] then payload.submission["ace-mode"] = pandoc.utils.stringify(submission["ace-mode"]) end
        end
      end
      if d.attributes["prairielearn-single-variant"] ~= nil then payload["single-variant"] = d.attributes["prairielearn-single-variant"] == "true" end
      if d.attributes['prairielearn-grading'] then
        local method=d.attributes['prairielearn-grading'];payload.grading=method=='external' and 'external' or {method=method}
      end
      if d.attributes["prairielearn-topic"] then payload.topic = d.attributes["prairielearn-topic"] end
      if d.attributes["prairielearn-submission"] then payload.submission = payload.submission or {}; payload.submission.mode = d.attributes["prairielearn-submission"]; if payload.submission.mode == "upload" then payload.submission["ace-mode"] = nil end end
      value.exercises:insert({id = d.identifier, payload = payload})
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
    local ok, cause = pcall(__perfPipe, tool, {"vet", directory .. "/" .. contract.rules, source, json, "-d", definition, "-c", "--all-errors"}, "")
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
M.source=__metrics.wrap_sync({id="course-prairielearn.native.source",kind='phase'},M.source)
M.target=__metrics.wrap_sync({id="course-prairielearn.native.target",kind='phase'},M.target)
M.read=__metrics.wrap_sync({id="course-prairielearn.native.read",kind='phase'},M.read)
M.vet=__metrics.wrap_sync({id="course-prairielearn.native.vet",kind='phase'},M.vet)
M.write=__metrics.wrap_sync({id="course-prairielearn.native.write",kind='phase'},M.write)
return M
