// Fixture compositor adapted from frozen Core b746 tests/early-layout-a4a.ts. No production resolver.
import { dirname, fromFileUrl, join, toFileUrl } from "stdlib/path";
const repo = dirname(dirname(fromFileUrl(import.meta.url))),
  E = dirname(dirname(repo));
const roots = {
  java: join(E, "c2b-java-accepted"),
  sp: join(E, "repos/system-practice-base"),
};
const exact = {
  java: "e7bb9de62e922efbb0aa0cd4fa84937aadd246a8",
  sp: "8c8622d7be5043f32a611717064bc642a346f1e0",
};
const coreSource = join(E, "c2b-core-accepted/_extensions/course-core");
const plSource = join(repo, "_extensions/course-prairielearn");
const stage = await Deno.makeTempDir({ prefix: "a4a-actual-layout-" }),
  checks: { name: string; passed: boolean }[] = [],
  rows: unknown[] = [];
async function put(path: string, text: string) {
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeTextFile(path, text);
}
async function command(cmd: string, args: string[], cwd: string) {
  const r = await new Deno.Command(cmd, {
    args,
    cwd,
    env: { DENO_NO_PACKAGE_JSON: "1", QUARTO_RUN_NO_NETWORK: "true" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!r.success) throw Error(cmd + " " + new TextDecoder().decode(r.stderr));
  return r.stdout;
}
async function archive(
  source: string,
  ref: string,
  path: string,
  destination: string,
) {
  const tar = await Deno.makeTempFile({ suffix: ".tar" });
  try {
    await command("git", [
      "archive",
      "--format=tar",
      "--output",
      tar,
      ref,
      path,
    ], source);
    await command("tar", ["-xf", tar, "-C", destination], destination);
  } finally {
    await Deno.remove(tar);
  }
}
function exercise(text: string, id: string) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) =>
    new RegExp("^:{3,}.*#" + id + "(?:\\s|})").test(l)
  );
  if (start < 0) throw Error("Missing authored " + id);
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const match = lines[i].match(/^(:{3,})(.*)$/);
    if (match) {
      if (match[2].trim()) depth++;
      else depth--;
      if (depth === 0) return lines.slice(start, i + 1).join("\n");
    }
  }
  throw Error("Unclosed " + id);
}
async function digest(s: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const coreSnapshot = join(stage, "input-core");
await command("cp", ["-R", coreSource, coreSnapshot], stage);
const plSnapshot = join(stage, "input-pl");
await command("cp", ["-R", plSource, plSnapshot], stage);
for (const family of ["java", "sp"] as const) {
  const outer = join(stage, family === "java" ? "Java" : "System-Practice"),
    owner = join(outer, "tasks");
  await Deno.mkdir(owner, { recursive: true });
  await put(
    join(outer, "_quarto.yml"),
    "project:\n  type: website\nformat:\n  html:\n    theme: none\nlang: ru\n",
  );
  const ext = join(owner, "_extensions/Afonenko-Course-Tools");
  await Deno.mkdir(ext, { recursive: true });
  await command("cp", ["-R", coreSnapshot, join(ext, "course-core")], owner);
  for (
    const [name, packageName] of [["download", "project-download"], [
      "qrc",
      "reference-catalog",
    ]]
  ) {
    await command("cp", [
      "-R",
      join(E, "c2b-" + name + "-accepted/_extensions", packageName),
      join(ext, packageName),
    ], owner);
  }
  await command(
    "cp",
    ["-R", plSnapshot, join(ext, "course-prairielearn")],
    owner,
  );
  await put(
    join(owner, "prepare-pl.ts"),
    `import * as Core from "./_extensions/Afonenko-Course-Tools/course-core/public.ts";import * as PL from "./_extensions/Afonenko-Course-Tools/course-prairielearn/public.ts";const profiles=(Deno.env.get('QUARTO_PROFILE')||'student').split(',');await PL.prepareNativeAdapter(Core,{root:Deno.cwd(),profiles,format:'html',projection:profiles.includes('full')?'author':'student',outputDirectory:Deno.cwd()+'/_output/'+(profiles.includes('full')?'full':'student')});`,
  );
  const installed = await import(
    toFileUrl(join(ext, "course-core/public.ts")).href
  );
  const pl = await import(
    toFileUrl(join(ext, "course-prairielearn/public.ts")).href
  );
  const qrc = await import(
    toFileUrl(join(ext, "reference-catalog/public.ts")).href
  );
  const download = await import(
    toFileUrl(join(ext, "project-download/public.ts")).href
  );
  const selected = family === "java"
    ? [
      {
        id: "exr-arrays-reverse-array",
        source: "bank/arrays.qmd",
        project: "projects/arrays/reverse-array",
        authored: "tasks/bank/arrays.qmd",
      },
      {
        id: "exr-objects-book-selection",
        source: "bank/objects.qmd",
        project: "projects/objects/book-selection",
        authored: "tasks/bank/objects.qmd",
      },
    ]
    : [
      {
        id: "exr-version-control-local-history",
        source: "labs/version-control.qmd",
        project: "projects/version-control/local-history",
        authored: "tasks/labs/version-control.qmd",
      },
      {
        id: "exr-version-control-restore-selected-state",
        source: "labs/version-control.qmd",
        project: "projects/version-control/restore-selected-state",
        authored: "tasks/labs/version-control.qmd",
      },
    ];
  if (family === "java") {
    await command("cp", [
      "-R",
      join(roots.java, "tasks/projects"),
      join(owner, "projects"),
    ], owner);
  } else {for (const item of selected) {
      const temp = await Deno.makeTempDir();
      await archive(roots.sp, exact.sp, "tasks/" + item.project, temp);
      await Deno.mkdir(dirname(join(owner, item.project)), { recursive: true });
      await command("cp", [
        "-R",
        join(temp, "tasks", item.project),
        join(owner, item.project),
      ], owner);
      await Deno.remove(temp, { recursive: true });
      await put(
        join(owner, item.project, "_metadata.yml"),
        "course-project:\n  starter: {path: student}\n  instructions:\n    local: {path: student/README.md}\n",
      );
    }}
  const sources = new Map<string, string>();
  for (const item of selected) {
    const raw = family === "java"
      ? await Deno.readTextFile(join(roots.java, item.authored))
      : new TextDecoder().decode(
        await command(
          "git",
          ["show", exact.sp + ":" + item.authored],
          roots.sp,
        ),
      );
    const chapterHeading = raw.split("\n").find((line) => /^# /.test(line));
    if (!chapterHeading) {
      throw Error("Missing actual chapter heading " + item.authored);
    }
    if (!sources.has(item.source)) {
      sources.set(item.source, chapterHeading + "\n\n");
    }
    const selectedText = exercise(raw, item.id);
    let effective = selectedText;
    let replacement = false;
    if (
      item.id === "exr-objects-book-selection" &&
      !effective.includes(
        "../projects/objects/book-selection/starter/src/main/java/Book.java",
      )
    ) throw Error("D1 approved Book URL missing");
    sources.set(
      item.source,
      (sources.get(item.source) ?? "") + effective + "\n\n",
    );
    rows.push({
      family,
      id: item.id,
      sourceRef: exact[family],
      source: item.authored,
      fragmentSHA256: await digest(selectedText),
      effectiveSHA256: await digest(effective),
      singleUrlReplacement: replacement,
      chapterHeadingSHA256: await digest(chapterHeading),
    });
  }
  for (const [path, text] of sources) await put(join(owner, path), text);
  await put(join(owner, "index.qmd"), "# Ранний native slice\n");
  const inputs = ["index.qmd", ...sources.keys()];
  await put(
    join(owner, "_quarto.yml"),
    `project:\n  type: book\n  output-dir: _output\n  pre-render: [quarto run _extensions/Afonenko-Course-Tools/course-core/entrypoints/native-pre.ts, quarto run prepare-pl.ts]\n  post-render: [quarto run _extensions/Afonenko-Course-Tools/course-core/entrypoints/native-post.ts]\nprofile:\n  default: student\n  group: [[student,full]]\nbook:\n  title: Ранний slice\n  chapters: ${
      JSON.stringify(inputs)
    }\nformat:\n  html:\n    theme: none\ncourse-core-runtime: native-ts\nexercise-bank: true\ndefault-exercise-statement-visibility: open\ncourse: {id: ${
      family === "java" ? "java-semester-one" : "system-practice"
    }, adapters: [prairielearn]}\nproject-download: {course-model: true}\nreference-catalog: {namespace: ${
      family === "java" ? "java-tasks" : "system-practice-tasks"
    }}\nfilters: [{at: pre-ast, path: _extensions/Afonenko-Course-Tools/course-prairielearn/native-ts/raw-capture.lua},course-core,project-download,reference-catalog]\n`,
  );
  // Явный disposable overlay только carrier/hooks. Исходный snapshot не изменяется.
  const originalConfig = await command("python3", [
    "-c",
    "import yaml,json,sys;d=yaml.safe_load(open(sys.argv[1]));print(json.dumps({k:d[k]for k in ['prairielearn','project-checks']if k in d},ensure_ascii=False))",
    join(roots[family], "tasks/_quarto.yml"),
  ], owner);
  const rawConfig = JSON.parse(new TextDecoder().decode(originalConfig));
  if (family === "sp") {
    rawConfig.prairielearn["question-defaults"].submission = {
      mode: "workspace",
      workspaceOptions: {
        image: "example.invalid/fixture-only@sha256:" + "0".repeat(64),
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
    };
    rawConfig["project-materialization"] = {
      projects: {
        "exr-version-control-restore-selected-state": {
          "common-files": [],
          "include-git": true,
        },
      },
    };
  }
  await Deno.writeTextFile(
    join(owner, "_quarto.yml"),
    await Deno.readTextFile(join(owner, "_quarto.yml")) + "\n" +
      Object.entries(rawConfig).map(([k, v]) => k + ": " + JSON.stringify(v))
        .join("\n") +
      "\n",
  );
  for (const profile of ["student", "full"]) {
    await put(
      join(owner, "_quarto-" + profile + ".yml"),
      `project:\n  output-dir: _output/${profile}\ncourse:\n  view: ${profile}\n`,
    );
  }
  let firstSourceHashes: number | undefined;
  for (const profile of ["student", "full"] as const) {
    const began = performance.now();
    const render = new Deno.Command("quarto", {
      args: ["render", "--profile", profile, "--to", "html"],
      cwd: owner,
      env: {
        DENO_NO_PACKAGE_JSON: "1",
        QUARTO_RUN_NO_NETWORK: "true",
        CUE: "/no-a4a-cue",
      },
      stdout: "piped",
      stderr: "piped",
    });
    const result = await render.output();
    const log = new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr);
    await put(join(owner, "_generated/qualification-" + profile + ".log"), log);
    if (!result.success) {
      throw Error(
        "Actual " + family + "/" + profile + ": " + owner +
          "/_generated/qualification-" + profile + ".log\n" + log,
      );
    }
    const projection = profile === "student" ? "student" : "author";
    await installed.withCurrentNativeOperation({
      root: owner,
      profiles: [profile],
      format: "html",
      projection,
      outputDirectory: join(owner, "_output", profile),
    }, async (op) => {
      checks.push({
        name: family + "/" + profile + "/profile-projection",
        passed: op.identity.projection === projection &&
          op.identity.profiles.join(",") === profile &&
          op.catalog.documents.length === inputs.length,
      });
      const adapter = pl.createNativeAdapter({ root: owner, core: installed });
      const proof = await op.validateRelease({ expectedSources: inputs }, [
        adapter,
      ]);
      checks.push({
        name: family + "/" + profile + "/real-PL-owner-validator",
        passed: proof.validatedAdapters.includes("prairielearn"),
      });
      await installed.readProjectContexts([{
        owner,
        inputs: selected.map((i) => i.project + "/native-input.qmd"),
        profiles: [profile],
        format: "html",
      }], async ([group]) => {
        for (const [itemIndex, item] of selected.entries()) {
          const condition = op.condition({
            source: item.source,
            exerciseId: item.id,
            view: projection,
          });
          const plan = await installed.planProject(group.contexts[itemIndex], {
            audience: profile === "student" ? "student" : "full",
          });
          const closure = await installed.materializationClosure(
            plan,
            condition,
          );
          const linksBySource: Record<string, Record<string, string>> = {};
          for (const fragment of closure.fragments) {
            const references = Object.fromEntries(
              fragment.references.map(
                (r) => [r.token, { key: r.key, style: r.style }],
              ),
            );
            const targets = Object.fromEntries(fragment.references.map((r) => {
              const [namespace, id] = r.key.split(":");
              return [r.key, {
                namespace,
                id,
                page: namespace + "/index.html",
                fragment: id,
                label: id,
                labelHtml: id,
                number: "",
                numberHtml: "",
                baseUrl: "https://example.invalid/",
              }];
            }));
            const urls = Object.fromEntries(
              fragment.links.filter((l) => l.includes("_downloads/")).map(
                (l) => [
                  l,
                  "https://example.invalid/" + family + "/tasks/_downloads/" +
                  l.split("/").pop(),
                ],
              ),
            );
            linksBySource[fragment.source] = qrc.bindConditionLinks({
              context: { input: fragment.source },
              links: fragment.links.filter((l) =>
                !fragment.resources.includes(l)
              ),
            }, {
              catalog: {
                schema: "quarto-reference-catalog",
                generator: { quarto: "1.11.5" },
                targets: {},
              },
              importedTargets: Object.values(targets),
              baseUrl: "https://example.invalid/" + family + "/tasks/",
              references,
              urls,
            });
          }
          const binding = {
            linksBySource,
            submission: pl.describeSubmission(
              adapter.business(item.source).questions[item.id].submission,
              family === "java"
                ? (item.id.includes("reverse-array")
                  ? [{
                    name: "Main.java",
                    starterPath: "src/main/java/Main.java",
                  }]
                  : [{
                    name: "Book.java",
                    starterPath: "src/main/java/Book.java",
                  }])
                : [],
            ),
          };
          const inventory = await installed.materializeProject(
            plan,
            condition,
            binding,
          );
          const conditionOnly = await installed.materializeCondition(
            plan,
            condition,
            binding,
          );
          if (family === "java" && profile === "student") {
            const fullPlan = await installed.planProject(
              group.contexts[itemIndex],
              { audience: "full" },
            );
            const fullInventory = await installed.materializeProject(
              fullPlan,
              condition,
              binding,
            );
            const raw = adapter.business(item.source).raw;
            const checkName = raw.declarations.find((d: any) =>
              d.id === item.id
            ).attributes["project-check"];
            const baseline = pl.decodeNativeCheck(raw.projectChecks, checkName);
            const runtimeProfile = { mode: "implementation", javaRelease: 25 };
            let error = "";
            try {
              await pl.selectNativeCompilerInputs({
                core: installed,
                check: baseline,
                runtimeProfile,
                studentPlan: plan,
                fullPlan,
                student: inventory,
                full: fullInventory,
              });
            } catch (e) {
              error = String(e);
            }
            checks.push({
              name: item.id +
                "/legacy-check-targets-explicit-migration-refusal",
              passed: error.includes("PL.SELECTION_MIGRATION_REQUIRED"),
            });
            const references = fullPlan.groups.map((name: string) => ({
              name,
              root: "author/" + name + "/src/main/java",
              optional: false,
            }));
            // Только disposable mechanical proposal. Root owns actual config migration.
            const check = {
              ...baseline,
              "source-profile": "java-gradle",
              sourceProfile: {
                mode: "implementation",
                root: "src/main/java",
                include: ["**/*.java"],
              },
              tests: ["src/api/java/**/*.java", "src/test/java/**/*.java"],
              references,
              "api-precheck": {
                files: ["src/api/java/**/*.java"],
                entry: "ApiContract",
              },
            };
            const selected = await pl.selectNativeCompilerInputs({
              core: installed,
              check,
              runtimeProfile,
              studentPlan: plan,
              fullPlan,
              student: inventory,
              full: fullInventory,
            });
            checks.push({
              name: item.id + "/typed-plan-explicit-compiler-selection",
              passed: selected.sources.length === 1 &&
                selected.tests.length ===
                  (item.id.includes("reverse-array") ? 4 : 3) &&
                selected.references.length === fullPlan.groups.length &&
                selected.descriptor.apiPrecheck.entry === "ApiContract",
            });
            let foreign = "";
            try {
              await pl.selectNativeCompilerInputs({
                core: installed,
                check: { ...check, tests: ["src/main/java/**/*.java"] },
                runtimeProfile,
                studentPlan: plan,
                fullPlan,
                student: inventory,
                full: fullInventory,
              });
            } catch (e) {
              foreign = String(e);
            }
            checks.push({
              name: item.id + "/student-code-not-trusted-tests",
              passed: foreign.includes("PL.SELECTION_INVALID"),
            });
            let apiWhole = "";
            try {
              await pl.selectNativeCompilerInputs({
                core: installed,
                check: {
                  ...check,
                  "api-precheck": { files: check.tests, entry: "ApiContract" },
                },
                runtimeProfile,
                studentPlan: plan,
                fullPlan,
                student: inventory,
                full: fullInventory,
              });
            } catch (e) {
              apiWhole = String(e);
            }
            checks.push({
              name: item.id + "/whole-test-set-not-api-subset",
              passed: apiWhole.includes("proper trusted subset"),
            });
            rows.push({
              family,
              id: item.id,
              phase: "proposed-root-check-migration-not-installed",
              checkName,
              oldCheck: baseline,
              newCheck: check,
              selected: {
                sources: selected.sources.map(({ bytes, ...f }: any) => f),
                tests: selected.tests.map(({ bytes, ...f }: any) => f),
                references: selected.references.map((r: any) => ({
                  name: r.name,
                  files: r.files.map(({ bytes, ...f }: any) => f),
                })),
                descriptor: selected.descriptor,
                provenance: selected.provenance,
              },
              comparison:
                "exact actual A1 targets/roles/hash; D1 staged37 outcomes remain separate",
            });
          }
          let workspaceArtifact: any;
          if (
            family === "sp" && profile === "student" &&
            item.id.includes("restore-selected-state")
          ) {
            workspaceArtifact = await adapter.workspaceArtifact({
              operation: op,
              expectedSources: inputs,
              source: item.source,
              exerciseId: item.id,
              inventory,
              zip: download.zip,
            });
            checks.push({
              name: "native-Workspace-actual-recipe-A",
              passed: workspaceArtifact.initial ===
                  "2f12c0ccccc3c10c483502559fa7efee33a52607" &&
                workspaceArtifact.files.some((f: any) =>
                  f.name === "work/.git/index"
                ),
            });
          }
          const zip = workspaceArtifact?.archive ??
            await download.packageArtifact(inventory);
          const destination = await Deno.makeTempDir({
              prefix: "a4a-extracted-",
            }),
            archive = join(destination, "starter.zip");
          await Deno.writeFile(archive, zip);
          await command("unzip", [
            "-q",
            archive,
            "-d",
            join(destination, "fresh-root"),
          ], destination);
          const readme = new TextDecoder().decode(
            inventory.files.find((f) => f.target === "README.md")!.bytes,
          );
          checks.push({
            name: family + "/" + profile + "/" + item.id +
              "/real-PL-submission-summary",
            passed: readme.replace(/\s+/g, " ").includes(
              binding.submission.instructions.replace(/\s+/g, " "),
            ),
          });
          checks.push({
            name: family + "/" + profile + "/" + item.id + "/materialized",
            passed: inventory.files.length > 1 && readme.length > 500 &&
              conditionOnly.files.every((f) =>
                f.target === "README.md" || f.reason === "condition-resource"
              ),
          });
          checks.push({
            name: family + "/" + profile + "/" + item.id + "/no-raw-transport",
            passed: !readme.includes("qrc-unresolved") &&
              !readme.includes("data-course-core-occurrence") &&
              !readme.includes("project-download-request"),
          });
          if (family === "java") {
            checks.push({
              name: family + "/" + profile + "/" + item.id +
                "/actual-build-checks",
              passed: inventory.files.some((f) =>
                f.target === "build.gradle"
              ) && inventory.files.some((f) =>
                f.target === "settings.gradle"
              ) && inventory.files.some((f) =>
                f.target.includes("ApiCheck") ||
                f.target.includes("ApiPrecheck")
              ) && inventory.files.some((f) =>
                f.target.startsWith("src/test/")
              ),
            });
          } else {checks.push({
              name: family + "/" + profile + "/" + item.id + "/nongradle",
              passed: !inventory.files.some((f) =>
                f.target.includes("gradle")
              ) && readme.includes(
                item.id.includes("restore-selected")
                  ? "Workspace"
                  : "PowerShell",
              ),
            });}
          rows.push({
            family,
            profile,
            id: item.id,
            files: inventory.files.map((f) => ({
              target: f.target,
              size: f.size,
              sha256: f.sha256,
              audience: f.audience,
            })),
            conditionFiles: conditionOnly.files.map((f) => f.target),
            zipBytes: zip.length,
            projectMetrics: installed.projectPlanMetrics(plan),
            contextMetrics: group.metrics,
            actualDestination: join(destination, "fresh-root"),
            workspaceSeedGenerated: Boolean(workspaceArtifact),
          });
        }
      });
      checks.push({
        name: family + "/" + profile + "/other-profile-output-not-input",
        passed: firstSourceHashes === undefined ||
          op.metrics.sourceHashReads === firstSourceHashes,
      });
      firstSourceHashes = op.metrics.sourceHashReads;
      rows.push({
        family,
        profile,
        operationMetrics: op.metrics,
        wallMs: performance.now() - began,
      });
    });
  }
}
console.log(
  JSON.stringify({
    status: checks.every((c) => c.passed) ? "PASS" : "FAIL",
    stage,
    checks,
    rows,
  }),
);
if (checks.some((c) => !c.passed)) throw Error("A4a actual early layout");
