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
        if defaults.topic ~= nil then payload.topic = pandoc.utils.stringify(defaults.topic) end
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
-- Закрытый enrollment descriptor Core 7c9388cb4d982caf66657ea8f96c09243d64a147.
-- SHA1 связывает bytes на этой границе; SHA256/identity/currentness проверяет Core.
local function exact(value, required, optional)
  if type(value)~='table' then return false end
  local allowed={}
  for _,key in ipairs(required) do allowed[key]=true;if value[key]==nil then return false end end
  for _,key in ipairs(optional or {}) do allowed[key]=true end
  for key,_ in pairs(value) do if not allowed[key] then return false end end
  return true
end
local function hex(value,size)
  return type(value)=='string' and #value==size and value:match('^[0-9a-f]+$')~=nil
end
local function hashes(value)
  return exact(value,{'sha1','sha256'}) and hex(value.sha1,40) and hex(value.sha256,64)
end
local function overlay(value)
  return exact(value,{'kind','sourceContext'}) and value.kind=='owned-config-overlay-v1' and hashes(value.sourceContext)
end
local function ref(value,name)
  return exact(value,{'file','sha1','sha256'}) and value.file==name and hex(value.sha1,40) and hex(value.sha256,64)
end
local function strings(value,nonempty)
  if type(value)~='table' or (nonempty and #value==0) then return false end
  for key,item in pairs(value) do if type(key)~='number' or key%1~=0 or key<1 or key>#value or type(item)~='string' then return false end end
  return true
end
local function same(a,b)
  if type(a)~=type(b) then return false end
  if type(a)~='table' then return a==b end
  for k,v in pairs(a) do if not same(v,b[k]) then return false end end
  for k,_ in pairs(b) do if a[k]==nil then return false end end
  return true
end
local function owned_enrollment(run,doc,root,profiles,source)
  local function check(ok,field)
    assert(ok,diagnostics.message('PL.NATIVE_INVALID','Неверный active owned overlay',{source=source,field=field}))
  end
  check(exact(run,{'schema','directory','projectRoot','profiles','outputDirectory','renderAll','configurationHashes','commonPathBinding','ownedConfigOverlay','overlayState'},{'initialInputFiles','commonPathDocuments'}),'active-native-run')
  check(run.overlayState=='active' and overlay(run.ownedConfigOverlay),'active-native-run.ownedConfigOverlay')
  check(type(run.outputDirectory)=='string' and type(run.renderAll)=='boolean' and type(run.configurationHashes)=='table' and (run.initialInputFiles==nil or strings(run.initialInputFiles,false)),'active-native-run')
  check(strings(run.profiles,true) and #profiles==1 and type(profiles[1])=='string' and profiles[1]:match('^course%-export%-%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$')~=nil,'active-native-run.profiles')
  check(FORMAT=='json' and doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view)=='full' and doc.meta['course-export-context']==true and doc.meta['course-current-native-run']==true,'course-current-native-run')
  local prefix=root..'/_generated/course-spec/native-runs/'
  check(type(run.directory)=='string' and run.directory:sub(1,#prefix)==prefix and run.directory:sub(#prefix+1):match('^[%w%-]+$')~=nil,'active-native-run.directory')
  for _,name in ipairs(pandoc.system.list_directory(run.directory)) do
    check(name~='native-run.json' and name~='owned-export-restored-entry.json','active-native-run.overlayState')
  end
  local function bytes(name)
    local f=io.open(run.directory..'/'..name,'rb');check(f~=nil,name)
    local result=f:read('*a');f:close();return result
  end
  check(ref(run.commonPathBinding,'common-files-path-binding.json'),'active-native-run.commonPathBinding')
  local raw=bytes('common-files-path-binding.json')
  check(pandoc.utils.sha1(raw)==run.commonPathBinding.sha1,'commonPathBinding.sha1')
  local ok,w=pcall(pandoc.json.decode,raw);check(ok and type(w)=='table','commonPathBinding')
  check(exact(w,{'schema','projectRoot','runDirectory','profiles','outputDirectory','renderAll','quartoVersion','ownerInspectionHash','documentInspectionHashes','configurationInputs','inputFiles','sourceHashes','commonSourceHashes','canonicalOwnerDeclarations','documents','nativeExtensionMetadata','metadataClosure','sourceIdentities','ownedConfigOverlay','sourceInspectionRefs'},{'temporaryExportProfile','forcedWriter'}),'commonPathBinding')
  check(w.schema=='course-common-files-path-binding-v2' and overlay(w.ownedConfigOverlay) and same(w.ownedConfigOverlay,run.ownedConfigOverlay) and strings(w.sourceInspectionRefs,true),'commonPathBinding.ownedConfigOverlay')
  check(w.projectRoot==root and w.runDirectory==run.directory and same(w.profiles,run.profiles) and w.outputDirectory==run.outputDirectory and w.renderAll==run.renderAll,'commonPathBinding.runDirectory')
  if run.commonPathDocuments~=nil then
    local function dense(value)
      if type(value)~='table' then return false end
      local count=0
      for key,_ in pairs(value) do
        if type(key)~='number' or key%1~=0 or key<1 or key>#value then return false end
        count=count+1
      end
      return count==#value
    end
    local refs=run.commonPathDocuments
    check(dense(refs) and dense(w.documents) and #refs==#w.documents,'active-native-run.commonPathDocuments')
    local sources,files={},{}
    for i,r in ipairs(refs) do
      local field='active-native-run.commonPathDocuments'
      check(exact(r,{'source','format','file','sha1','sha256'}),field)
      check(type(r.source)=='string' and r.source~='' and type(r.format)=='string' and r.format~='' and hex(r.sha1,40) and hex(r.sha256,64),field)
      check(type(r.file)=='string' and hex(r.file:match('^selected%-common%-paths/([0-9a-f]+)%.json$'),64),field)
      sources[r.source]=sources[r.source] or {}
      check(not sources[r.source][r.format] and not files[r.file],field)
      sources[r.source][r.format]=true;files[r.file]=true
      check(type(w.documents[i])=='table' and r.source==w.documents[i].source and r.format==w.documents[i].format,field)
    end
  end
  local t=w.temporaryExportProfile
  check(exact(w.forcedWriter,{'kind'}) and w.forcedWriter.kind=='owned-export-json' and exact(t,{'profile','file','sha1','sha256'}) and t.profile==profiles[1] and t.file=='_quarto-'..profiles[1]..'.yml' and hex(t.sha1,40) and hex(t.sha256,64),'commonPathBinding.temporaryExportProfile')
  check(pandoc.utils.sha1(bytes('owned-export-source-context.json'))==run.ownedConfigOverlay.sourceContext.sha1,'ownedConfigOverlay.sourceContext.sha1')
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
    assert((run.schema == "course-native-run-pointer-v2" or run.schema == "course-native-run-pointer-v3") and run.projectRoot == root, diagnostics.message("PL.NATIVE_INVALID", "Неверный указатель native-сборки", {source = value.source, field = "active-native-run"}))
    if run.schema == "course-native-run-pointer-v3" then owned_enrollment(run,doc,root,profiles,value.source) end
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
