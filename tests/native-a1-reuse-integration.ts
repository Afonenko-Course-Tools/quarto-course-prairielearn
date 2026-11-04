import type * as CorePublic from "course-core/public.ts";
import type { CheckedNativeProjectFact } from "../_extensions/course-prairielearn/application/native-check-projection.ts";
import type { nativeProjectWitness } from "../_extensions/course-prairielearn/application/native-provenance.ts";
import { captureNativeAuxiliary } from "../_extensions/course-prairielearn/application/native-auxiliary.ts";
import { withNativeProjectPlans } from "../_extensions/course-prairielearn/application/native-course.ts";
import { hostDelta, observeNativeHost } from "./native-host-observer.ts";
import { renderPublicBody } from "../_extensions/course-prairielearn/application/export.ts";
import { readNativeAdapterExpectation } from "../_extensions/course-prairielearn/application/native-adapter.ts";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { materializeNativeQuestion } from "../_extensions/course-prairielearn/application/native-materialize.ts";
import { nativeChecksManifest } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import { decodeNativeCheck } from "../_extensions/course-prairielearn/application/native-checks.ts";
const core = join(Deno.args[0], "_extensions/course-core"),
  pl = join(Deno.cwd(), "_extensions/course-prairielearn"),
  Core: typeof CorePublic = await import(
    pathToFileURL(join(core, "public.ts")).href
  ),
  PL: typeof import("../_extensions/course-prairielearn/public.ts") =
    await import(pathToFileURL(join(pl, "public.ts")).href);
const root = await Deno.makeTempDir({ prefix: "c4-reuse-a1-" }),
  out = await Deno.makeTempDir({ prefix: "c4-reuse-a1-download-" });
const artifactOut = await Deno.makeTempDir({ prefix: "c4-reuse-artifacts-" });
const checks: any[] = [];
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
:::
`,
  );
  await put("projects/p/input.qmd", "# Проект\n");
  await put(
    "projects/p/_metadata.yml",
    `course-project:
  starter: {path: starter}
  components:
    apiSupport: {path: ../../shared/api, base: config}
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
      const witness: Awaited<ReturnType<typeof nativeProjectWitness>> = {
        identity: operation.identity,
        ownerInputs: ["bank.qmd"],
        capturedInputs: ["bank.qmd"],
        projects: [{
          source: "bank.qmd",
          format: "html",
          fact,
          declaration: {
            source: "bank.qmd",
            id: "exr-p",
            project: "/projects/p",
            format: "html",
          },
          materialization: undefined,
        }],
      };
      const planned = await withNativeProjectPlans(
        Core,
        root,
        operation.identity.profiles,
        witness,
        async (projectPlans) => {
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
          if (!p) throw Error("selected project missing");
          if (
            !p.trustedTests.some((f: any) =>
              f.target === "src/api/java/Api.java"
            )
          ) throw Error("shared API target not preserved");
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
              materialized.files.find((f) => f.name === "README.md")?.bytes,
            ).includes("Позднее настоящее условие")
          ) throw Error("late condition lost");
          await Deno.writeFile(
            join(artifactOut, "student.zip"),
            materialized.archive,
          );
          const manifest = await nativeChecksManifest({
            courseId: "native",
            bookRoot: root.split("/").at(-1)!,
            projects: [p],
          });
          await Deno.writeTextFile(
            join(artifactOut, "checks.json"),
            JSON.stringify(manifest),
          );
          checks.push({
            project: p,

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
        cost.yamlFileReads < 1 || cost.directoryLayers < 1 ||
        !Object.isFrozen(cost)
      ) throw Error("loader cost observations missing");
      checks.push({ operationMetrics: operation.metrics });
    },
  );
  parentFinal = observer.snapshot();
  const positiveHost = {
    capture: hostDelta(captureStart, captureFinal),
    parentIncludingFinal: hostDelta(parentStart, parentFinal),
    whole: hostDelta(captureStart, parentFinal),
  };
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
  checks.push({ expired });
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
