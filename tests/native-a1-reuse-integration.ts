import { captureNativeAuxiliary } from "../_extensions/course-prairielearn/application/native-auxiliary.ts";
import { withNativeProjectPlans } from "../_extensions/course-prairielearn/application/native-course.ts";
import { hostDelta, observeNativeHost } from "./native-host-observer.ts";
import { renderPublicBody } from "../_extensions/course-prairielearn/application/export.ts";
import { readNativeAdapterExpectation } from "../_extensions/course-prairielearn/application/native-adapter.ts";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { materializeNativeQuestion } from "../_extensions/course-prairielearn/application/native-materialize.ts";
import { nativeChecksManifest } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import { hash } from "../_extensions/course-prairielearn/application/source-selection.ts";
import { decodeNativeCheck } from "../_extensions/course-prairielearn/application/native-checks.ts";
import { nativeVerificationInventory } from "../_extensions/course-prairielearn/application/verification-inventory.ts";
const core = join(Deno.args[0], "_extensions/course-core"),
  pl = join(Deno.cwd(), "_extensions/course-prairielearn"),
  Core = await import(pathToFileURL(join(core, "public.ts")).href),
  PL = await import(pathToFileURL(join(pl, "public.ts")).href);
const root = await Deno.makeTempDir({ prefix: "c4-reuse-a1-" }),
  out = await Deno.makeTempDir({ prefix: "c4-reuse-a1-download-" });
const artifactOut = await Deno.makeTempDir({ prefix: "c4-reuse-artifacts-" });
const sourceRows: any[] = [], checks: any[] = [];
let success = false, expiredPair: any, expiredCondition: any;
let observer: any,
  captureStart: any,
  captureFinal: any,
  parentStart: any,
  parentFinal: any;
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
course-core-role: exercise-bank
course-core-projection: student
exercise-bank: true
default-exercise-statement-visibility: open
default-exercise-difficulty: introductory
default-exercise-time: 7
default-exercise-course-role: false
default-exercise-target: prairielearn
filters:
 - {at: pre-ast, path: ${pl}/native-ts/raw-capture.lua}
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
  const Download = await import(
    pathToFileURL(join(out, "project-download/public.ts")).href
  );
  observer = observeNativeHost();
  captureStart = observer.snapshot();
  await Core.withNativeCaptureScope(
    { root, projection: "student", outputDirectory: join(root, "_site") },
    { expectedSources: ["bank.qmd"] },
    async (scope: any) => {
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
  captureFinal = observer.snapshot();
  const candidate = await readNativeAdapterExpectation(Core, root);
  parentStart = observer.snapshot();
  await Core.withCurrentNativeOperation(
    candidate.expectation,
    async (operation: any) => {
      const auxiliary = captureNativeAuxiliary(() => operation.assertCurrent());
      const adapter = PL.createNativeAdapter({
        root,
        core: Core,
        preparedIdentity: candidate.identity,
      });
      await adapter.validateCourse(operation, {
        expectedSources: ["bank.qmd"],
      });
      const fact = {
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
      const witness = {
        projects: [{ source: "bank.qmd", format: "html", fact }],
      };
      const planned = await withNativeProjectPlans(
        Core,
        root,
        operation.identity.profiles,
        witness,
        async (projectPlans: any[]) => {
          const pair = projectPlans[0];
          const condition = operation.condition({
            source: "bank.qmd",
            exerciseId: "exr-p",
            view: "student",
          });
          expiredPair = pair;
          expiredCondition = condition;
          // Explicit test policy/facts, not assignmentProvenance/qualified assignment.
          const materialized = await materializeNativeQuestion({
            Core,
            operation,
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
            bindings: async (_plan: any, _condition: any, submission: any) => ({
              submission,
            }),
            Download,
            adapter,
            expectedSources: ["bank.qmd"],
          });
          const html = await renderPublicBody(
            {
              owner: "native",
              apiVersion: condition.pandocApiVersion,
              resources: [],
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
          if (!html.html.includes("fixture-book")) {
            throw Error("actual ordinary native Cite lost");
          }
          const p = materialized.project;
          if (
            !p.trustedTests.some((f: any) =>
              f.ownerRelativePath === "shared/api/src/api/java/Api.java"
            )
          ) throw Error("shared raw origin not preserved");
          if (
            p.references[0].targets.join(",") !==
              "author/example/src/main/java/Helper.java,author/example/src/main/java/Main.java"
          ) throw Error("reference targets/helpers changed");
          if (
            materialized.files.some((f: any) =>
              /Api.java|OfficialTest.java|Helper.java|author\//.test(f.name)
            )
          ) throw Error("student privacy leaked");
          if (
            !new TextDecoder().decode(
              materialized.files.find((f: any) => f.name === "README.md").bytes,
            ).includes("Позднее настоящее условие")
          ) throw Error("late condition lost");
          await Deno.writeFile(
            join(artifactOut, "student.zip"),
            materialized.archive,
          );
          const verification = await nativeVerificationInventory({
            courseId: "native",
            operation: operation.identity.operation,
            selections: { "exr-p": materialized.selection },
          });
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
            project: p,
            verification,

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
        },
        operation,
      );
      if (!planned?.projectContextMetrics) {
        throw Error("REUSE_FINAL_METRICS_MISSING");
      }
      checks[0].projectContextMetrics = planned.projectContextMetrics;
      const cost = planned.projectContextMetrics.final;
      if (
        cost.inspectCalls !== 1 || cost.fullWalks !== 0 ||
        operation.metrics.inspectCalls !== 1 ||
        operation.metrics.fullWalks !== 1 ||
        operation.metrics.childRenders !== 1
      ) throw Error("REUSE_COST_TARGET_MISSED");
      if (
        cost.fullFences <= planned.projectContextMetrics.inside.fullFences ||
        !Object.isFrozen(cost)
      ) throw Error("FINAL_A1_METRICS_NOT_CLOSED_IMMUTABLE");
      checks.push({ operationMetrics: operation.metrics });
    },
  );
  parentFinal = observer.snapshot();
  const positiveHost = {
    capture: hostDelta(captureStart, captureFinal),
    parentIncludingFinal: hostDelta(parentStart, parentFinal),
    whole: hostDelta(captureStart, parentFinal),
  };
  const wrongOrigins: any[] = [];
  for (
    const [name, projectRoot, format] of [[
      "foreign-project",
      "shared/api",
      "html",
    ], ["foreign-format", "projects/p", "revealjs"]]
  ) {
    const start = observer.snapshot();
    let error = "", callbackEntered = false;
    try {
      await Core.withCurrentNativeOperation(
        candidate.expectation,
        async (op: any) => {
          await withNativeProjectPlans(Core, root, op.identity.profiles, {
            projects: [{
              source: "bank.qmd",
              format,
              fact: { exerciseId: "exr-p", projectRoot },
            }],
          }, async () => {
            callbackEntered = true;
          }, op);
        },
      );
    } catch (e) {
      error = String(e);
    }
    const host = hostDelta(start, observer.snapshot());
    if (
      callbackEntered || !error.includes("CONTEXT_REQUEST") ||
      host.commands.some((c: any) =>
        c.args[0] === "inspect" || c.args[0] === "render"
      )
    ) throw Error("wrong origin reached A1 probe: " + name + error);
    wrongOrigins.push({ name, error, callbackEntered, host });
  }
  checks.push({ wrongOrigins });
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
  const changed = join(root, "shared/api/src/api/java/Api.java"),
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
        positiveHost,
        parentFinalMetrics:
          "UNAVAILABLE after parent callback; host observation includes closing fence",
        kind:
          "ordinary-native-reuse-plus-A1-and-Download-separate-pipelines-NOT-assignment-qualification",
        checks,
      },
      null,
      2,
    ),
  );
  success = true;
} finally {
  if (!success) {
    console.error("Preserved failing fixture " + root);
    if (observer) {
      console.error(
        JSON.stringify({ failedHostObservation: observer.snapshot() }),
      );
    }
  }
  observer?.restore();
  try {
    await Deno.remove(out, { recursive: true });
  } catch (e) {
    console.error("Fixture cleanup: " + e);
  }
}
