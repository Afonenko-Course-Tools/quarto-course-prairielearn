import * as Core from "course-core/public.ts";
import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";
import {
  selectNativeCompilerInputs,
  selectNativeStarterSources,
} from "../_extensions/course-prairielearn/application/native-selection.ts";
import { projectNativeChecks } from "../_extensions/course-prairielearn/application/native-check-projection.ts";
import { nativeChecksManifest } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import { NativeProjectCheckSchema } from "../_extensions/course-prairielearn/application/native-checks.ts";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
const bytes = (text: string) => new TextEncoder().encode(text);
function fixture() {
  const studentPlan = Core.ProjectPlanSchema.parse({
    id: crypto.randomUUID(),
    input: "/owner/projects/p",
    audience: "student",
    testsets: ["demo"],
    components: ["apiSupport"],
    groups: [],
  });
  const fullPlan = Core.ProjectPlanSchema.parse({
    ...studentPlan,
    id: crypto.randomUUID(),
    audience: "full",
    testsets: ["api", "contract"],
    groups: ["reference"],
  });
  const source = {
    target: "src/main/java/model/Study.java",
    audience: "student",
    reason: "starter",
    bytes: bytes("// STARTER\nclass Study {}\n"),
  };
  const api = {
    target: "src/api/java/Api.java",
    audience: "full",
    reason: "component:apiSupport",
    bytes: bytes("// API_PRIVATE"),
  };
  const test = {
    target: "src/test/java/Check.java",
    audience: "full",
    reason: "testset:contract",
    bytes: bytes("// PRIVATE_CHECK"),
  };
  const ref = {
    target: "author/reference/src/main/java/model/Study.java",
    audience: "full",
    reason: "solution:reference",
    bytes: bytes("// PRIVATE_REFERENCE"),
  };
  const student = Core.ArtifactFilesSchema.parse({
    exerciseId: "exr-p",
    audience: "student",
    files: [source],
  });
  const full = Core.ArtifactFilesSchema.parse({
    exerciseId: "exr-p",
    audience: "full",
    files: [{ ...source, audience: "full" }, api, test, ref],
  });
  const check = NativeProjectCheckSchema.parse({
    profile: "p",
    "source-profile": "main",
    sourceProfile: {
      mode: "implementation",
      root: "src/main/java",
      include: ["**/*.java"],
    },
    runtime: "java25-junit-v1",
    tests: ["src/api/java/**/*.java", "src/test/java/**/*.java"],
    references: [{
      name: "reference",
      root: "author/reference/src/main/java",
      optional: false,
    }],
    scoring: { mode: "weighted" },
    "api-precheck": { files: ["src/api/java/**/*.java"], entry: "Api" },
  });
  return {
    core: Core,
    Core,
    check,
    runtimeProfile: { mode: "implementation", javaRelease: 25 },
    runtime: { mode: "implementation", javaRelease: 25 },
    studentPlan,
    fullPlan,
    student,
    full,
  };
}
Deno.test("selected bytes сохраняют настоящие имена, роли и API без файловых origins", async () => {
  const f = fixture(), selection = await selectNativeCompilerInputs(f);
  assert(
    selection.sources[0].name === "model/Study.java" &&
      selection.sources[0].target === "src/main/java/model/Study.java",
    "Потеряно настоящее имя",
  );
  assert(
    selection.tests.length === 2 && selection.references[0].available,
    "Потерян полный проверяющий набор",
  );
  assert(
    selection.descriptor.apiPrecheck?.files[0] === "src/api/java/Api.java",
    "Допуск смешан с предметными тестами",
  );
  assert(
    isDeepStrictEqual(selection.sources[0].bytes, f.student.files[0].bytes),
    "Байты заменены",
  );
  const forbidden =
    /sha256|rawSource|sourceRows|sourceSnapshot|inventoryHash|Operation|Plan":/;
  assert(
    !forbidden.test(JSON.stringify(selection)),
    "Остался собственный сертификат состояния",
  );
  f.student.files[0].bytes = bytes("// CURRENT ACTUAL BYTES");
  const changed = await selectNativeCompilerInputs(f);
  assert(
    new TextDecoder().decode(changed.sources[0].bytes) ===
      "// CURRENT ACTUAL BYTES",
    "Новые выбранные байты отвергнуты из-за прежнего fingerprint",
  );
});
Deno.test("selected bytes не дают стартеру роль закрытого теста и не публикуют решения", async () => {
  const f = fixture();
  f.full.files.find((x) => x.target.endsWith("Check.java"))!.reason = "starter";
  let refused = false;
  try {
    await selectNativeCompilerInputs(f);
  } catch (e) {
    refused = String(e).includes("trusted selector");
  }
  assert(refused, "Подменённая роль попала в проверку");
  const g = fixture();
  let privateRefused = false;
  try {
    Core.ArtifactFilesSchema.parse({
      ...g.student,
      files: [...g.student.files, g.full.files.at(-1)],
    });
  } catch {
    privateRefused = true;
  }
  assert(privateRefused, "Student container принял закрытое решение");
});
Deno.test("checks v3 переносит полный действительный набор файлов и никакие доказательства SHA", async () => {
  const f = fixture();
  const projected = await projectNativeChecks({
    ...f,
    courseId: "demo",
    fact: {
      exerciseId: "exr-p",
      source: "labs/real.qmd",
      projectRoot: "projects/p",
      bankMember: true,
      statementVisibility: "open",
      artifactPolicy: { full: "full", conditions: false, student: "starter" },
      check: f.check,
    },
  });
  const checks = nativeChecksManifest({
    courseId: "demo",
    bookRoot: "tasks",
    projects: [projected.project],
  });
  assert(
    checks.schemaVersion === 3 &&
      checks.projects[0].sources[0].name === "model/Study.java",
    "Нет нового функционального контракта",
  );
  const row = checks.projects[0].trustedTests.find((x) =>
    x.name.endsWith("Check.java")
  )!;
  assert(
    Buffer.from(row.data, "base64").toString() === "// PRIVATE_CHECK",
    "Потеряны выбранные bytes",
  );
  assert(
    !/sha256|rawSource|SnapshotHash|inventoryHash|ScopeHash/.test(
      JSON.stringify(checks),
    ),
    "Старое доказательство осталось в DTO",
  );
  assert(
    checks.projects[0].references[0].sources.length === 1,
    "Эталон потерян",
  );
});

Deno.test("предварительный full starter использует тот же selector и не получает private роли", async () => {
  const value = fixture();
  const preliminary = await selectNativeStarterSources(
    value.full.files.filter((f) => f.reason === "starter"),
    value.check.sourceProfile,
    { javaRelease: 25, sourceExtensions: [".java"] },
  );
  const final = await selectNativeCompilerInputs(value);
  assert(
    isDeepStrictEqual(preliminary, final.sources),
    "full/student starter selection differs",
  );
  for (
    const mutation of [
      (files: typeof value.student.files) => {
        files[0].reason = "testset:contract";
      },
      (files: typeof value.student.files) => {
        files[0].bytes = new Uint8Array([255]);
      },
      (files: typeof value.student.files) => {
        files[0].bytes = bytes("class X {}\0");
      },
      (files: typeof value.student.files) => {
        files[0].bytes = new Uint8Array(1048577);
      },
    ]
  ) {
    const files = structuredClone(value.student.files);
    mutation(files);
    let rejected = false;
    try {
      await selectNativeStarterSources(files, value.check.sourceProfile, {
        javaRelease: 25,
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "source role/UTF8/limit violation accepted");
  }
});
