local native = require("./native")
local assessment = require("./assessment")
local M = {}
function M.validate(doc)
  -- Core calls this before projection; the unprojected assessment ID is the
  -- authored Course heading, including an assessment hidden from students.
  local meta = doc.meta
  if meta.assessment and meta.assessment.prairielearn ~= nil and not meta["course-assessment-id"] then
    doc:walk({Header = function(header)
      if not meta["course-assessment-id"] and header.identifier:match("^sec%-") then
        meta["course-assessment-id"] = pandoc.MetaString(header.identifier)
      end
    end})
  end
  local targets = {}
  doc:walk({Div = function(div)
    if div.identifier:match("^exr%-") then targets[div.identifier] = div.attributes.target or "manual" end
  end})
  local policy = assessment.collect(meta)
  if policy ~= nil then
    native.vet(policy, "#PrairieLearnAssessment")
    local members = 0
    doc:walk({Div = function(div)
      if div.classes:includes("assessment-items") then
        for _, block in ipairs(div.content) do
          if block.t == "BulletList" or block.t == "OrderedList" then
            members = members + #block.content
            pandoc.Pandoc({block}):walk({Cite = function(cite)
              for _, reference in ipairs(cite.citations) do
                if targets[reference.id] then
                  assert(targets[reference.id] == "prairielearn", "PL001_externalAssessmentMembers: " .. reference.id)
                end
              end
            end})
          end
        end
      end
    end})
    assert(policy.pass["at-least"] <= members, "prairielearn.pass.at-least превышает число заданий")
  end
  local projects = pandoc.List()
  doc:walk({Div = function(div)
    if div.attributes.target == "prairielearn" then
      assert((div.attributes.project or ""):match("^/[^.]"), "prairielearn: требуется project от корня курса")
      projects:insert(div.attributes.project)
    end
  end})
  if #projects > 0 then
    local directory = pandoc.path.directory(debug.getinfo(1, "S").source:sub(2))
    local args = {"run", directory .. "/validate-paths.ts", quarto.project.directory}
    for _, project in ipairs(projects) do args[#args + 1] = project end
    pandoc.pipe(os.getenv("QUARTO") or "quarto", args, "")
  end
end
return M
