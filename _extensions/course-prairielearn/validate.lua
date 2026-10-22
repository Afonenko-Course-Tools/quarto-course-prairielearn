local __metrics=require("./observability/bridge").create_metrics("course-prairielearn",1)
local __perfProbe={}
local __perfChildContext=__metrics.child_env(__perfProbe)~=__perfProbe
local __perfPipe=__metrics.wrap_sync({id="course-prairielearn.validate.command.pipe",kind='command'},function(tool,args,input)
 if not __perfChildContext then return pandoc.pipe(tool,args,input) end
 return pandoc.system.with_environment(__metrics.child_env({}),function()return pandoc.pipe(tool,args,input)end)
end)
local __perfWalk1=__metrics.wrap_walk({id="course-prairielearn.validate.walk.1",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk2=__metrics.wrap_walk({id="course-prairielearn.validate.walk.2",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk3=__metrics.wrap_walk({id="course-prairielearn.validate.walk.3",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk4=__metrics.wrap_walk({id="course-prairielearn.validate.walk.4",kind='ast_walk',scope="fragment"},function(node,filter)return node:walk(filter)end)
local __perfWalk5=__metrics.wrap_walk({id="course-prairielearn.validate.walk.5",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local __perfWalk6=__metrics.wrap_walk({id="course-prairielearn.validate.walk.6",kind='ast_walk',scope="full-document"},function(node,filter)return node:walk(filter)end)
local native = require("./native")
local assessment = require("./assessment")
local diagnostics = require("./diagnostics")
local M = {}
function M.validate(doc, effective)
  effective = effective or {}
  -- Core calls this before projection; the unprojected assessment ID is the
  -- authored Course heading, including an assessment hidden from students.
  local meta = doc.meta
  if meta.assessment and meta.assessment.prairielearn ~= nil and not meta["course-assessment-id"] then
    __perfWalk1(doc,{Header = function(header)
      if not meta["course-assessment-id"] and header.identifier:match("^sec%-") then
        meta["course-assessment-id"] = pandoc.MetaString(header.identifier)
      end
    end})
  end
  local targets = {}
  __perfWalk2(doc,{Div = function(div)
    if div.identifier:match("^exr%-") then targets[div.identifier] = native.target(effective, div) or "manual" end
  end})
  local source = native.source()
  if meta.prairielearn and meta.prairielearn.delivery then
    native.vet(assessment.declarations(meta.prairielearn), "#PrairieLearnDeclarations", {source = source, field = "prairielearn"})
  end
  local work = meta["course-assessment-id"] and pandoc.utils.stringify(meta["course-assessment-id"])
  local policy = assessment.collect(meta)
  if policy ~= nil then
    native.vet(policy, "#PrairieLearnAssessment", {source = source, id = work, field = "assessment.prairielearn", hint = "Проверьте правила работы; подробности CUE приведены ниже"})
    local members = 0
    __perfWalk3(doc,{Div = function(div)
      if div.classes:includes("task-items") then
        for _, block in ipairs(div.content) do
          if block.t == "BulletList" or block.t == "OrderedList" then
            members = members + #block.content
            __perfWalk4(pandoc.Pandoc({block}),{Cite = function(cite)
              for _, reference in ipairs(cite.citations) do
                if targets[reference.id] then
                  assert(targets[reference.id] == "prairielearn", diagnostics.message("PL001_externalAssessmentMembers", "В работу PrairieLearn входит задание другой платформы", {source = source, id = work, field = "task-items", related = {{source = source, id = reference.id, field = "target"}}, hint = "Включайте в эту работу задания с target=\"prairielearn\""}))
                end
              end
            end})
          end
        end
      end
    end})
    assert(policy.pass["at-least"] <= members, diagnostics.message("PL.ASSESSMENT_INVALID", "Порог выполнения превышает число заданий работы", {source = source, id = work, field = "assessment.prairielearn.pass.at-least", hint = "Проверьте список task-items и порог работы"}))
  end
  local projects = pandoc.List()
  __perfWalk5(doc,{Div = function(div)
    if div.identifier:match("^exr%-") then
      for key, value in pairs(div.attributes) do
        if key:match("^prairielearn%-") then
          assert(key == "prairielearn-topic" or key == "prairielearn-submission" or key == "prairielearn-single-variant" or key == "prairielearn-grading", diagnostics.message("PL.DECLARATION_INVALID", "Неизвестное поле адаптера", {source = source, id = div.identifier, field = key}))
          if key == "prairielearn-grading" then assert(value == "external" or value == "manual" or value == "mixed", diagnostics.message("PL.DECLARATION_INVALID", "Допустимы external, manual или mixed", {source = source, id = div.identifier, field = key})) end
          if key == "prairielearn-single-variant" then assert(value == "true" or value == "false", "PL single-variant override requires true/false") end
          if key == "prairielearn-submission" then assert(value == "editor" or value == "upload", "PL invalid submission override") end
          if key == "prairielearn-topic" then assert(value ~= "", "PL empty topic override") end
        end
      end
    end
  end})
  __perfWalk6(doc,{Div = function(div)
    if native.target(effective, div) == "prairielearn" then
      assert((div.attributes.project or ""):match("^/[^.]"), diagnostics.message("PL.PROJECT_INVALID", "Требуется project от корня выбранного проекта", {source = source, id = div.identifier, field = "project", hint = "Укажите существующий каталог проекта, например /projects/clamp"}))
      projects:insert({path = div.attributes.project, id = div.identifier})
    end
  end})
  if #projects > 0 then
    local directory = pandoc.path.directory(debug.getinfo(1, "S").source:sub(2))
    local args = {"run", directory .. "/validate-paths.ts", quarto.project.directory, source}
    for _, project in ipairs(projects) do args[#args + 1] = project.path; args[#args + 1] = project.id end
    __perfPipe(os.getenv("QUARTO") or "quarto", args, "")
  end
end
M.validate=__metrics.wrap_sync({id="course-prairielearn.validate.validate",kind='phase'},M.validate)
return M
