// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";

const path = z.string().min(1).max(512).refine(
  (value) =>
    !value.startsWith("/") && !/[\\\0,<>"\r\n]/.test(value) &&
    !value.split("/").some((part) => !part || part === "." || part === ".."),
  "Требуется относительный путь без выхода из Workspace",
);
const gitStateFiles = [
  "work/**",
  "work/.git/**",
  "work/.*",
  "explanation.m[d]",
  ".pl-seed/identity.jso[n]",
];
const workspaceOptions = z.strictObject({
  image: z.string().min(1).max(512).regex(
    /^[^\s]+@sha256:[a-f0-9]{64}$/,
    "Workspace image требует точный digest",
  ),
  home: z.string().min(2).max(512).regex(/^\/(?:[a-zA-Z0-9_-]+\/?)+$/),
  port: z.number().int().min(1024).max(65535),
  rewriteUrl: z.boolean().optional(),
  gradedFiles: z.array(path).min(1).max(128).refine(
    (paths) => new Set(paths).size === paths.length,
    "Повтор gradedFiles",
  ).refine(
    (paths) => gitStateFiles.every((path) => paths.includes(path)),
    "Git Workspace требует возврат work, скрытой .git, пояснения и seed identity",
  ),
  enableNetworking: z.boolean().optional(),
});
export const submissionSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("editor"),
    aceMode: z.string().regex(/^ace\/mode\/[a-z][a-z0-9_]*$/).optional(),
  }),
  z.strictObject({ mode: z.literal("upload"), layout: z.enum(["files", "zip", "files-or-zip"]).optional() }),
  z.strictObject({ mode: z.literal("workspace"), workspaceOptions }),
]);
export type Submission = z.output<typeof submissionSchema>;

export function submission(value: unknown, authored = false): Submission {
  let normalized = value;
  if (
    authored && value !== null && typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const record = value as Record<string, unknown>;
    if (Object.hasOwn(record, "ace-mode")) {
      if (Object.hasOwn(record, "aceMode")) {
        throw Error("PL.SUBMISSION_INVALID: неоднозначный aceMode");
      }
      const { "ace-mode": aceMode, ...rest } = record;
      normalized = { ...rest, aceMode };
    } else if (Object.hasOwn(record, "aceMode")) {
      throw Error("PL.SUBMISSION_INVALID: авторское имя поля ace-mode");
    }
  }
  const result = submissionSchema.safeParse(normalized);
  if (!result.success) {
    throw Error("PL.SUBMISSION_INVALID: " + result.error.message);
  }
  return result.data;
}

const mappings = z.array(
  z.strictObject({ name: path, starterPath: path.optional() }),
).max(128)
  .refine(
    (files) => new Set(files.map((file) => file.name)).size === files.length,
    "Повтор логического имени сдачи",
  );
/** Обычный Java application layout, включая вложенные самостоятельные программы. */
export function applicationJavaTarget(target: string): boolean {
  return /(?:^|\/)src\/main\/java\/.+\.java$/.test(target);
}
/** Одна штатная форма по точным выбранным исходникам, без дополнительных controls. */
export function fileSubmission(files: readonly string[], aceMode = "ace/mode/java"): Submission {
  const parsed = mappings.parse(files.map(name => ({ name })));
  if (!parsed.length) throw Error("PL.SUBMISSION_INVALID: нет выбранных исходников");
  return parsed.length <= 2
    ? { mode: "editor", aceMode }
    : { mode: "upload", layout: parsed.some(file => file.name.includes("/")) ? "zip" : "files" };
}
/** Нейтральный проверенный фрагмент README; бизнес-поля остаются у PL. */
export function describeSubmission(
  contract: unknown,
  files: unknown = [],
  options: { freeComposition?: boolean; primaryRequired?: boolean; archive?: string } = {},
) {
  let selected = submission(contract);
  const parsed = mappings.parse(files);
  if (selected.mode !== "workspace" && parsed.length && options.archive && parsed.every(file => file.name.endsWith(".java"))) {
    selected = fileSubmission(parsed.map(file => file.name), selected.mode === "editor" ? selected.aceMode : undefined);
  }
  if (selected.mode === "workspace") {
    if (parsed.length) {
      throw Error(
        "PL.SUBMISSION_INVALID: Workspace не задаёт вымышленный upload mapping",
      );
    }
    return {
      files: [],
      instructions:
        "Сохраните рабочие файлы редактора и отправьте решение штатной кнопкой PrairieLearn. История Git, индекс и рабочие файлы возвращаются преподавателю вместе с пояснением. В native Workspace ручное создание ZIP не требуется. При работе в собственной ОС загрузите архив по условию задачи. Обязательные действия и промежуточные состояния предъявляются по условию отдельно от конечных файлов.",
    };
  }
  return {
    files: parsed,
    instructions: selected.mode === "editor"
      ? "Заполните перечисленные редакторы PrairieLearn и отправьте решение. Имена сдаваемых файлов и их пути в стартовом комплекте приведены отдельно."
      : selected.layout === "zip" || selected.layout === undefined && parsed.length >= 3 && parsed.some(file => file.name.includes("/"))
      ? "Загрузите один ZIP со всеми исходниками решения, сохранив перечисленные относительные пути внутри архива. Имя архива: " + (options.archive ?? "указано в поле загрузки PrairieLearn") + "."
      : parsed.length
      ? "Загрузите перечисленные исходные файлы через файловый диалог с указанными логическими именами. Пути в стартовом комплекте приведены отдельно; требования к программе определяются условием."
      : "Загрузите материалы решения через поле загрузки PrairieLearn. Состав материалов и требуемые свидетельства определяются условием задачи.",
  };
}
