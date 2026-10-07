-- Единый словарь пакета: допустимые значения не повторяются в фильтрах.
local diagnostics = require("./diagnostics")
local root = pandoc.path.directory(debug.getinfo(1, "S").source:sub(2))
local file = assert(io.open(pandoc.path.join({root, "contract.json"}), "r"),
  diagnostics.message("PL.CONTRACT_INVALID", "Не удалось прочитать контракт расширения", {source = pandoc.path.join({root, "contract.json"}), hint = "Переустановите расширение целиком"}))
local contract = pandoc.json.decode(file:read("*a"))
file:close()
function contract.set(values)
  local result = {}
  for _, value in ipairs(values) do result[value] = true end
  return result
end
return contract
