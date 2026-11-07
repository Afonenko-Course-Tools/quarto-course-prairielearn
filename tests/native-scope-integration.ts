import type * as CorePublic from "course-core/public.ts";
import { required, record, array, setFixture, deleteFixture } from "./fixture-values.ts";
// Genuine ordinary Core producer → C consumer; не assignment/P/actual C CLI.
import { strict as assert } from "node:assert";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const coreSource = resolve(required(Deno.args[0])),
  repo = resolve(new URL("../", import.meta.url).pathname);
const root = await Deno.makeTempDir({ prefix: "pl-c9-native-" }),
  checks: string[] = [];
const core = join(root, "_extensions/course-core"),
  pl = join(root, "_extensions/course-prairielearn");
async function put(p: string, s: string) {
  await Deno.mkdir(dirname(join(root, p)), { recursive: true });
  await Deno.writeTextFile(join(root, p), s);
}
async function command(args: string[], env: Record<string, string> = {}) {
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
  return r;
}
try {
  await put(".gitignore", "/.quarto/\n**/*.quarto_ipynb\n");
  await put(
    "_quarto.yml",
    `project:
  type: website
  render: [index.qmd, slides.qmd]
  resources: ['!project/**']
  output-dir: _site
  pre-render: [quarto run ${core}/entrypoints/native-pre.ts, quarto run pre.ts]
  post-render: [quarto run ${core}/entrypoints/native-post.ts]
profile: {default: student}
format: {html: {theme: none}}
course: {id: scope-fixture, view: student, adapters: [prairielearn]}
course-core-runtime: native-ts
exercise-bank: true
default-exercise-statement-visibility: open
default-exercise-difficulty: introductory
default-exercise-time: 7
default-exercise-course-role: false
default-exercise-target: prairielearn
filters: [course-core, course-prairielearn]
`,
  );
  await put("_quarto-student.yml", "course: {view: student}\n");
  await put("project/input.txt", "Starter\n");
  await put(
    "index.qmd",
    `---
prairielearn:
  question-defaults: {topic: Git, grading: {method: manual}, submission: {mode: upload}}
---
::: {#exr-example project=project prairielearn-grading=manual}
## Задача
Условие.
:::
`,
  );
  await put(
    "slides.qmd",
    "---\nformat: revealjs\n---\n# Пустая страница\n\nNative отсутствие metadata.\n",
  );
  await put(
    "pre.ts",
    `import * as Core from ${
      JSON.stringify(pathToFileURL(join(core, "public.ts")).href)
    };import * as PL from ${
      JSON.stringify(pathToFileURL(join(pl, "public.ts")).href)
    };await PL.prepareNativeAdapter(Core,{root:Deno.cwd(),projection:'student',outputDirectory:Deno.cwd()+'/_site'});`,
  );
  await command(["add", coreSource, "--no-prompt"]);
  await command(["add", repo, "--no-prompt"]);
  const Core: typeof CorePublic = await import(pathToFileURL(join(core, "public.ts")).href),
    PL: typeof import("../_extensions/course-prairielearn/public.ts") = await import(pathToFileURL(join(pl, "public.ts")).href);
  const { readNativeAdapterExpectation } = await import(
    pathToFileURL(join(pl, "application/native-adapter.ts")).href
  );
  async function capture() {
    await Core.withNativeCaptureScope(
      { root, projection: "student", outputDirectory: root + "/_site" },
      { expectedSources: ["index.qmd", "slides.qmd"] },
      async (scope) => {
        for (const source of ["index.qmd", "slides.qmd"]) {
          await scope.captureInputs(
            [source],
            (token: string) =>
              command(["render", source], {
                COURSE_CORE_CAPTURE_TOKEN: token,
                QUARTO_RUN_NO_NETWORK: "true",
                DENO_NO_PACKAGE_JSON: "1",
              }),
          );
        }
      },
    );
  }
  await capture();
  const candidate = await readNativeAdapterExpectation(Core, root);
  assert.deepEqual(candidate.identity.profiles, ["student"]);
  await Core.withNativePublication(candidate.expectation,
    { expectedSources: ["index.qmd", "slides.qmd"] },
    async (publication: import("course-core/public.ts").NativePublication) => {
      const data = await PL.inspectPublication(publication);
      assert.equal(data.documents.length, 2);
    });
  await assert.rejects(() => Core.withNativePublication(candidate.expectation,
    { expectedSources: ["index.qmd"] },
    (publication: import("course-core/public.ts").NativePublication) => PL.inspectPublication(publication)), /RELEASE.COVERAGE/);
  await Core.withCurrentNativeOperation(
    candidate.expectation,
    async (op) => {
      let validates = 0, currents = 0;
      const observed = {
        ...op,
        validateRelease: (...args: Parameters<typeof op.validateRelease>) => {
          validates++;
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
      const request = { expectedSources: ["index.qmd", "slides.qmd"] };
      const proof = await adapter.validateCourse(observed, request);
      assert.deepEqual(proof.documents.map((d) => d.format).sort(), [
        "html",
        "revealjs",
      ]);
      assert.equal(
        Object.keys(adapter.business("slides.qmd").questions).length,
        0,
      );
      await adapter.validateCourse(observed, request);
      await adapter.validateCourse(observed, request);
      assert.equal(validates, 1);
      assert.equal(currents, 4);
      checks.push(
        "same op/exact request validates once; currentness before each reuse",
      );
      const plain = PL.createNativeAdapter({ root, core: Core });
      const input = adapter.validatedInput("index.qmd");
      const read = Deno.readTextFile,
        readBytes = Deno.readFile,
        real = Deno.realPath;
      let io = 0;
      try {
        Deno.readTextFile = (() => {
          io++;
          throw Error("unexpected read");
        });
        Deno.readFile = () => { io++; throw Error("unexpected read"); };
        Deno.realPath = () => { io++; throw Error("unexpected read"); };
        await plain.validate(structuredClone(input));
      } finally {
        Deno.readTextFile = read;
        Deno.readFile = readBytes;
        Deno.realPath = real;
      }
      assert.equal(io, 0);
      assert.throws(() => plain.business("index.qmd"));
      assert.throws(() => plain.validatedInput("index.qmd"));
      checks.push(
        "plain DTO: 0 IO and no business/cache/publication authority",
      );
      for (
        const nativeMetadata of [
          undefined,
          { foreign: {} },
          { readSet: ["configuration"], values: {} },
        ]
      ) {
        const bad = structuredClone(input);
        setFixture(bad, ["nativeMetadata"], nativeMetadata);
        await assert.rejects(() => plain.validate(bad));
      }
      const missing = structuredClone(input);
      deleteFixture(missing, ["nativeMetadata"]);
      await assert.rejects(() => plain.validate(missing));
      for (
        const [label, change] of [
          ["source", (v: CorePublic.NativeAdapterValidationInput) => setFixture(v, ["origin", "source"], "foreign.qmd")],
          [
            "witness",
            (v: CorePublic.NativeAdapterValidationInput) => setFixture(v, ["origin", "captureWitness"], crypto.randomUUID()),
          ],
          ["profiles", (v: CorePublic.NativeAdapterValidationInput) => setFixture(v, ["origin", "profiles"], ["foreign"])],
          ["generation", (v: CorePublic.NativeAdapterValidationInput) => setFixture(v, ["origin", "operation"], crypto.randomUUID())],
        ] as const
      ) {
        const mutant = {
          ...op,
          validateRelease: (r: Parameters<typeof op.validateRelease>[0], validators: Parameters<typeof op.validateRelease>[1]) =>
            op.validateRelease(
              r,
              (validators ?? []).map((v) => ({
                ...v,
                validate: (input: Parameters<typeof v.validate>[0]) => {
                  const copy = structuredClone(input);
                  change(copy);
                  return v.validate(copy);
                },
              })),
            ),
        };
        await assert.rejects(
          () =>
            PL.createNativeAdapter({ root, core: Core }).validateCourse(
              mutant,
              request,
            ),
          /PL.CAPTURE_CHANGED/,
        );
        checks.push(label + " refused inside genuine producer callback");
      }
      const folder = join(
        root,
        "_generated/course-spec/prairielearn-native",
        candidate.identity.operation,
      );
      assert.deepEqual(
        (await Array.fromAsync(Deno.readDir(folder))).map((e) => e.name),
        ["request.json"],
      );
      checks.push("0 C per-document business sidecars");
      // После acquisition generated transport больше не consumer authority.
      // Private proof не меняется от изменения неиспользуемого candidate, новые
      // operation/request обязаны заново приобрести и проверить transport.
      const businessCopy = adapter.business("index.qmd");
      required(businessCopy.questions["exr-example"]).topic = "MUTATED_LOCAL_COPY";
      assert.equal(
        required(adapter.business("index.qmd").questions["exr-example"]).topic,
        "Git",
      );
      const inputCopy = adapter.validatedInput("index.qmd");
      inputCopy.origin.operation = crypto.randomUUID();
      assert.equal(
        adapter.validatedInput("index.qmd").origin.operation,
        op.identity.operation,
      );
      checks.push(
        "business/input getters return detached data; private acquired snapshots unchanged",
      );
      const requestPath = join(folder, "request.json"),
        originalCandidate = await Deno.readTextFile(requestPath);
      const changedCandidate = record(JSON.parse(originalCandidate));
      record(required(array(changedCandidate.inputs)[0])).captureWitness = crypto.randomUUID();
      await Deno.writeTextFile(requestPath, JSON.stringify(changedCandidate));
      const readCandidate = Deno.readTextFile;
      let candidateReads = 0;
      try {
        Deno.readTextFile = ((path, ...rest) => {
          if (String(path) === requestPath) {
            candidateReads++;
            throw Error("UNUSED_CANDIDATE_READ");
          }
          return readCandidate(path, ...rest);
        });
        assert.equal(await adapter.validateCourse(observed, request), proof);
        assert.equal(candidateReads, 0);
      } finally {
        Deno.readTextFile = readCandidate;
      }
      await assert.rejects(
        () =>
          adapter.validateCourse(observed, {
            ...request,
            courseId: "scope-fixture",
          }),
        /PL.CAPTURE_CHANGED/,
      );
      assert.throws(() => adapter.business("index.qmd"));
      await Deno.writeTextFile(requestPath, originalCandidate);
      checks.push(
        "post-acquisition candidate drift: same-op exact request reuses proof with0 candidate reads; new request rereads/refuses and clears cache",
      );
      const copy = {
        ...op,
        assertCurrent: async () => {
          throw Error("STALE");
        },
      };
      await assert.rejects(
        () => adapter.validateCourse(copy, request),
        /STALE/,
      );
      assert.throws(() => adapter.business("index.qmd"));
      checks.push("different op/stale refusal clears cached business");
      console.log(JSON.stringify(
        {
          root,
          checks,
          metrics: op.metrics,
          validateReleaseCalls: validates,
          currentnessCalls: currents,
          cRemoved: {
            documentWalks: 0,
            answerWalks: 0,
            perDocumentChildren: 0,
            businessSidecars: 0,
          },
          source: "GENUINE_ORDINARY_NOT_ASSIGNMENT_P",
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
