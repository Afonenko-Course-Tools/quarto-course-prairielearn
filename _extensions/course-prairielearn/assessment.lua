local contract = require("./contract")
local vocabulary = contract.vocabulary
local assignmentModes = contract.set(vocabulary.assignment_modes)
local M = {}

-- Сохраняем неизвестные поля: закрытая схема CUE должна отклонить опечатки.
local function plain(value)
  local kind = pandoc.utils.type(value)
  if kind == "Inlines" or kind == "Blocks" then return pandoc.utils.stringify(value) end
  if type(value) ~= "table" then return value end
  local result = kind == "List" and pandoc.List() or {}
  for key, child in pairs(value) do result[key] = plain(child) end
  return result
end

local function merge(base, override)
  local result = {}
  for key, value in pairs(base) do result[key] = value end
  for key, value in pairs(override) do
    -- Способ назначения заменяется целиком: явная метка отменяет вычисление
    -- метки из общих настроек, а не образует с ним вторую стратегию.
    if key ~= "assignment" and type(value) == "table" and type(result[key]) == "table" then
      result[key] = merge(result[key], value)
    else result[key] = value end
  end
  return result
end

local function number(value)
  if type(value) == "string" then return tonumber(value) or value end
  return value
end

function M.collect(meta)
  if meta.assessment == nil or meta.assessment.prairielearn == nil then return nil end
  -- Общие настройки действуют только при явном подключении адаптера.
  local policy = plain(meta.assessment.prairielearn)
  if type(policy) ~= "table" then return policy end
  assert(pandoc.utils.type(policy) ~= "List", "assessment.prairielearn должен быть YAML-картой")
  local defaults = meta.prairielearn and meta.prairielearn["assessment-defaults"]
  if defaults == nil then defaults = {} else defaults = plain(defaults) end
  assert(type(defaults) == "table" and pandoc.utils.type(defaults) ~= "List",
    "prairielearn.assessment-defaults должен быть YAML-картой")
  local value = merge(defaults, policy)
  value.attempts = number(value.attempts)
  if type(value.pass) == "table" then value.pass["at-least"] = number(value.pass["at-least"]) end
  local assignment = value.assignment
  if type(assignment) == "table" and assignment.mode ~= nil then
    assert(assignmentModes[assignment.mode], "Неподдерживаемый режим assignment.mode; допустимы: " .. table.concat(vocabulary.assignment_modes, ", "))
    assert(assignment["student-label"] == nil, "Нельзя одновременно задавать assignment.mode и assignment.student-label")
    local id = meta["course-assessment-id"] and pandoc.utils.stringify(meta["course-assessment-id"])
    assert(id and id ~= "", "Для вычисления метки требуется идентификатор контрольной от ядра курса")
    local course = pandoc.utils.stringify(meta.course.id)
    assignment.mode = nil
    assignment["student-label"] = vocabulary.assignment_label_prefix .. pandoc.utils.sha1(course .. "\0" .. id)
  end
  return value
end

return M
