-- Формат сообщений только этого пакета; исходные ошибки инструментов не меняем.
local M = {}
function M.message(code, message, context)
  local text = (code and code .. ': ' or '') .. 'course-prairielearn: ' .. message
  context = context or {}
  for _, key in ipairs({'source', 'id', 'field'}) do
    if context[key] then text = text .. '\n  ' .. key .. ': ' .. context[key] end
  end
  for _, related in ipairs(context.related or {}) do
    local parts = {}
    for _, key in ipairs({'source', 'id', 'field'}) do
      if related[key] then parts[#parts + 1] = key .. ': ' .. related[key] end
    end
    text = text .. '\n  связано: ' .. table.concat(parts, ', ')
  end
  if context.hint then text = text .. '\n  подсказка: ' .. context.hint end
  return text
end
return M
