import { dirname, join, relative, resolve } from "node:path";
import { verificationInventoryHash } from "./verification-inventory.ts";
import { gradingPolicy } from "./grading-policy.ts";
import { completionPolicy } from "./completion.ts";
import { normalizeDiscovery } from "./grading-descriptor.ts";
import * as validators from "./native-validators.js";
import { validateAssessmentSemantics } from "./native-semantics.ts";
import { exportPrairieLearn, uuid } from "./export.ts";
import { declarations, question } from "./declarations.ts";
import {
  canonical,
  hash,
  readSelected,
  safePath,
  selectedSources,
} from "./source-selection.ts";
export async function identity(
  name: string,
  namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
) {
  const ns = Uint8Array.from(
    namespace.replaceAll("-", "").match(/../g)!,
    (x) => parseInt(x, 16),
  );
  const bytes = new Uint8Array([...ns, ...new TextEncoder().encode(name)]);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes)).slice(
    0,
    16,
  );
  h[6] = (h[6] & 15) | 80;
  h[8] = (h[8] & 63) | 128;
  const hex = [...h].map((x) => x.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
async function absent(path: string) {
  try {
    await Deno.lstat(path);
    throw new Error("PL fresh output required: " + path);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
async function inventory(root: string) {
  const files: Record<string, string> = {};
  async function walk(dir: string) {
    for (
      const e of [...await Array.fromAsync(Deno.readDir(dir))].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    ) {
      const path = join(dir, e.name);
      if (e.isDirectory) await walk(path);
      else if (e.isFile) {
        files[relative(root, path).replaceAll("\\", "/")] = await hash(
          await Deno.readFile(path),
        );
      } else throw new Error("PL unexpected artifact");
    }
  }
  await walk(root);
  return files;
}
export async function exportCourse(
  input: {
    courseId: string;
    projectRoot: string;
    result: any;
    checks: any;
    config: any;
    registry: any;
    instance: string;
    output: string;
    checksOutput: string;
    body: (work: string) => Promise<any>;
    candidateImage?: string;
  },
) {
  const d = declarations(input.config, input.instance),
    out = resolve(input.output),
    privateOut = resolve(input.checksOutput);
  if (privateOut === out || privateOut.startsWith(out + "/")) {
    throw new Error("PL private checks output inside native delivery");
  }
  await absent(out);
  await absent(privateOut);
  const works = d.instance.works.map((id: string) => {
    const work = input.result.model.assessments.find((w: any) => w.id === id);
    if (!work) throw new Error("PL selected work missing: " + id);
    if (!work.extensions.prairielearn) {
      throw new Error("PL selected work requires policy");
    }
    return work;
  });
  const active = new Set();
  for (const w of works) {
    if (w.relatedExercise) {
      if (active.has(w.relatedExercise)) {
        throw new Error("PL duplicate active defense");
      }
      active.add(w.relatedExercise);
    }
  }
  for (const work of works) gradingPolicy(work);
  const stage = await Deno.makeTempDir({
      dir: dirname(out),
      prefix: ".pl-course-",
    }),
    scratch = await Deno.makeTempDir({ prefix: "pl-selected-" });
  const write = async (path: string, v: any) => {
    await Deno.mkdir(dirname(join(stage, path)), { recursive: true });
    const schema = path.endsWith("/info.json")
      ? "infoQuestion"
      : path.split("/").at(-1)?.replace(".json", "");
    const validate = (validators as any)[schema!];
    if (validate && !validate(v)) {
      throw new Error(
        "PL upstream schema " + path + ": " + JSON.stringify(validate.errors),
      );
    }
    if (schema === "infoAssessment") validateAssessmentSemantics(v, path);
    await Deno.writeTextFile(
      join(stage, path),
      JSON.stringify(v, null, 2) + "\n",
    );
  };
  try {
    const courseUuid = await identity("course/" + input.courseId);
    await write("infoCourse.json", {
      uuid: courseUuid,
      name: d.course.name,
      title: d.course.title,
      timezone: d.course.timezone,
      topics: d.course.topics,
    });
    await write(
      "courseInstances/" + input.instance + "/infoCourseInstance.json",
      {
        uuid: await identity("instance/" + input.instance, courseUuid),
        longName: d.instance.title,
        studentLabels: await Promise.all(
          [
            ...new Set(
              works.filter((w: any) => w.relatedExercise).map((w: any) =>
                w.extensions.prairielearn.assignment?.["student-label"]
              ),
            ),
          ].map(async (name: any) => {
            if (typeof name !== "string" || !name) {
              throw new Error("PL resolved assignment label required");
            }
            return {
              name,
              color: "blue2",
              uuid: await identity(
                "student-label/" + input.instance + "/" + name,
                courseUuid,
              ),
            };
          }),
        ),
        timezone: d.course.timezone,
        selfEnrollment: { enabled: d.instance["self-enrollment"] },
        publishing: {
          startDate: d.instance.publishing["start-date"],
          endDate: d.instance.publishing["end-date"],
        },
      },
    );
    const questions: Record<string, any> = {};
    for (let index = 0; index < works.length; index++) {
      const work = works[index],
        p = await input.body(work.id),
        binding: any = { questions: {} },
        projects: Record<string, string> = {};
      for (const q of p.questions) {
        const e = input.result.model.exercises.find((e: any) => e.id === q.id);
        if (e?.target !== "prairielearn") {
          throw new Error("PL selected member target mismatch");
        }
        const fact = input.checks.projects.find((p: any) =>
          p.exerciseId === q.id && p.bankMember
        );
        if (!fact?.check || fact.readiness?.ready === false) {
          throw new Error("PL selected_pl_without_check_rejected: " + q.id);
        }
        if (!safePath(fact.projectRoot)) {
          throw new Error("PL unsafe project root");
        }
        let root = input.projectRoot;
        for (const part of fact.projectRoot.split("/")) {
          root = join(root, part);
          if ((await Deno.lstat(root)).isSymlink) {
            throw new Error("PL project symlink forbidden");
          }
        }
        const sources = await selectedSources(root, fact);
        const profile = input.registry.profiles?.[fact.check.runtime];
        if (
          input.registry.schemaVersion !== 1 || !profile ||
          profile.mode !== fact.check.sourceProfile.mode
        ) throw new Error("PL runtime profile unavailable");
        const image = profile.image ?? input.candidateImage;
        if (
          !image ||
          !(profile.image
            ? /^.+@sha256:[a-f0-9]{64}$/.test(image)
            : /^sha256:[a-f0-9]{64}$/.test(image))
        ) {
          throw new Error(
            "PL production runtime pin unavailable: " + fact.check.runtime,
          );
        }
        const settings = e.extensions?.prairielearn?.topic
          ? question({
            topic: e.extensions.prairielearn.topic,
            ...(Object.hasOwn(e.extensions.prairielearn, "single-variant")
              ? {
                "single-variant": e.extensions.prairielearn["single-variant"],
              }
              : {}),
            submission: e.extensions.prairielearn.submission ??
              input.config["question-defaults"].submission,
          })
          : d.defaults;
        const project = join(scratch, q.id);
        await Deno.mkdir(join(project, "student"), { recursive: true });
        await Deno.mkdir(join(project, "tests"), { recursive: true });
        projects[q.id] = "/" + q.id;
        for (const s of sources) {
          await Deno.mkdir(dirname(join(project, "student", s.name)), {
            recursive: true,
          });
          await Deno.writeFile(join(project, "student", s.name), s.data);
        }
        if (!fact.trustedTests.length) {
          throw new Error("PL trusted tests missing");
        }
        const testNames = new Set();
        for (const test of fact.trustedTests) {
          if (
            testNames.has(test.submissionRelativePath) ||
            test.submissionRelativePath === "grading-job.json"
          ) throw new Error("PL duplicate or reserved trusted test path");
          testNames.add(test.submissionRelativePath);
          const bytes = await readSelected(root, test);
          await Deno.mkdir(
            dirname(join(project, "tests", test.submissionRelativePath)),
            { recursive: true },
          );
          await Deno.writeFile(
            join(project, "tests", test.submissionRelativePath),
            bytes,
          );
        }
        const c = fact.check;
        const descriptor = {
          schemaVersion: 1,
          sourceFiles: sources.map((s) => s.name),
          testFiles: fact.trustedTests.map((t: any) =>
            t.submissionRelativePath
          ),
          mode: c.sourceProfile.mode,
          runtime: c.runtime,
          java: {
            release: 25,
            encoding: "UTF-8",
            "compiler-options": ["-proc:none", "-Xmaxerrs", "5"],
            ...c.java,
          },
          limits: {
            "outer-seconds": 30,
            "compile-seconds": 15,
            "run-seconds": 10,
            "networking": false,
            "max-output-bytes": 65536,
            ...c.limits,
          },
          scoring: c.scoring ?? { mode: "weighted" },
          discovery: normalizeDiscovery(c.discovery),
          ...(c.variants ? { variants: c.variants } : {}),
        };
        await Deno.writeTextFile(
          join(project, "tests/grading-job.json"),
          JSON.stringify(descriptor, null, 2) + "\n",
        );
        binding.questions[q.id] = {
          ...settings,
          files: sources.map((s) => s.name),
          externalGradingOptions: {
            image,
            timeout: c.limits?.["outer-seconds"] ?? 30,
            enableNetworking: false,
          },
        };
        const key = input.courseId + "/" + q.id;
        questions[key] = {
          uuid: await uuid(key),
          projectCheck: c.profile,
          runtime: c.runtime,
          sources: fact.sources,
          sourceRoot: fact.projectRoot,
        };
      }
      const partial = join(scratch, "work-" + index);
      await exportPrairieLearn(
        p,
        { projectRoot: scratch, projects },
        binding,
        partial,
      );
      for (const q of p.questions) {
        const base = "questions/" + q.key;
        if (!await exists(join(stage, base))) {
          await Deno.rename(
            join(partial, base),
            await parent(join(stage, base)),
          );
        }
        const c = input.checks.projects.find((f: any) =>
          f.exerciseId === q.id
        ).check;
        const info = JSON.parse(
          await Deno.readTextFile(join(stage, base, "info.json")),
        );
        info.partialCredit = c.scoring.mode !== "all-pass";
        // Pinned Community validates assessment overrides against this embedded
        // question schema. A sidecar preferences.schema.json is not loaded.
        info.preferences = {
          courseRequirement: {
            type: "string",
            default: "required",
            enum: ["required", "optional"],
          },
        };
        await write(base + "/info.json", info);
        const f = input.checks.projects.find((f: any) => f.exerciseId === q.id);
        for (
          const s of await selectedSources(
            resolve(input.projectRoot, f.projectRoot),
            f,
          )
        ) {
          const path = join(stage, base, "serverFilesQuestion/starter", s.name);
          await Deno.mkdir(dirname(path), { recursive: true });
          await Deno.writeFile(path, s.data);
        }
      }
      const policy = work.extensions.prairielearn;
      const completion = completionPolicy(input.courseId, work);
      const grading = gradingPolicy(work);
      const assessmentType = ["test", "practical"].includes(work.kind)
        ? "Exam"
        : "Homework";
      await write(
        "courseInstances/" + input.instance + "/assessments/" + work.id +
          "/infoAssessment.json",
        {
          uuid: await identity("assessment/" + work.id, courseUuid),
          type: assessmentType,
          title: work.title,
          set: assessmentType,
          number: String(index + 1),
          ...grading.assessment,
          text:
            `Completion requires fully completing at least ${completion.atLeast} required questions. Partial scores and optional questions do not count toward completion.`,
          accessControl: work.relatedExercise
            ? [{
              beforeRelease: { listed: false },
              dateControl: {
                release: { date: "9999-12-31T00:00:00" },
                due: { date: null },
              },
            }, {
              uuid: await identity(
                "access/" + input.instance + "/" + work.id,
                courseUuid,
              ),
              labels: [policy.assignment["student-label"]],
              dateControl: {
                release: { date: "1970-01-01T00:00:00" },
                due: { date: null },
              },
            }]
            : [{
              dateControl: {
                release: { date: "1970-01-01T00:00:00" },
                due: { date: null },
              },
            }],
          zones: [{
            title: work.title,
            questions: work.items.map((id: string) => ({
              id: input.courseId + "/" + id,
              ...grading.questions[id],
              preferences: {
                courseRequirement: work.assignments[id].requirement,
              },
            })),
          }],
        },
      );
    }
    const files = await inventory(stage);
    const delivery: any = {
      schemaVersion: 1,
      courseId: input.courseId,
      bookRoot: input.checks.bookRoot,
      sourceSnapshotHash: input.checks.sourceSnapshotHash,
      inventoryHash: input.checks.inventoryHash,
      verificationInventoryHash: await verificationInventoryHash(
        input.checks,
        input.projectRoot,
        Object.keys(questions),
      ),
      questions: Object.keys(questions).sort(),
      gradingPayloads: questions,
      works: works.map((w: any) => ({
        id: w.id,
        items: w.items,
        assignments: w.assignments,
        policy: Object.fromEntries(
          Object.entries(w.extensions.prairielearn).filter(([key]) =>
            w.relatedExercise || key !== "assignment"
          ),
        ),
        completion: completionPolicy(input.courseId, w),
        ...(w.relatedExercise ? { relatedExercise: w.relatedExercise } : {}),
      })),
      instances: {
        [input.instance]: {
          works: d.instance.works,
          selfEnrollment: d.instance["self-enrollment"],
        },
      },
      files,
      ...(input.candidateImage ? { candidate: true } : {}),
    };
    delivery.deliveryHash = await hash(canonical(delivery));
    await write("delivery.json", delivery);
    await Deno.mkdir(dirname(privateOut), { recursive: true });
    const privateStage = await Deno.makeTempFile({
      dir: dirname(privateOut),
      prefix: ".pl-checks-",
    });
    try {
      await Deno.writeTextFile(
        privateStage,
        JSON.stringify(input.checks, null, 2) + "\n",
      );
      await Deno.rename(privateStage, privateOut);
      try {
        await Deno.rename(stage, out);
      } catch (e) {
        await Deno.remove(privateOut);
        throw e;
      }
    } finally {
      try {
        await Deno.remove(privateStage);
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
      }
    }
    return delivery;
  } catch (e) {
    await Deno.remove(stage, { recursive: true });
    throw e;
  } finally {
    await Deno.remove(scratch, { recursive: true });
  }
}
async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}
async function parent(path: string) {
  await Deno.mkdir(dirname(path), { recursive: true });
  return path;
}
