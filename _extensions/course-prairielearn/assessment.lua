local contract = require("./contract")
local diagnostics = require("./diagnostics")
local vocabulary = contract.vocabulary
local assignmentModes = contract.set(vocabulary.assignment_modes)
local M = {}

-- Сохраняем неизвестные поля: закрытая схема CUE должна отклонить опечатки.
local function plain(value)
  local kind = pandoc.utils.type(value)
  if kind == "Inlines" or kind == "Blocks" then return pandoc.utils.stringify(value) end
  if type(value) == "string" and value == "" then return pandoc.json.null end
  if type(value) ~= "table" then return value end
  local result = kind == "List" and pandoc.List() or {}
  for key, child in pairs(value) do result[key] = plain(child) end
  return result
end

M.plain = plain

local function merge(base, override)
  local result = {}
  for key, value in pairs(base) do result[key] = value end
  for key, value in pairs(override) do
    -- Способ назначения заменяется целиком: явная метка отменяет вычисление
    -- метки из общих настроек, а не образует с ним вторую стратегию.
    if key ~= "assignment" and type(value) == "table" and pandoc.utils.type(value) ~= "List" and type(result[key]) == "table" and pandoc.utils.type(result[key]) ~= "List" then
      result[key] = merge(result[key], value)
    else result[key] = value end
  end
  return result
end

local function number(value)
  if type(value) == "string" then return tonumber(value) or value end
  return value
end

-- Pandoc transports YAML scalars as Inlines. Normalize only the numeric
-- policy fields; preserve malformed collections and unknown keys for CUE.
local normalize_policy
normalize_policy = function(value)
  if type(value) ~= "table" or pandoc.utils.type(value) == "List" then return value end
  for _, key in ipairs({"attempts", "question-points", "question-max-points", "max-points", "grade-rate-minutes", "advance-score-perc"}) do
    if key == "question-points" and type(value[key]) == "table" and pandoc.utils.type(value[key]) == "List" then
      for i, point in ipairs(value[key]) do value[key][i] = number(point) end
    else value[key] = number(value[key]) end
  end
  if type(value["question-overrides"]) == "table" then
    for _, override in pairs(value["question-overrides"]) do normalize_policy(override) end
  end
  if type(value.pass) == "table" and pandoc.utils.type(value.pass) ~= "List" then
    value.pass["at-least"] = number(value.pass["at-least"])
  end
  return value
end

function M.declarations(value)
  local result = plain(value)
  if type(result) == "table" then
    result["assessment-defaults"] = normalize_policy(result["assessment-defaults"])
  end
  return result
end

function M.collect(meta)
  if meta.assessment == nil or meta.assessment.prairielearn == nil then return nil end
  -- Общие настройки действуют только при явном подключении адаптера.
  local id = meta["course-assessment-id"] and pandoc.utils.stringify(meta["course-assessment-id"])
  local function message(text, field)
    return diagnostics.message("PL.ASSESSMENT_INVALID", text, {source = quarto.doc.input_file, id = id,
      field = field or "assessment.prairielearn", hint = "Проверьте правила этой работы и общие настройки PrairieLearn"})
  end
  local policy = normalize_policy(plain(meta.assessment.prairielearn))
  if type(policy) ~= "table" then return policy end
  assert(pandoc.utils.type(policy) ~= "List", message("Правила работы должны быть YAML-картой"))
  local defaults = meta.prairielearn and meta.prairielearn["assessment-defaults"]
  if defaults == nil then defaults = {} else defaults = normalize_policy(plain(defaults)) end
  assert(type(defaults) == "table" and pandoc.utils.type(defaults) ~= "List",
    message("Общие настройки должны быть YAML-картой", "prairielearn.assessment-defaults"))
  local value = merge(defaults, policy)
  value.attempts = number(value.attempts)
  if type(value.pass) == "table" then value.pass["at-least"] = number(value.pass["at-least"]) end
  local assignment = value.assignment
  if type(assignment) == "table" and assignment.mode ~= nil then
    assert(assignmentModes[assignment.mode], message("Неподдерживаемый режим; допустимы: " .. table.concat(vocabulary.assignment_modes, ", "), "assessment.prairielearn.assignment.mode"))
    assert(assignment["student-label"] == nil, message("Нельзя одновременно задавать mode и student-label", "assessment.prairielearn.assignment"))
    local id = meta["course-assessment-id"] and pandoc.utils.stringify(meta["course-assessment-id"])
    assert(id and id ~= "", message("Для вычисления метки требуется идентификатор работы от ядра курса", "assessment.prairielearn.assignment.mode"))
    local course = meta.course and meta.course.id and pandoc.utils.stringify(meta.course.id)
    -- Nested native books keep the authored mode until explicit root export supplies identity.
    if course and course ~= "" then
      assignment.mode = nil
      assignment["student-label"] = vocabulary.assignment_label_prefix .. pandoc.utils.sha1(course .. "\0" .. id)
    end
  end
  return value
end

return M
