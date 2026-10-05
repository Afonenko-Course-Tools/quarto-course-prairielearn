// Explicit caller: only a successful native process permits current-run consumption.
const profile = Deno.args[0] || "student";
if (!["student", "full"].includes(profile)) {
  throw new Error("Профиль: student или full");
}
const result = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
  args: [
    "render",
    ".",
    "--profile",
    profile,
    "--to",
    "html",
    "--fail-if-warnings",
  ],
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!result.success) Deno.exit(result.code);
const checked = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
  args: ["run", "_extensions/course-core/entrypoints/check.ts", ".", profile],
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!checked.success) Deno.exit(checked.code);
console.log(
  `Готово: _book/${profile}; текущая модель: _generated/course-spec/course.json`,
);
