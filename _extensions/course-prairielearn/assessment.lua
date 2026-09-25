local M = {}

-- Pandoc represents YAML text and numbers as Inlines. Preserve all map keys,
-- including unknown ones, so the normative CUE schema can reject misspellings.
local function plain(value)
  local kind = pandoc.utils.type(value)
  if kind == "Inlines" or kind == "Blocks" then
    return pandoc.utils.stringify(value)
  end
  if type(value) ~= "table" then return value end
  local result = kind == "List" and pandoc.List() or {}
  for key, child in pairs(value) do result[key] = plain(child) end
  return result
end

local function number(value)
  if type(value) == "string" then return tonumber(value) or value end
  return value
end

function M.collect(meta)
  if not meta.assessment or meta.assessment.prairielearn == nil then return nil end
  local value = plain(meta.assessment.prairielearn)
  if type(value) == "table" then
    value.attempts = number(value.attempts)
    if type(value.pass) == "table" then
      value.pass["at-least"] = number(value.pass["at-least"])
    end
  end
  return value
end

return M
