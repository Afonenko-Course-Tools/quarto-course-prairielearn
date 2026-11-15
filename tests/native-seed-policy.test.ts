import { required } from "./fixture-values.ts";
import {
  assertNativeSeedTargets,
  decodeNativeBusiness,
  validateNativeRaw,
} from "../_extensions/course-prairielearn/application/native-business.ts";
function assert(x: unknown, m: string) {
  if (!x) throw Error(m);
}
function bad(f: () => unknown) {
  let rejected = false;
  try {
    f();
  } catch {
    rejected = true;
  }
  assert(rejected, "Ожидаемый отказ отсутствует");
}
import type { decodeNativeMaterialization } from "../_extensions/course-prairielearn/application/native-materialization.ts";
type CommonFiles = ReturnType<
  typeof decodeNativeMaterialization
>["projects"][string]["common-files"];
const emptyCommonFiles = (): CommonFiles => [];
const raw = (targets: unknown = { "exr-repo": "versioning/project" }) => ({
  config: {
    "seed-targets": targets,
    "question-defaults": {
      topic: "Git",
      grading: { method: "manual" },
      submission: { mode: "upload" },
    },
  },
  materialization: {
    projects: {
      "exr-repo": { "include-git": true, "common-files": emptyCommonFiles() },
    },
  },
  declarations: [{ id: "exr-repo", attributes: { project: "project" } }],
});
function business(value: ReturnType<typeof raw> = raw()) {
  return decodeNativeBusiness(value, {
    origin: { source: "bank.qmd" },
    course: { id: "fixture" },
    declarations: value.declarations,
  });
}
Deno.test(
  "C seed-targets принимает явный path и исходный raw canon не меняется",
  () => {
    const value = raw(),
      before = JSON.stringify(value),
      b = business(value);
    assert(
      b.seedTargets["exr-repo"] === "versioning/project",
      "Target потерян",
    );
    assertNativeSeedTargets([b]);
    assert(JSON.stringify(value) === before, "Source data изменены");
  },
);
Deno.test(
  "C seed-targets закрывает unsafe, service, git и protected targets",
  () => {
    for (const p of [
      "",
      "../escape",
      "/absolute",
      "a//b",
      "a/./b",
      "a/../b",
      "C:/repo",
      "a\\b",
      ".git",
      "x/.git/y",
      ".quarto/x",
      "_generated/x",
      "node_modules/x",
      ".pl-seed/x",
      "x/.pl-seed/y",
      "README.md",
      "README.md/nested",
      "a\nrepo",
    ])
      bad(() => validateNativeRaw(raw({ "exr-repo": p })));
    for (const p of [null, [], false, { unknown: "work" }]) {
      bad(() => validateNativeRaw(raw(p)));
    }
  },
);
Deno.test(
  "C seed-targets проверяет полный authenticated business набор, orphan/include-git/mode/ambiguous",
  () => {
    const b = business();
    bad(() =>
      assertNativeSeedTargets([
        { ...b, seedTargets: { "exr-missing": "work" } },
      ]),
    );
    bad(() => {
      const missing = structuredClone(b);
      Reflect.deleteProperty(missing, "materialization");
      assertNativeSeedTargets([missing]);
    });
    bad(() =>
      assertNativeSeedTargets([
        {
          ...b,
          questions: {
            ...b.questions,
            "exr-repo": {
              ...required(b.questions["exr-repo"]),
              submission: {
                mode: "workspace",
                workspaceOptions: {
                  image: "fixture.invalid/unused@sha256:" + "0".repeat(64),
                  home: "/workspace",
                  port: 8080,
                  gradedFiles: [
                    "work/**",
                    "work/.git/**",
                    "work/.*",
                    "explanation.m[d]",
                    ".pl-seed/identity.jso[n]",
                  ],
                },
              },
            },
          },
        },
      ]),
    );
    bad(() => assertNativeSeedTargets([b, b]));
    const other = { ...b, questions: {}, seedTargets: b.seedTargets };
    assertNativeSeedTargets([other, b]);
    bad(() =>
      assertNativeSeedTargets([
        {
          ...other,
          seedTargets: { "exr-repo": "another/repo" },
        },
        b,
      ]),
    );
  },
);

Deno.test(
  "Повторная raw-проверка сохраняет source для owner-relative common-files",
  () => {
    const value = raw();
    value.materialization.projects["exr-repo"]["common-files"] = [
      {
        source: "/common/work-environment/count.fish",
        target: "student/survey/tools/count.fish",
        audience: "student",
      },
    ];
    const before = JSON.stringify(value);
    bad(() => validateNativeRaw(value));
    for (const source of ["index.qmd", "labs/work-environment.qmd"]) {
      const actual = validateNativeRaw(value, { source });
      assert(
        required(
          required(actual.materialization?.projects["exr-repo"])[
            "common-files"
          ][0],
        ).source === "common/work-environment/count.fish",
        "Потерян owner-relative путь",
      );
      assert(JSON.stringify(value) === before, "Изменён raw source");
    }
    required(
      value.materialization.projects["exr-repo"]["common-files"][0],
    ).source = "../common/tool.fish";
    assert(
      required(
        required(
          validateNativeRaw(value, { source: "labs/work.qmd" }).materialization
            ?.projects["exr-repo"],
        )["common-files"][0],
      ).source === "common/tool.fish",
      "Потерян document-relative путь",
    );
    required(
      value.materialization.projects["exr-repo"]["common-files"][0],
    ).source = "../../escape";
    bad(() => validateNativeRaw(value, { source: "labs/work.qmd" }));
  },
);
