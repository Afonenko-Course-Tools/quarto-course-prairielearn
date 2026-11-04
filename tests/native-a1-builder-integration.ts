import type * as CorePublic from "course-core/public.ts";
import type { CheckedNativeProjectFact } from "../_extensions/course-prairielearn/application/native-check-projection.ts";
import {
  renderPublicBody,
  uuid,
} from "../_extensions/course-prairielearn/application/export.ts";
import { readNativeAdapterExpectation } from "../_extensions/course-prairielearn/application/native-adapter.ts";
import { captureNativeAuxiliary } from "../_extensions/course-prairielearn/application/native-auxiliary.ts";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { materializeNativeQuestion } from "../_extensions/course-prairielearn/application/native-materialize.ts";
import { nativeChecksManifest } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import { hash } from "../_extensions/course-prairielearn/application/source-selection.ts";
import { decodeNativeCheck } from "../_extensions/course-prairielearn/application/native-checks.ts";
import { nativeVerificationInventory } from "../_extensions/course-prairielearn/application/verification-inventory.ts";
const core = join(Deno.args[0], "_extensions/course-core"),
  pl = join(Deno.cwd(), "_extensions/course-prairielearn"),
  Core: typeof CorePublic = await import(
    pathToFileURL(join(core, "public.ts")).href
  ),
  PL: typeof import("../_extensions/course-prairielearn/public.ts") =
    await import(
      pathToFileURL(join(pl, "public.ts")).href
    );
const root = await Deno.makeTempDir({ prefix: "c4-joint-a1-" }),
  out = await Deno.makeTempDir({ prefix: "c4-joint-a1-download-" });
const artifactOut = await Deno.makeTempDir({ prefix: "c4-joint-artifacts-" });
const sourceRows: { source: string; sha256: string }[] = [],
  checks: unknown[] = [];
let success = false;
let expiredPair: {
  student: CorePublic.ProjectPlan;
  full: CorePublic.ProjectPlan;
} | undefined;
let expiredCondition: CorePublic.MaterializableCondition | undefined;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
function nodes(value: unknown, type: string): number {
  if (Array.isArray(value)) {
    return value.reduce((n, child) => n + nodes(child, type), 0);
  }
  if (!value || typeof value !== "object") return 0;
  return ("t" in value && value.t === type ? 1 : 0) +
    Object.values(value).reduce<number>(
      (n, child) => n + nodes(child, type),
      0,
    );
}
function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length &&
    left.every((byte, i) => byte === right[i]);
}
const privateMarker = "PRIVATE-COMPUTED-SOLUTION-SENTINEL";
async function put(path: string, text: string) {
  await Deno.mkdir(dirname(join(root, path)), { recursive: true });
  const bytes = new TextEncoder().encode(text);
  await Deno.writeFile(join(root, path), bytes);
  sourceRows.push({ source: path, sha256: await hash(bytes) });
}
const policy = {
  "source-profiles": {
    main: {
      mode: "implementation",
      root: "src/main/java",
      include: ["**/*.java"],
    },
  },
  profiles: {
    native: {
      runtime: "java25-junit-v1",
      "source-profile": "main",
      tests: ["src/api/java/**/*.java", "src/test/java/**/*.java"],
      references: [{
        name: "lawful",
        root: "author/example/src/main/java",
        optional: false,
      }],
      "additional-java-sources": {
        archive: "additional.zip",
        "max-files": 128,
        "max-file-bytes": 1048576,
        "max-total-bytes": 4194304,
        "max-archive-bytes": 2097152,
      },
      scoring: { mode: "weighted" },
    },
  },
};
try {
  await put(".gitignore", "/.quarto/\n**/*.quarto_ipynb\n");
  await put(
    "_quarto.yml",
    `project:
  type: website
  output-dir: _site
  render: [bank.qmd]
  resources: ['!projects/**', '!shared/**']
  pre-render: [quarto run ${core}/entrypoints/native-pre.ts, quarto run pre.ts]
  post-render: [quarto run ${core}/entrypoints/native-post.ts]
format: {html: {theme: none}}
course: {id: native, view: student, adapters: [prairielearn]}
course-core-runtime: native-ts
course-core-source-policy: static
course-core-role: exercise-bank
course-core-projection: student
exercise-bank: true
default-exercise-statement-visibility: open
default-exercise-difficulty: introductory
default-exercise-time: 7
default-exercise-course-role: false
default-exercise-target: prairielearn
filters:
 - {at: pre-ast, path: ${core}/native-ts/early-context.lua}
 - {at: post-quarto, path: ${core}/native-ts/late-kind.lua}
 - {at: post-render, path: ${core}/native-ts/late-filter.lua}
`,
  );
  await put(
    "_extensions/prairielearn/contract.json",
    '{"name":"prairielearn"}',
  );
  await put(
    "pre.ts",
    `import * as Core from ${
      JSON.stringify(pathToFileURL(join(core, "public.ts")).href)
    };import * as PL from ${
      JSON.stringify(pathToFileURL(join(pl, "public.ts")).href)
    };await PL.prepareNativeAdapter(Core,{root:Deno.cwd(),projection:'student',outputDirectory:Deno.cwd()+'/_site'});`,
  );
  await put(
    "bank.qmd",
    `---
prairielearn:
  question-defaults: {topic: Java, submission: {mode: upload}}
project-checks: ${JSON.stringify(policy)}
references: [{id: fixture-book, type: book, title: Публичная книга, author: [{family: Автор}], issued: {date-parts: [[2025]]}}]
---
::: {#exr-p project="/projects/p" project-check=native}
## Заголовок

Позднее настоящее условие. Ссылка [@fixture-book].

\`\`\`{r}
#| label: computed
#| echo: false
#| results: asis
#| fig-format: png
value <- 21L * 2L
cat("| computed | value |\\n|:---|---:|\\n| result |", value, "|\\n\\n")
plot(1:3, c(1, 4, 9), type="b", main="computed")
\`\`\`

[Вычисленное значение: \`r value\`]{#computed-anchor}.

::: {.solution}
${privateMarker}
:::
:::
`,
  );
  await put("projects/p/input.qmd", "# Проект\n");
  await put(
    "projects/p/_metadata.yml",
    `course-project:
  starter: {path: starter}
  components:
    apiSupport: {path: ../../shared/api}
  testsets:
    checks: {path: checks, requires: {apiSupport: true}}
  delivery: {student: {testsets: {checks: false}}}
  verification: {testsets: {checks: true}}
  solutions: {example: {path: reference}}
`,
  );
  await put(
    "projects/p/starter/src/main/java/Main.java",
    "public class Main {public static int value(){return 0;}}",
  );
  await put(
    "projects/p/reference/src/main/java/Main.java",
    "public class Main {public static int value(){return Helper.value();}}",
  );
  await put(
    "projects/p/reference/src/main/java/Helper.java",
    "public class Helper {public static int value(){return 42;}}",
  );
  await put(
    "shared/api/src/api/java/Api.java",
    "public class Api {public static int expected(){return 42;}}",
  );
  await put(
    "projects/p/checks/src/test/java/OfficialTest.java",
    "import org.junit.jupiter.api.Test;import static org.junit.jupiter.api.Assertions.*;public class OfficialTest {@Test void result(){assertEquals(Api.expected(),Main.value());}}",
  );
  // Fixture installation only: immutable public Download with matching public Core schema.
  for (
    const [source, target] of [[core, join(out, "course-core")], [
      Deno.args[1],
      join(out, "project-download"),
    ]]
  ) {
    const r = await new Deno.Command("cp", { args: ["-R", source, target] })
      .output();
    if (!r.success) throw Error("fixture copy failed");
  }
  await new Deno.Command("chmod", { args: ["-R", "u+w", out] }).output();
  const Download: Parameters<typeof materializeNativeQuestion>[0]["Download"] =
    await import(
      pathToFileURL(join(out, "project-download/public.ts")).href
    );
  await Core.withNativeCaptureScope(
    { root, projection: "student", outputDirectory: join(root, "_site") },
    { expectedSources: ["bank.qmd"] },
    async (scope) => {
      await scope.captureInputs(["bank.qmd"], async (token: string) => {
        const result = await new Deno.Command("quarto", {
          args: ["render", "bank.qmd"],
          cwd: root,
          env: {
            COURSE_CORE_CAPTURE_TOKEN: token,
            QUARTO_RUN_NO_NETWORK: "true",
          },
          stdout: "piped",
          stderr: "piped",
        }).output();
        if (!result.success) {
          throw Error(new TextDecoder().decode(result.stderr));
        }
      });
    },
  );
  const candidate = await readNativeAdapterExpectation(Core, root);
  await Core.withCurrentNativeOperation(
    candidate.expectation,
    async (operation) => {
      const auxiliary = captureNativeAuxiliary(() => operation.assertCurrent());
      const adapter = PL.createNativeAdapter({
        root,
        core: Core,
        preparedIdentity: candidate.identity,
      });
      await adapter.validateCourse(operation, {
        expectedSources: ["bank.qmd"],
      });
      await Core.readProjectContexts([{
        owner: root,
        inputs: ["projects/p/input.qmd"],
        profiles: operation.identity.profiles,
        format: "html",
      }], async ([group]) => {
        const pair = {
          source: "bank.qmd",
          exerciseId: "exr-p",
          student: await Core.planProject(group.contexts[0], {
            audience: "student",
          }),
          full: await Core.planProject(group.contexts[0], { audience: "full" }),
        };
        const condition = operation.condition({
          source: "bank.qmd",
          exerciseId: "exr-p",
          view: "student",
        });
        expiredPair = pair;
        expiredCondition = condition;
        // Explicit test policy/facts, not assignmentProvenance/qualified assignment.
        const fact: CheckedNativeProjectFact = {
          exerciseId: "exr-p",
          source: "bank.qmd",
          projectRoot: "projects/p",
          bankMember: true,
          statementVisibility: "open",
          artifactPolicy: {
            student: "starter",
            full: "full",
            conditions: true,
          },
          check: decodeNativeCheck(policy, "native"),
        };
        const materialized = await materializeNativeQuestion({
          Core,
          operation,
          auxiliary,
          pair,
          condition,
          fact,
          settings: adapter.business("bank.qmd").questions["exr-p"],
          sourceRows,
          courseId: "native",
          runtime: {
            mode: "implementation",
            javaRelease: 25,
            sourceExtensions: [".java"],
          },
          bindings: async (_plan, _condition, submission) => ({
            submission,
          }),
          Download,
          adapter,
          expectedSources: ["bank.qmd"],
        });
        assert(
          nodes(condition.body, "Table") === 1,
          "Вычисленная Table отсутствует",
        );
        assert(
          nodes(condition.body, "Image") === 1,
          "Вычисленная Image отсутствует",
        );
        assert(
          JSON.stringify(condition.body).includes("42"),
          "Inline R потерял значение 42",
        );
        assert(
          !JSON.stringify(condition.body).includes(privateMarker),
          "Private solution попало в condition",
        );
        const imageSources = condition.resources.filter((source) =>
          source.endsWith(".png")
        );
        assert(imageSources.length === 1, "Ожидался один observed PNG source");
        const imageSource = imageSources[0];
        // Настоящая public ordinary resource capability, не assignment proof.
        const observed = await operation.resourceInventory({
          files: [{ source: imageSource, target: imageSource }],
        });
        const publicResources = observed.files.map((file) => ({
          owner: "native",
          source: "bank.qmd",
          effectiveBase: root,
          target: file.target,
          sha256: file.sha256,
          data: btoa(
            Array.from(file.bytes, (byte) => String.fromCharCode(byte)).join(
              "",
            ),
          ),
          visibility: "public",
        }));
        const html = await renderPublicBody(
          {
            owner: "native",
            apiVersion: condition.pandocApiVersion,
            resources: publicResources,
          },
          condition.body,
          "native/exr-p",
          { source: "bank.qmd", id: "exr-p", field: "condition" },
          "clientFiles",
          "{{ client }}",
          { preserveBibliography: true, auxiliary },
        );
        await Deno.writeTextFile(
          join(artifactOut, "condition.html"),
          html.html,
        );
        assert(
          html.html.includes("<table") && html.html.includes("42"),
          "PL HTML потерял computed table",
        );
        assert(
          /Вычисленное\s+значение:\s*42/.test(html.html),
          "PL HTML потерял inline42",
        );
        assert(
          !html.html.includes(privateMarker),
          "PL HTML содержит private solution",
        );
        const expectedUuid = "3bef88ed-8e1a-5e4b-8e8a-95224804f9c1";
        assert(
          await uuid("native/exr-p") === expectedUuid &&
            html.html.includes("pl-" + expectedUuid + "-computed-anchor"),
          "Computed body изменил UUID/anchor identity native/exr-p",
        );
        const clientPng = html.files.find((file) =>
          file.name === "clientFiles/" + imageSource
        );
        const inventoryPng = materialized.files.find((file) =>
          file.name === "resources/" + imageSource
        );
        assert(
          clientPng && inventoryPng,
          "Нет PNG в PL clientFiles или README inventory",
        );
        assert(
          sameBytes(clientPng.data, observed.files[0].bytes) &&
            sameBytes(inventoryPng.bytes, observed.files[0].bytes),
          "PL clientFiles/README PNG отличаются от observed Native bytes",
        );
        if (!html.html.includes("fixture-book")) {
          throw Error("actual ordinary native Cite lost");
        }
        const p = materialized.project, selection = materialized.selection;
        assert(p && selection, "Нет проверенного automatic project selection");
        assert(
          selection.descriptor.mode === "implementation" &&
            selection.descriptor.runtime === "java25-junit-v1" &&
            selection.descriptor.java?.release === 25 &&
            selection.descriptor.scoring.mode === "weighted",
          "Computed condition изменил grading descriptor",
        );
        assert(
          selection.sources.length === 1 &&
            selection.sources[0].name === "Main.java" &&
            new TextDecoder().decode(selection.sources[0].bytes) ===
              "public class Main {public static int value(){return 0;}}",
          "Cell изменила выбранный starter Java source",
        );
        if (
          !p.trustedTests.some((f) =>
            "ownerRelativePath" in f &&
            f.ownerRelativePath === "shared/api/src/api/java/Api.java"
          )
        ) throw Error("shared raw origin not preserved");
        if (
          p.references[0].targets.join(",") !==
            "author/example/src/main/java/Helper.java,author/example/src/main/java/Main.java"
        ) throw Error("reference targets/helpers changed");
        if (
          materialized.files.some((f) =>
            /Api.java|OfficialTest.java|Helper.java|author\//.test(f.name)
          )
        ) throw Error("student privacy leaked");
        const readme = materialized.files.find((file) =>
          file.name === "README.md"
        );
        assert(readme, "README отсутствует");
        const readmeText = new TextDecoder().decode(readme.bytes);
        assert(
          readmeText.includes("Позднее настоящее условие") &&
            readmeText.includes("computed") &&
            readmeText.includes("42") &&
            readmeText.includes("resources/" + imageSource) &&
            !readmeText.includes(privateMarker),
          "README потерял computed content/resource closure или нарушил privacy",
        );
        for (const file of materialized.files) {
          assert(
            !new TextDecoder().decode(file.bytes).includes(privateMarker),
            "Private marker в student inventory",
          );
          const target = join(artifactOut, "inventory", file.name);
          await Deno.mkdir(dirname(target), { recursive: true });
          await Deno.writeFile(target, file.bytes);
        }
        for (const file of html.files) {
          const target = join(artifactOut, file.name);
          await Deno.mkdir(dirname(target), { recursive: true });
          await Deno.writeFile(target, file.data);
        }
        await Deno.writeFile(
          join(artifactOut, "student.zip"),
          materialized.archive,
        );
        const verification = await nativeVerificationInventory({
          courseId: "native",
          operation: operation.identity.operation,
          selections: { "exr-p": materialized.selection },
        });
        assert(
          verification.scenarios.map((row) => row.scenario).sort().join(",") ===
            "reference:lawful,starter",
          "Computed body изменил starter/reference grading scenarios",
        );
        const sources = sourceRows.filter((r) => r.source === "bank.qmd"),
          selectionScope = {
            schema: "pl-native-selected-checks-v1",
            identity: operation.identity,
            assessments: [{ source: "bank.qmd", id: "sec-work" }],
            sources,
            automaticIds: ["native/exr-p"],
          };
        const manifest = await nativeChecksManifest({
          courseId: "native",
          bookRoot: root.split("/").at(-1)!,
          sources,
          projects: [p],
          version: 2,
          selectionScope,
        });
        await Deno.writeTextFile(
          join(artifactOut, "checks.json"),
          JSON.stringify(manifest),
        );
        checks.push({
          computed: {
            table: nodes(condition.body, "Table"),
            image: nodes(condition.body, "Image"),
            imageSource,
            pngBytes: observed.files[0].bytes.length,
            clientFile: clientPng.name,
            uuid: expectedUuid,
            selectedJavaSources: selection.sources.map((file) => file.name),
          },
          project: p,
          verification,
          contextMetrics: group.metrics,
          studentPlanMetrics: Core.projectPlanMetrics(pair.student),
          fullPlanMetrics: Core.projectPlanMetrics(pair.full),
        });
        let rejected = false;
        try {
          await Core.materializeProject(
            structuredClone(pair.student),
            condition,
            { submission: { files: [], instructions: "Сдайте файлы." } },
          );
        } catch (e) {
          rejected = /CONTEXT_EXPIRED/.test(String(e));
        }
        if (!rejected) throw Error("cloned plan accepted");
        await operation.assertCurrent();
      });
      checks.push({ operationMetrics: operation.metrics });
    },
  );
  assert(
    expiredPair && expiredCondition,
    "Actual A1 callback не сохранил контрольные handles",
  );
  let expired = "";
  try {
    await Core.materializeProject(expiredPair.student, expiredCondition, {
      submission: { files: [], instructions: "Сдайте файлы." },
    });
  } catch (e) {
    expired = String(e);
  }
  if (!/CONTEXT_EXPIRED/.test(expired)) {
    throw Error("expired plan accepted: " + expired);
  }
  // 5a currentness относится к selected raw QMD; grader Java files не меняются.
  const changed = join(root, "bank.qmd"),
    original = await Deno.readFile(changed);
  let stale = "", entered = false;
  try {
    await Deno.writeTextFile(changed, "CHANGED_AFTER_CAPTURE");
    await Core.withCurrentNativeOperation(candidate.expectation, async () => {
      entered = true;
    });
  } catch (e) {
    stale = String(e);
  } finally {
    await Deno.writeFile(changed, original);
  }
  if (entered || !/OPERATION_CHANGED/.test(stale)) {
    throw Error("changed S reached callback: " + stale);
  }
  checks.push({ expired, stale, staleCallbackEntered: entered });
  console.log(
    JSON.stringify(
      {
        root,
        artifactOut,
        kind:
          "ordinary-native-plus-A1-and-Download-separate-pipelines-NOT-assignment-qualification",
        checks,
      },
      null,
      2,
    ),
  );
  success = true;
} finally {
  if (!success) console.error("Preserved failing fixture " + root);
  try {
    await Deno.remove(out, { recursive: true });
  } catch (e) {
    console.error("Fixture cleanup: " + e);
  }
}
