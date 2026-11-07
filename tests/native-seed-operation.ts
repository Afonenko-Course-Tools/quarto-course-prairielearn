import { required, record, string, array, fixtureAt } from "./fixture-values.ts";
import type * as CorePublic from "course-core/public.ts";
// Настоящий ordinary Core/A1 → два seed artifacts одной операции. Не assignment/P.
import { strict as assert } from "node:assert";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const source = resolve(required(Deno.args[0])),
  repo = resolve(new URL("../", import.meta.url).pathname),
  root = await Deno.makeTempDir({ prefix: "c9-seed-op-" });
const core = join(root, "_extensions/course-core"),
  pl = join(root, "_extensions/course-prairielearn");
async function put(p: string, s: string | Uint8Array) {
  await Deno.mkdir(dirname(join(root, p)), { recursive: true });
  if (typeof s === "string") await Deno.writeTextFile(join(root, p), s);
  else await Deno.writeFile(join(root, p), s);
}
async function quarto(args: string[], env: Record<string, string> = {}) {
  const r = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
    args,
    cwd: root,
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!r.success) {
    throw Error(
      root + "\n" + new TextDecoder().decode(r.stdout) +
        new TextDecoder().decode(r.stderr),
    );
  }
}
try {
  await put(".gitignore", "/.quarto/\n**/*.quarto_ipynb\n");
  await put(
    "_quarto.yml",
    `project:
  type: website
  render: [index.qmd]
  output-dir: _site
  resources: ['!projects/**']
  pre-render: [quarto run ${core}/entrypoints/native-pre.ts, quarto run pre.ts]
  post-render: [quarto run ${core}/entrypoints/native-post.ts]
format: {html: {theme: none}}
course: {id: seed-op, view: student, adapters: [prairielearn]}
course-core-runtime: native-ts
course-core-role: exercise-bank
course-core-projection: student
exercise-bank: true
default-exercise-difficulty: introductory
default-exercise-time: 5
default-exercise-course-role: false
default-exercise-target: prairielearn
default-exercise-statement-visibility: open
default-exercise-project-check: false
filters: [course-core, course-prairielearn]
prairielearn:
  seed-targets: {exr-gh: versioning/project}
  question-defaults:
    topic: Git
    grading: {method: manual}
    single-variant: true
    submission:
      mode: workspace
      workspaceOptions:
        image: 'example.invalid/fixture@sha256:${"0".repeat(64)}'
        home: /workspace
        port: 8080
        gradedFiles: ['work/**', 'work/.git/**', 'work/.*', 'explanation.m[d]', '.pl-seed/identity.jso[n]']
project-materialization:
  projects:
    exr-gh: {include-git: true, common-files: []}
    exr-rest: {include-git: true, common-files: []}
`,
  );
  await put(
    "index.qmd",
    '::: {#exr-gh project="/projects/github-ssh" prairielearn-submission=upload}\n## GitHub\nПолное условие GitHub.\n:::\n\n::: {#exr-rest project="/projects/restore-selected-state"}\n## Восстановление\nПолное условие восстановления.\n:::\n',
  );
  const provenance = record(JSON.parse(
    await Deno.readTextFile(
      new URL("./fixtures/git-recipes/provenance.json", import.meta.url),
    ),
  ));
  for (const row of array(provenance.files).map(record)) {
    await put(
      "projects/" + string(row.path),
      await Deno.readFile(
        new URL("./fixtures/git-recipes/" + string(row.path), import.meta.url),
      ),
    );
  }
  for (const name of ["github-ssh", "restore-selected-state"]) {
    await put(
      "projects/" + name + "/_metadata.yml",
      "course-project:\n  starter: {path: student}\n" +
        (name === "github-ssh"
          ? "  instructions: {local: {path: student/README.md}}\n"
          : ""),
    );
  }
  await put(
    "pre.ts",
    `import * as Core from ${
      JSON.stringify(pathToFileURL(join(core, "public.ts")).href)
    };import * as PL from ${
      JSON.stringify(pathToFileURL(join(pl, "public.ts")).href)
    };await PL.prepareNativeAdapter(Core,{root:Deno.cwd(),projection:'student',outputDirectory:Deno.cwd()+'/_site'});`,
  );
  await quarto(["add", source, "--no-prompt"]);
  await quarto(["add", repo, "--no-prompt"]);
  const Core: typeof CorePublic = await import(
      pathToFileURL(join(core, "public.ts")).href
    ),
    PL: typeof import("../_extensions/course-prairielearn/public.ts") =
      await import(pathToFileURL(join(pl, "public.ts")).href);
  const Entry:
    typeof import("../_extensions/course-prairielearn/application/native-adapter.ts") =
      await import(
        pathToFileURL(join(pl, "application/native-adapter.ts")).href
      );
  const zip = Deno.args[1]
    ? (await import(
      pathToFileURL(
        join(
          resolve(Deno.args[1]),
          "_extensions/project-download/domain/zip.ts",
        ),
      ).href
    )).zip
    : () => new Uint8Array();
  await Core.withNativeCaptureScope(
    { root, projection: "student", outputDirectory: root + "/_site" },
    { expectedSources: ["index.qmd"] },
    async (scope) =>
      scope.captureInputs(
        ["index.qmd"],
        (token: string) =>
          quarto(["render", "index.qmd"], {
            COURSE_CORE_CAPTURE_TOKEN: token,
            QUARTO_RUN_NO_NETWORK: "true",
          }),
      ),
  );
  const candidate = await Entry.readNativeAdapterExpectation(Core, root);
  await Core.withCurrentNativeOperation(
    candidate.expectation,
    async (op) => {
      let validations = 0, currents = 0, zips = 0;
      const observed = {
        ...op,
        validateRelease: (...args: Parameters<typeof op.validateRelease>) => {
          validations++;
          return op.validateRelease(...args);
        },
        assertCurrent: () => {
          currents++;
          return op.assertCurrent();
        },
      };
      const adapter = PL.createNativeAdapter({
        root,
        core: Core,
        preparedIdentity: candidate.identity,
      });
      const request = { expectedSources: ["index.qmd"] };
      await adapter.validateCourse(observed, request);
      const artifacts: Record<string, unknown>[] = [];
      let batchFinal: CorePublic.NativeOperationProjectContextBatch | undefined;
      await op.withProjectContracts([{
        owner: root,
        profiles: op.identity.profiles,
        format: "html",
        directories: [
          "projects/github-ssh",
          "projects/restore-selected-state",
        ],
      }], async (batch) => {
        batchFinal = batch;
        for (
          const [i, id, target, expected] of [[
            0,
            "exr-gh",
            "versioning/project",
            "033fe30534573e2d05256fca0f619e2629b2bfab",
          ], [
            1,
            "exr-rest",
            "work",
            "2f12c0ccccc3c10c483502559fa7efee33a52607",
          ]] as const
        ) {
          const context = required(batch.groups[0]).contexts[i],
            plan = await Core.planProject(required(context), { audience: "student" }),
            condition = op.condition({
              source: "index.qmd",
              exerciseId: id,
              view: "student",
            });
          const inventory = await Core.materializeProject(plan, condition, {
            submission: { files: [], instructions: "Сдайте полный комплект." },
          });
          const artifact = await adapter.workspaceArtifact({
            operation: observed,
            expectedSources: ["index.qmd"],
            source: "index.qmd",
            exerciseId: id,
            inventory,
            zip: (files) => {
              zips++;
              return zip(files);
            },
          });
          assert.equal(artifact.initial, expected);
          assert(
            artifact.files.some((f) => f.name === target + "/.git/HEAD"),
          );
          assert(!artifact.files.some((f) => f.name === "seed_recipe.py"));
          artifacts.push({
            id,
            target,
            initial: artifact.initial,
            files: artifact.files.length,
            archiveBytes: artifact.archive.length,
          });
        }
      });
      assert.equal(validations, 1);
      assert.equal(zips, 2);
      assert.equal(artifacts.length, 2);
      console.log(JSON.stringify(
        {
          artifacts,
          validations,
          currents,
          zips,
          packaging: Deno.args[1]
            ? "real immutable Download ZIP"
            : "test callback only; no ZIP claim",
          projectContexts: required(batchFinal).metrics,
          operationMetrics: op.metrics,
          scope: "GENUINE_ORDINARY_NOT_ASSIGNMENT_P",
        },
        null,
        2,
      ));
    },
  );
} finally {
  if (Deno.env.get("C35_KEEP_FIXTURE")) console.log("RETAINED", root);
  else await Deno.remove(root, { recursive: true });
}
