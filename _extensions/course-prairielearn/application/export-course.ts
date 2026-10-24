import {loadPublicationConditions} from './publication-conditions.ts';
import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-prairielearn");
import { qualifiedSlots, nativeSlotZones } from "./slots.ts";
import { dirname, join, relative, resolve } from "node:path";
import { verificationInventoryHash } from "./verification-inventory.ts";
import { gradingPolicy,validateGradingComponents } from "./grading-policy.ts";
import { completionPolicy } from "./completion.ts";
import { runtimeDescriptor } from "./runtime-descriptor.ts";
import * as validators from "./native-validators.js";
import { validateAssessmentSemantics } from "./native-semantics.ts";
import { exportPrairieLearn, renderPublicBody, uuid, publicProjectFiles } from "./export.ts";
import { declarations, question, gradingMethod } from "./declarations.ts";
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
    publicationConditions?: string;
    publicationSource?: {repository:string;commit:string;book:string};
    studentArtifact?:(fact:any)=>Promise<{files:{name:string;bytes:Uint8Array}[];archive:Uint8Array}>;
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
  const menuBodies = new Map<string, any>();
  const unitMenus = new Map<string, any[]>();
  for (const work of works) {
    if (!work.id.startsWith("sec-unit-")) continue;
    const expected = "exr-" + work.id.slice("sec-unit-".length);
    const slot = work.slots?.[0];
    if (work.slots?.length !== 1 || slot?.selection !== "fixed" ||
        slot.id !== expected || slot.candidates?.length !== 1 ||
        slot.candidates[0] !== expected || slot.assignment?.requirement !== "required") {
      throw Error("PL reference-only unit не соответствует единственной задаче: " + work.id);
    }
    const menus = input.result.model.assessments.filter((menu: any) =>
      menu.id !== work.id && menu.slots.some((member: any) =>
        member.assignment.requirement === "optional" && member.candidates.includes(expected)));
    if (new Set(menus.map((menu: any) => menu.id)).size !== menus.length) {
      throw Error("PL неоднозначный источник контекста меню: " + work.id);
    }
    unitMenus.set(work.id, menus);
  }
  const active = new Set();
  for (const w of works) {
    if (w.relatedExercise) {
      if (active.has(w.relatedExercise)) {
        throw new Error("PL duplicate active defense");
      }
      active.add(w.relatedExercise);
    }
  }
  const methods:Record<string,'external'|'manual'|'mixed'>={};
  for(const exercise of input.result.model.exercises)methods[exercise.id]=gradingMethod(exercise.extensions?.prairielearn?.grading??input.config['question-defaults'].grading).method;
  for (const work of works) validateGradingComponents(work,methods);
  const selectedIds=input.publicationConditions?new Set(works.flatMap((w:any)=>[...(w.slots??[]).flatMap((slot:any)=>slot.candidates),...(w.relatedExercise?[w.relatedExercise]:[])])):undefined;
  const publicationConditions=input.publicationConditions?await loadPublicationConditions(input.publicationConditions,{courseId:input.courseId,projectRoot:input.projectRoot,source:input.publicationSource!,exercises:input.result.model.exercises.filter((e:any)=>selectedIds!.has(e.id))}):undefined;
  const stage = await Deno.makeTempDir({
      dir: dirname(out),
      prefix: ".pl-course-",
    }),
    scratch = await Deno.makeTempDir({ dir: dirname(out), prefix: ".pl-selected-" });
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
    const questionSnapshots = new Map<string, string>();
    for (let index = 0; index < works.length; index++) {
      const work = works[index],
        p = await input.body(work.id),
        binding: any = { questions: {} },
        projects: Record<string, string> = {},
        studentArtifacts:Record<string,{files:{name:string;bytes:Uint8Array}[];archive:Uint8Array}>={};
      const contexts = [{work, body: p, menu: false}];
      for (const menu of unitMenus.get(work.id) ?? []) {
        if (!menuBodies.has(menu.id)) menuBodies.set(menu.id, await input.body(menu.id));
        contexts.push({work: menu, body: menuBodies.get(menu.id), menu: true});
      }
      const overviewParts: string[] = [];
      for (const context of contexts) {
        const publicWork = context.body.works?.[0];
        if (!publicWork || publicWork.key !== input.courseId + "/" + context.work.id ||
            context.body.owner !== input.courseId ||
            context.body.schema !== "course-body-package-v2" ||
            !Array.isArray(context.body.resources) ||
            context.menu && (publicWork.source !== context.work.source ||
              !Array.isArray(publicWork.introduction)) ||
            publicWork.introduction !== undefined && !Array.isArray(publicWork.introduction)) {
          throw new Error("PL публичное введение не соответствует работе: " + context.work.id);
        }
        if ((context.menu || unitMenus.has(context.work.id)) &&
            canonical(publicWork.slots) !== canonical(qualifiedSlots(input.courseId, context.work))) {
          throw Error("PL публичный состав не соответствует source unit/menu: " + context.work.id);
        }
        // Only the independent public projection; never raw menu.body/full AST.
        const rendered = await renderPublicBody(context.body, publicWork.introduction ?? [], publicWork.key,
          {source: publicWork.source, id: context.work.id, field: "introduction"},
          "clientFilesCourse", "{{ client_files_course }}");
        overviewParts.push(rendered.html);
        for (const file of rendered.files) {
          const target = join(stage, file.name);
          await Deno.mkdir(dirname(target), {recursive: true});
          try {
            if (await hash(await Deno.readFile(target)) !== await hash(file.data)) {
              throw new Error("PL конфликт публичного ресурса обзора: " + file.name);
            }
          } catch (e) {
            if (!(e instanceof Deno.errors.NotFound)) throw e;
            await Deno.writeFile(target, file.data);
          }
        }
      }
      const overview = {html: overviewParts.join("\n")};
      for (const q of p.questions) {
        const e = input.result.model.exercises.find((e: any) => e.id === q.id);
        if (e?.target !== "prairielearn") {
          throw new Error("PL selected member target mismatch");
        }
        const settings=question({topic:e.extensions?.prairielearn?.topic??d.defaults.topic,submission:e.extensions?.prairielearn?.submission??input.config['question-defaults'].submission,
          ...(e.extensions?.prairielearn?.grading!==undefined?{grading:e.extensions.prairielearn.grading}:input.config['question-defaults'].grading?{grading:input.config['question-defaults'].grading}:{}),
          ...(Object.hasOwn(e.extensions?.prairielearn??{},'single-variant')?{'single-variant':e.extensions.prairielearn['single-variant']}:Object.hasOwn(input.config['question-defaults'],'single-variant')?{'single-variant':input.config['question-defaults']['single-variant']}:{}),
        });
        const method=gradingMethod(settings.grading).method;
        if(input.studentArtifact){
          const fact=input.result.model.projects?.find((f:any)=>f.exerciseId===q.id&&f.bankMember);
          if(!fact)throw Error('PL student artifact project fact missing');
          studentArtifacts[q.id]=await input.studentArtifact(fact);
        }
        if(method==='manual'){
          const fact=input.result.model.projects?.find((f:any)=>f.exerciseId===q.id&&f.bankMember);
          if(!fact||fact.check||!safePath(fact.projectRoot))throw Error('PL.MANUAL_INVALID: manual требует project без project-check');
          let actual=input.projectRoot;
          for(const part of fact.projectRoot.split('/')){actual=join(actual,part);if((await Deno.lstat(actual)).isSymlink)throw Error('PL manual project symlink forbidden')}
          const files=studentArtifacts[q.id]?studentArtifacts[q.id].files.map(f=>({name:f.name,data:f.bytes})):await publicProjectFiles(join(actual,'student'));
          if(!files.length)throw Error('PL manual student files missing');
          const project=join(scratch,q.id);projects[q.id]='/'+q.id;
          for(const file of files){const path=join(project,'student',file.name);await Deno.mkdir(dirname(path),{recursive:true});await Deno.writeFile(path,file.data)}
          binding.questions[q.id]={...settings,files:[]};
          questions[input.courseId+'/'+q.id]={uuid:await uuid(input.courseId+'/'+q.id),grading:{method:'manual'},submission:{...settings.submission},sourceRoot:fact.projectRoot};
          continue;
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
        const profile = input.registry.profiles?.[fact.check.runtime];
        const sources = await selectedSources(root, fact, profile);
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
        const descriptor = runtimeDescriptor(c, profile,
          sources.map(s => s.name), fact.trustedTests.map((t: any) => t.submissionRelativePath), fact.apiPrecheck);
        await Deno.writeTextFile(
          join(project, "tests/grading-job.json"),
          JSON.stringify(descriptor, null, 2) + "\n",
        );
        binding.questions[q.id] = {
          ...settings,
          files: sources.map((s) => s.name),
          ...(descriptor.additionalJavaSources?{additionalJavaSources:descriptor.additionalJavaSources}:{}),
          externalGradingOptions: {
            image,
            timeout: c.limits?.["outer-seconds"] ?? 30,
            enableNetworking: false,
          },
        };
        const key = input.courseId + "/" + q.id;
        questions[key] = {
          uuid: await uuid(key),
          grading:{method},submission:{...settings.submission},
          projectCheck: c.profile,
          runtime: c.runtime,
          sources: fact.sources,
          sourceRoot: fact.projectRoot,
        };
      }
      const partial = join(scratch, "work-" + index);
      await exportPrairieLearn(
        p,
        { projectRoot: scratch, projects,studentArtifacts,publicationConditions:publicationConditions?Object.fromEntries(publicationConditions.artifacts):undefined },
        binding,
        partial,
      );
      for (const q of p.questions) {
        const base = "questions/" + q.key;
        const c = input.checks.projects.find((f: any) =>
          f.exerciseId === q.id
        )?.check;
        const info = JSON.parse(
          await Deno.readTextFile(join(partial, base, "info.json")),
        );
        info.partialCredit = c?c.scoring.mode !== "all-pass":false;
        // Pinned Community validates assessment overrides against this embedded
        // question schema. A sidecar preferences.schema.json is not loaded.
        info.preferences = {
          courseRequirement: {
            type: "string",
            default: "required",
            enum: ["required", "optional"],
          },
        };
        await Deno.writeTextFile(join(partial, base, "info.json"), JSON.stringify(info, null, 2) + "\n");
        const f = input.checks.projects.find((f: any) => f.exerciseId === q.id);
        if (f?.check) {
        for (
          const s of await selectedSources(
            resolve(input.projectRoot, f.projectRoot),
            f,
            input.registry.profiles[f.check.runtime],
          )
        ) {
          const path = join(partial, base, "serverFilesQuestion/starter", s.name);
          await Deno.mkdir(dirname(path), { recursive: true });
          await Deno.writeFile(path, s.data);
        }
        }
        const nativeFiles = await inventory(join(partial, base));
        const resourceBindings = [...new Map<string, any>(p.resources
          .filter((resource: any) => Object.hasOwn(nativeFiles, "clientFilesQuestion/" + resource.target))
          .map((resource: any) => [resource.target, resource] as [string, any])).values()]
          .sort((left: any, right: any) => left.target.localeCompare(right.target));
        const snapshot = canonical({question: q, binding: binding.questions[q.id],
          grading: questions[q.key], resourceBindings});
        if (await exists(join(stage, base))) {
          if (questionSnapshots.get(q.key) !== snapshot ||
              canonical(await inventory(join(stage, base))) !== canonical(nativeFiles)) {
            throw Error("PL конфликт повторного вопроса: " + q.key);
          }
        } else {
          questionSnapshots.set(q.key, snapshot);
          await Deno.rename(join(partial, base), await parent(join(stage, base)));
        }
        await write(base + "/info.json", info);

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
            overview.html + `<p>Выполните не менее ${completion.atLeast} обязательных позиций полностью. Частичный результат и необязательные позиции не заменяют обязательные.</p>`,
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
          zones: nativeSlotZones(input.courseId,work,grading),
        },
      );
    }
    if(publicationConditions)await publicationConditions.check();
    const files = await inventory(stage);
    const delivery: any = {
      schemaVersion: 3,
      courseId: input.courseId,
      bookRoot: input.checks.bookRoot,
      sourceSnapshotHash: input.checks.sourceSnapshotHash,
      inventoryHash: input.checks.inventoryHash,
      verificationInventoryHash: await verificationInventoryHash(
        input.checks,
        input.projectRoot,
        Object.keys(questions).filter(key=>questions[key].grading?.method!=='manual'),
      ),
      questions: Object.keys(questions).sort(),
      gradingPayloads: questions,
      works: works.map((w: any) => ({
        id: w.id,
        slots: qualifiedSlots(input.courseId,w),
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
    if(publicationConditions)console.log('PL publication conditions dependency '+JSON.stringify(publicationConditions.provenance));
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
        if(publicationConditions)await publicationConditions.check();
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

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
identity=__metrics.wrapAsync({id:"course-prairielearn.application.export-course.identity",kind:"phase"},identity);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
exportCourse=__metrics.wrapAsync({id:"course-prairielearn.application.export-course.exportCourse",kind:"phase"},exportCourse);
