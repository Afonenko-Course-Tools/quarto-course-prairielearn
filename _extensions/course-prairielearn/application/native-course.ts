import type * as CorePublic from "course-core/public.ts";
import type {
  AnswerFacts,
  NativeResponseSlot,
  NativeAssignmentProjectPlans,
  NativeOperationProjectContextBatch,
  NativeOperationProjectContextMetrics,
  NativePreparedOperation,
} from "course-core/public.ts";
import type {
  NativeAssignmentDeliveryOptions,
  NativeOperation,
} from "course-core/public.ts";
import type { PublicBodyPackage } from "course-core/public.ts";
import { captureNativeAuxiliary } from "./native-auxiliary.ts";
import { dirname, join, resolve } from "node:path";
import { createNativeAdapter } from "./native-adapter.ts";
import { nativeProjectRows } from "./native-provenance.ts";
import type { NativeEntryOptions } from "./native-entry.ts";
import { canonical } from "./source-selection.ts";
import { decodeNativeCheck } from "./native-checks.ts";
import { validateNativeRaw } from "./native-business.ts";
import { nativeChecksManifest } from "./native-check-inventory.ts";
import { type ExportCourseContent, exportCourse, nativeUnitMenus } from "./export-course.ts";
import { exportPrairieLearn } from "./export.ts";
import {
  checkedJSON,
  materializeNativeQuestion,
  nativeReferenceBindings,
  publicExtension,
} from "./native-materialize.ts";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
type RuntimeRegistry = Parameters<typeof exportCourse>[0]["registry"];
function decodeRuntimeRegistry(value: unknown): RuntimeRegistry {
  if (!record(value) || typeof value.schemaVersion !== "number" || ![1,2].includes(value.schemaVersion) || value.profiles !== undefined && !record(value.profiles)) throw Error("PL.RUNTIME_INVALID: registry version/profiles");
  const profiles: NonNullable<RuntimeRegistry["profiles"]> = {};
  for (const [name, profile] of Object.entries(value.profiles ?? {})) {
    if (!record(profile) || profile.mode !== undefined && typeof profile.mode !== "string" || profile.javaRelease !== undefined && (typeof profile.javaRelease !== "number" || !Number.isInteger(profile.javaRelease)) || profile.sourceExtensions !== undefined && (!Array.isArray(profile.sourceExtensions) || !profile.sourceExtensions.every((x: unknown) => typeof x === "string")) || profile.image !== undefined && typeof profile.image !== "string") throw Error("PL.RUNTIME_INVALID: profile " + name);
    profiles[name] = {...(typeof profile.mode === "string" ? {mode:profile.mode} : {}), ...(typeof profile.javaRelease === "number" ? {javaRelease:profile.javaRelease} : {}), ...(Array.isArray(profile.sourceExtensions) && profile.sourceExtensions.every((x: unknown) => typeof x === "string") ? {sourceExtensions:profile.sourceExtensions} : {}), ...(typeof profile.image === "string" ? {image:profile.image} : {})};
  }
  return {schemaVersion:value.schemaVersion, profiles};
}
type NativeAdapter = ReturnType<typeof createNativeAdapter>;
type NativeDelivered = Awaited<ReturnType<NativeAdapter["assignmentDelivery"]>>;
export type NativeProjectPlansResult<T> = {
  value: T;
  projectContextMetrics: Readonly<{
    inside: NativeOperationProjectContextMetrics;
    final: NativeOperationProjectContextMetrics;
  }>;
};
/** Один genuine operation batch держит все actual formats/планы до выдачи.
 * Metrics читаются после await, когда закрывающий A1 fence уже выполнен. */
export async function withNativeProjectPlans<T>(
  Core: typeof CorePublic,
  root: string,
  profiles: string[],
  projectRows: ReturnType<typeof nativeProjectRows>,
  use: (
    plans: NativeAssignmentProjectPlans[],
    checkpoint: () => Promise<void>,
  ) => Promise<T>,
  operation: NativeOperation,
): Promise<NativeProjectPlansResult<T>> {
  const formats = [
    ...new Set(projectRows.map((p) => p.format)),
  ];
  const requests = formats.map((format) => ({
    owner: root,
    profiles,
    format,
    directories: [
      ...new Set(
        projectRows.filter((p) => p.format === format).map((p) =>
          p.fact.projectRoot
        ),
      ),
    ],
  }));
  let retained: NativeOperationProjectContextBatch | undefined,
    inside: NativeOperationProjectContextMetrics | undefined;
  const metrics = () => {
    const snapshot = retained?.metrics;
    if (
      !snapshot || typeof snapshot.yamlFileReads !== "number" ||
      typeof snapshot.directoryLayers !== "number" ||
      typeof snapshot.sourceBytesRead !== "number"
    ) {
      throw Error(
        "PL.NATIVE_METRICS_UNAVAILABLE: project loader observations required",
      );
    }
    return snapshot;
  };
  const useBatch = async (
    batch: NativeOperationProjectContextBatch,
  ): Promise<T> => {
    retained = batch;
    // Capability захватывается только этой callback; старый Core всегда full.
    const checkpoint = () => operation.assertCurrent();
    if (batch.groups.length !== requests.length) {
      throw Error(
        "PL.PROVENANCE_CHANGED: A1 group coverage",
      );
    }
    const plans: NativeAssignmentProjectPlans[] = [];
    for (let index = 0; index < requests.length; index++) {
      const request = requests[index], group = batch.groups[index];
      if (!request || !group) throw Error("PL.PROVENANCE_CHANGED: A1 group coverage");
      const contexts = group.contexts;
      if (contexts.length !== request.directories.length) {
        throw Error(
          "PL.PROVENANCE_CHANGED: A1 context coverage",
        );
      }
      const pairs = new Map<
        string,
        Pick<NativeAssignmentProjectPlans, "student" | "full">
      >();
      for (let i = 0; i < request.directories.length; i++) {
        const input = request.directories[i], context = contexts[i];
        if (input === undefined || !context || context.input !== join(root, input)) {
          throw Error(
            "PL.PROVENANCE_CHANGED: A1 input order",
          );
        }
        pairs.set(input, {
          student: await Core.planProject(context, {
            audience: "student",
          }),
          full: await Core.planProject(context, { audience: "full" }),
        });
      }
      for (
        const row of projectRows.filter((p) => p.format === request.format)
      ) {
        const pair = pairs.get(row.fact.projectRoot);
        if (!pair) throw Error("PL.SELECTION_INVALID: missing project pair");
        plans.push({
          source: row.source,
          exerciseId: row.fact.exerciseId,
          ...pair,
        });
      }
    }
    const result = await use(plans, checkpoint);
    inside = metrics();
    return result;
  };
  const value = await operation.withProjectContracts(requests, useBatch);
  const final = metrics();
  if (!inside) {
    throw Error("PL.NATIVE_METRICS_UNAVAILABLE: callback observation missing");
  }
  return { value, projectContextMetrics: Object.freeze({ inside, final }) };
}
/** Existing builder bridge: public body, private canonical answers and exact live
 * conditions остаются связанными с одной operation. References даёт QRC owner. */
export async function withNativeAssignments<T>(
  input: {
    Core: typeof CorePublic;
    operation: NativeOperation;
    descriptor: NativePreparedOperation;
    selection: {
      expectedSources: string[];
      assessments: { source: string; id: string }[];
    };
    references?: NativeAssignmentDeliveryOptions["references"];
  },
  use: (
    prepared: {
      adapter: NativeAdapter;
      proof: Awaited<ReturnType<NativeAdapter["validateCourse"]>>;
      projectRows: ReturnType<typeof nativeProjectRows>;
      projectPlans: NativeAssignmentDeliveryOptions["projectPlans"];
      deliveries: NativeDelivered[];
      checkpoint: () => Promise<void>;
    },
  ) => Promise<T>,
): Promise<NativeProjectPlansResult<T>> {
  const { Core, operation, descriptor, selection } = input;
  const adapter = createNativeAdapter({
    root: descriptor.root,
    core: Core,
    preparedIdentity: descriptor.identity,
  });
  const release = { expectedSources: selection.expectedSources };
  const proof = await adapter.validateCourse(operation, release);
  const projectRows = nativeProjectRows(await operation.assignmentProvenance());
  return await withNativeProjectPlans(
    Core,
    descriptor.root,
    descriptor.identity.profiles,
    projectRows,
    async (projectPlans, checkpoint) => {
      const deliveries: NativeDelivered[] = [];
      for (const assessment of selection.assessments) {
        deliveries.push(
          await adapter.assignmentDelivery(
            operation,
            {
              source: assessment.source,
              assessmentId: assessment.id,
            },
            {
              projectPlans,
              ...(input.references ? { references: input.references } : {}),
            },
            release,
            checkpoint,
          ),
        );
      }
      await checkpoint();
      return await use({
        adapter,
        proof,
        projectRows,
        projectPlans,
        deliveries,
        checkpoint,
      });
    },
    operation,
  );
}
/** Full captured check coverage, not an assumption about instance naming. */
export function assertNativeChecksCoverage(
  projectRows: ReturnType<typeof nativeProjectRows>,
  projects: readonly import("./native-check-inventory.ts").NativeCheckProject[],
) {
  const expected = projectRows.filter((p) => p.fact.check).map((
    p,
  ) => p.source + "\0" + p.fact.exerciseId).sort();
  const actual = projects.map((p) => p.source + "\0" + p.exerciseId).sort();
  if (
    new Set(actual).size !== actual.length ||
    canonical(expected) !== canonical(actual)
  ) {
    throw Error(
      "PL.NATIVE_CHECKS_SCOPE_INCOMPLETE: checks-output requires every captured project-check, including hidden/nonbank/nonPL; missing=" +
        JSON.stringify(expected.filter((p: string) => !actual.includes(p))),
    );
  }
}
/** Existing question() consumes authored names; the private normalized settings
 * are converted exactly once, without reconstructing an answer/body. */
export function authoredNativeSettings(value: NonNullable<NativeDelivered["nativeSettings"][string]>) {
  const { singleVariant, grading, submission, ...rest } = value;
  const aceMode = submission.mode === "editor" ? submission.aceMode : undefined;
  const sub = submission.mode === "editor" ? {mode:submission.mode} : submission;
  return {
    ...rest,
    submission: { ...sub, ...(aceMode ? { "ace-mode": aceMode } : {}) },
    ...(singleVariant === undefined ? {} : { "single-variant": singleVariant }),
    ...(grading
      ? { grading: grading.method === "external" ? "external" : grading }
      : {}),
  };
}
export async function prepareNativeCourse(
  input: {
    Core: typeof CorePublic;
    operation: NativeOperation;
    descriptor: NativePreparedOperation;
    selection: {
      expectedSources: string[];
      assessments: { source: string; id: string }[];
    };
    options: NativeEntryOptions;
    observedConfig: unknown;
  },
) {
  const { Core, operation, descriptor, selection, options } = input;
  if (!options.output) throw Error("PL.INPUT_INVALID: output required");
  const output = options.output;
  await operation.assertCurrent();
  let liveFence = async () => {
    await operation.assertCurrent();
  };
  const auxiliary = captureNativeAuxiliary(() => liveFence());
  const references = await nativeReferenceBindings({
    owner: descriptor.root,
    outputDirectory: descriptor.outputDirectory,
    book: options.book,
    config: input.observedConfig,
    operation,
  });
  const Download = await publicExtension(descriptor.root, "project-download");
  return await withNativeStagedOutput(async (save) => {
    const composed = await withNativeAssignments({
      ...input,
      references: references.references,
    }, async (prepared) => {
      const { adapter, projectRows, projectPlans, deliveries, checkpoint } =
        prepared;
      const courseId = deliveries[0]?.publicPackage.owner;
      if (
        !courseId ||
        deliveries.some((d) => d.publicPackage.owner !== courseId)
      ) throw Error("PL.ASSIGNMENT_CHANGED: course owner");
      const content: ExportCourseContent = {
        assessments: [],
        exercises: [],
        projects: projectRows.map((p) => p.fact),
      };
      for (const source of selection.expectedSources) {
        const value = adapter.validatedInput(source),
          business = adapter.business(source);
        if (value.assessment) {
          if (!business.assessment) throw Error("PL.ASSIGNMENT_CHANGED: missing assessment policy");
          content.assessments.push({
            ...value.assessment,
            source,
            extensions: { prairielearn: business.assessment },
          });
        }
        for (const declaration of value.declarations) {
          const questionSettings = business.questions[declaration.id];
          if (!questionSettings) throw Error("PL.ASSIGNMENT_CHANGED: missing question policy");
          content.exercises.push({
            id: declaration.id,
            target: "prairielearn",
            extensions: {
              prairielearn: authoredNativeSettings(
                questionSettings,
              ),
            },
          });
        }
      }
      type Materialized = Awaited<ReturnType<typeof materializeNativeQuestion>>;
      const projects: NonNullable<Materialized["project"]>[] = [],
        nativeInputs: Record<string, NonNullable<Materialized["selection"]>> =
          {},
        nativeAnswers: Record<string, AnswerFacts> = {},
        nativeResponseSlots: Record<string, NativeResponseSlot[]> = {},
        artifacts: Record<string, Materialized> = {},
        settings: NativeDelivered["nativeSettings"] = {},
        bodies = new Map<string, PublicBodyPackage>();
      // Введение каждого реально используемого меню готово до дорогих A1 ZIP.
      // Assignment membership проверяет Core по раннему observed context intent.
      if (options.instance) {
        const selectedWorks = selection.assessments.map((a) => {
          const work = content.assessments.find((w) =>
            w.id === a.id && w.source === a.source
          );
          if (!work) {
            throw Error(
              "PL.NATIVE_INTENT_INCOMPLETE: selected work absent: " + a.id,
            );
          }
          return work;
        });
        const menus = nativeUnitMenus(selectedWorks, content.assessments);
        const needed = new Map<string, ExportCourseContent["assessments"][number]>();
        for (const group of menus.values()) {
          for (const menu of group) needed.set(menu.id, menu);
        }
        for (const menu of needed.values()) {
          const delivered = await adapter.assignmentDelivery(
            operation,
            {
              source: menu.source,
              assessmentId: menu.id,
            },
            { projectPlans, references: references.references },
            {
              expectedSources: selection.expectedSources,
            },
            checkpoint,
          );
          bodies.set(menu.id, delivered.publicPackage);
        }
      }
      let registryInput: RuntimeRegistry | undefined;
      const fence = async () => {
        await checkpoint();
      };
      // Ровно одна batch в этой composition; после выхода остаётся старый
      // истёкший token, а не fallback или checkpoint следующей партии.
      liveFence = fence;
      const registry = async () => {
        registryInput ??= decodeRuntimeRegistry((await checkedJSON(
          resolve(
            options.runtimeRegistry ??
              auxiliary.environment.PRAIRIELEARN_RUNTIME_REGISTRY ??
              join(options.root, "prairielearn/runtime-profiles.json"),
          ),
        )).value);
        return registryInput;
      };
      const materializationTotal = new Set(deliveries.flatMap((d) =>
        d.publicPackage.questions.filter((q) =>
          !d.nativeAnswers[q.id]
        ).map((q) =>
          q.id
        )
      )).size;
      let materializationIndex = 0;
      for (const delivered of deliveries) {
        const deliveredWork = delivered.publicPackage.works[0];
        if (!deliveredWork) throw Error("PL.ASSIGNMENT_CHANGED: missing work");
        bodies.set(
          deliveredWork.id,
          delivered.publicPackage,
        );
        for (const q of delivered.publicPackage.questions) {
          const value = delivered.nativeSettings[q.id],
            answer = delivered.nativeAnswers[q.id], condition = delivered.conditions[q.id];
          if (!value || !condition) throw Error("PL.ASSIGNMENT_CHANGED: missing settings/condition");
          if (
            settings[q.id] && canonical(settings[q.id]) !== canonical(value)
          ) {
            throw Error("PL.ASSIGNMENT_CHANGED: repeated question policy");
          }
          settings[q.id] = value;
          if (answer) {
            if (
              nativeAnswers[q.id] &&
              canonical(nativeAnswers[q.id]) !== canonical(answer)
            ) {
              throw Error("PL.ASSIGNMENT_CHANGED: repeated answer");
            }
            nativeAnswers[q.id] = answer;
            const slots = condition.responseSlots;
            if (
              nativeResponseSlots[q.id] &&
              canonical(nativeResponseSlots[q.id]) !== canonical(slots)
            ) {
              throw Error("PL.ASSIGNMENT_CHANGED: repeated slots");
            }
            nativeResponseSlots[q.id] = slots;
            continue;
          }
          if (artifacts[q.id]) {
            continue;
          }
          const facts = projectRows.filter((p) =>
            p.source === q.source && p.fact.exerciseId === q.id
          );
          const pairs = projectPlans.filter((p) =>
            p.source === q.source && p.exerciseId === q.id
          );
          const row = facts[0], pair = pairs[0];
          if (facts.length !== 1 || pairs.length !== 1 || !row || !pair) {
            throw Error("PL.PROVENANCE_CHANGED: selected project/plan");
          }
          const fact = row.fact,
            business = adapter.business(q.source),
            declaration = adapter.validatedInput(q.source).declarations.find((
              d,
            ) =>
              d.id === q.id
            );
          if (
            fact.check &&
            (!declaration || canonical(
                  decodeNativeCheck(
                    business.raw.projectChecks,
                    declaration.attributes["project-check"] ?? "",
                  ),
                ) !== canonical(fact.check))
          ) throw Error("PL.CHECKS_CHANGED: Core/C policy parity");
          const runtime = fact.check
            ? (await registry()).profiles?.[fact.check.runtime]
            : undefined;
          if (fact.check && !runtime) {
            throw Error("PL.RUNTIME_INVALID: selected profile");
          }
          const progressIndex = ++materializationIndex,
            started = performance.now();
          console.error(
            `PrairieLearn: подготовка задания ${progressIndex}/${materializationTotal} ${q.key} — начало`,
          );
          const materialized = await materializeNativeQuestion({
            Core,
            operation,
            checkpoint,
            auxiliary,
            pair,
            condition,
            fact,
            ...(typeof row.materialization?.includeGit === "boolean" ? {materialization:{includeGit:row.materialization.includeGit}} : {}),
            settings: value,
            courseId,
            runtime: runtime ?? {},
            bindings: (plan, condition, submission) =>
              references.bindings(Core, plan, condition, submission),
            Download,
            adapter,
            expectedSources: selection.expectedSources,
          });
          console.error(
            `PrairieLearn: подготовка задания ${progressIndex}/${materializationTotal} ${q.key} — готово (${
              ((performance.now() - started) / 1000).toFixed(1)
            } с)`,
          );
          artifacts[q.id] = materialized;
          if (materialized.project) {
            projects.push(materialized.project);
            if (!materialized.selection) throw Error("PL.SELECTION_INVALID: missing materialized selection");
            nativeInputs[q.id] = materialized.selection;
          }
        }
      }
      await fence();
      let result: Awaited<ReturnType<typeof exportCourse>> | Awaited<ReturnType<typeof exportPrairieLearn>>;
      if (options.instance) {
        if (!options.checksOutput) {
          throw Error("PL.INPUT_INVALID: course checks-output required");
        }
        assertNativeChecksCoverage(projectRows, projects);
        const checks = nativeChecksManifest({
          courseId,
          bookRoot: options.book,
          projects,
        });
        const firstAssessment = selection.assessments[0];
        if (!firstAssessment) throw Error("PL.NATIVE_INTENT_INCOMPLETE: missing assessment");
        const config = validateNativeRaw(
          adapter.business(firstAssessment.source).raw,
          { source: firstAssessment.source },
        )
          .config;
        result = await exportCourse({
          courseId,
          projectRoot: descriptor.root,
          content,
          checks,
          config,
          registry: registryInput ?? { schemaVersion: 1, profiles: {} },
          instance: options.instance,
          output,
          checksOutput: options.checksOutput,
          body: async (id) => {
            const body = bodies.get(id);
            if (!body) {
              throw Error(
                "PL.NATIVE_INTENT_INCOMPLETE: selected menu context absent: " +
                  id,
              );
            }
            return body;
          },
          ...(options.candidateImage ? {candidateImage:options.candidateImage} : {}),
          deferPublish: true,
          nativeInputs,
          nativeAnswers,
          nativeResponseSlots,
          nativeBody: true,
          nativeAuxiliary: auxiliary,
          studentArtifact: async (fact) => { const artifact = artifacts[fact.exerciseId]; if (!artifact) throw Error("PL.SELECTION_INVALID: missing student artifact"); return artifact; },
        });
        if (!result || !("discard" in result)) throw Error("PL.PUBLICATION_INVALID: missing staged output");
        save(result);
      } else {
        if (
          options.checksOutput || !options.bindingPath ||
          deliveries.length !== 1
        ) {
          throw Error(
            "PL.INPUT_INVALID: standalone binding and one selected work required",
          );
        }
        const binding = await checkedJSON(resolve(options.bindingPath));
        const scratch = await Deno.makeTempDir({
          dir: dirname(resolve(output)),
          prefix: ".pl-native-inputs-",
        });
        try {
          const paths: Record<string,string> = {};
          const delivery = deliveries[0];
          if (!delivery) throw Error("PL.NATIVE_INTENT_INCOMPLETE: missing delivery");
          if (!record(binding.value) || !record(binding.value.questions)) throw Error("PL.BINDING_CHANGED: missing questions");
          for (const q of delivery.publicPackage.questions) {
            const expected = settings[q.id],
              provided = binding.value.questions[q.id],
              selected = nativeInputs[q.id];
            if (
              !record(provided) ||
              canonical({
                  topic: provided.topic,
                  submission: provided.submission,
                  grading: provided.grading ?? { method: "external" },
                  singleVariant: provided.singleVariant,
                }) !== canonical(expected)
            ) throw Error("PL.BINDING_CHANGED: authored settings");
            if (nativeAnswers[q.id]) continue;
            paths[q.id] = "/" + q.id;
            for (const folder of ["student", "tests"]) {
              await Deno.mkdir(join(scratch, q.id, folder), {
                recursive: true,
              });
            }
            if (!selected) {
              // Genuine materialized bytes, а не повторное чтение owner/student.
              const artifact = artifacts[q.id];
              if (!artifact) throw Error("PL.SELECTION_INVALID: missing artifact");
              for (const file of artifact.files) {
                const path = join(scratch, q.id, "student", file.name);
                await Deno.mkdir(dirname(path), { recursive: true });
                await Deno.writeFile(path, file.bytes);
              }
            }
            if (selected) {
              if (
                canonical(provided.files) !==
                  canonical(selected.sources.map((f) => f.name))
              ) throw Error("PL.BINDING_CHANGED: primary files");
              for (
                const [folder, files] of [["student", selected.sources], [
                  "tests",
                  selected.tests,
                ]] as const
              ) {
                for (const f of files) {
                  const path = join(scratch, q.id, folder, f.name);
                  await Deno.mkdir(dirname(path), { recursive: true });
                  await Deno.writeFile(path, f.bytes);
                }
              }
              await Deno.writeTextFile(
                join(scratch, q.id, "tests/grading-job.json"),
                JSON.stringify(selected.descriptor),
              );
              const project = projects.find((p) => p.exerciseId === q.id);
              const profile = project ? registryInput?.profiles?.[project.check.runtime] : undefined;
              const external = provided.externalGradingOptions;
              if (
                !profile?.image || !record(external) ||
                external.image !== profile.image ||
                external.enableNetworking !== false
              ) {
                throw Error(
                  "PL.RUNTIME_INVALID: exact registered image binding required",
                );
              }
            }
          }
          result = await exportPrairieLearn(
            delivery.publicPackage,
            {
              projectRoot: scratch,
              projects: paths,
              studentArtifacts: artifacts,
              nativeAnswers,
              deferPublish: true,
              nativeBody: true,
              nativeAuxiliary: auxiliary,
            },
            binding.value,
            output,
          );
          if (!result || !("discard" in result)) throw Error("PL.PUBLICATION_INVALID: missing staged output");
        save(result);
          await fence();
        } finally {
          await Deno.remove(scratch, { recursive: true });
        }
      }
      await fence();
      if (!result || !("publish" in result) || !("discard" in result)) throw Error("PL.PUBLICATION_INVALID: missing staged output");
      return result;
    });
    return {
      ...composed.value,
      nativeProjectContextMetrics: composed.projectContextMetrics,
    };
  });
}

/** Closing A1 failure не должен терять уже подготовленные output handles. */
export async function withNativeStagedOutput<T>(
  use: (
    save: (prepared: { discard: () => Promise<void> }) => void,
  ) => Promise<T>,
): Promise<T> {
  let staged: { discard: () => Promise<void> } | undefined;
  try {
    return await use((prepared) => {
      staged = prepared;
    });
  } catch (error) {
    await staged?.discard();
    throw error;
  }
}
