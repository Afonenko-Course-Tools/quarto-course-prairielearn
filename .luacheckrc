std = "lua54"
-- Длину и переносы строк проверяет единственный форматтер StyLua.
max_line_length = false
-- Quarto/Pandoc являются фактическим контекстом embedded bridge.
read_globals = { "quarto", "pandoc", "FORMAT", "PANDOC_VERSION", "PANDOC_SCRIPT_FILE" }
