import type * as CorePublic from "course-core/public.ts";
import type {
  NativeAssignmentDeliveryOptions,
  NativeAssignmentProjectPlans,
  NativeOperation,
  NativeOperationProjectContextBatch,
  NativeOperationProjectContextMetrics,
  NativePreparedOperation,
} from "course-core/public.ts";
import { join, resolve } from "node:path";
import { exportCourse } from "./export-course.ts";
import { exportPrairieLearn } from "./export.ts";
import { createNativeAdapter } from "./native-adapter.ts";
import { captureNativeAuxiliary } from "./native-auxiliary.ts";
import { validateNativeRaw } from "./native-business.ts";
import { nativeChecksManifest } from "./native-check-inventory.ts";
import { prepareCourseQuestions } from "./native-course-questions.ts";
import {
  courseArtifacts,
  coursePolicies,
  prepareCourseMenus,
} from "./native-course-stages.ts";
import type { NativeEntryOptions } from "./native-entry.ts";
import {
  checkedJSON,
  nativeReferenceBindings,
  publicExtension,
} from "./native-materialize.ts";
import { nativeProjectRows } from "./native-provenance.ts";
import { prepareStandaloneCourse } from "./native-standalone.ts";
import { canonical } from "./source-selection.ts";
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
type RuntimeRegistry = Parameters<typeof exportCourse>[0]["registry"];
function decodeRuntimeRegistry(value: unknown): RuntimeRegistry {
  if (
    !record(value) ||
    typeof value.schemaVersion !== "number" ||
    ![1, 2].includes(value.schemaVersion) ||
    (value.profiles !== undefined && !record(value.profiles))
  )
    throw Error("PL.RUNTIME_INVALID: registry version/profiles");
  const profiles: NonNullable<RuntimeRegistry["profiles"]> = {};
  for (const [name, profile] of Object.entries(value.profiles ?? {})) {
    if (
      !record(profile) ||
      (profile.mode !== undefined && typeof profile.mode !== "string") ||
      (profile.javaRelease !== undefined &&
        (typeof profile.javaRelease !== "number" ||
          !Number.isInteger(profile.javaRelease))) ||
      (profile.sourceExtensions !== undefined &&
        (!Array.isArray(profile.sourceExtensions) ||
          !profile.sourceExtensions.every(
            (x: unknown) => typeof x === "string",
          ))) ||
      (profile.image !== undefined && typeof profile.image !== "string")
    )
      throw Error("PL.RUNTIME_INVALID: profile " + name);
    profiles[name] = {
      ...(typeof profile.mode === "string" ? { mode: profile.mode } : {}),
      ...(typeof profile.javaRelease === "number"
        ? { javaRelease: profile.javaRelease }
        : {}),
      ...(Array.isArray(profile.sourceExtensions) &&
      profile.sourceExtensions.every((x: unknown) => typeof x === "string")
        ? { sourceExtensions: profile.sourceExtensions }
        : {}),
      ...(typeof profile.image === "string" ? { image: profile.image } : {}),
    };
  }
  return { schemaVersion: value.schemaVersion, profiles };
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
  ...args: [
    Core: typeof CorePublic,
    root: string,
    profiles: string[],
    projectRows: ReturnType<typeof nativeProjectRows>,
    use: (
      plans: NativeAssignmentProjectPlans[],
      checkpoint: () => Promise<void>,
    ) => Promise<T>,
    operation: NativeOperation,
  ]
): Promise<NativeProjectPlansResult<T>> {
  const [Core, root, profiles, projectRows, use, operation] = args;
  return await withProjectPlanBatch({
    Core,
    root,
    profiles,
    projectRows,
    use,
    operation,
  });
}
async function withProjectPlanBatch<T>(input: {
  Core: typeof CorePublic;
  root: string;
  profiles: string[];
  projectRows: ReturnType<typeof nativeProjectRows>;
  use: (
    plans: NativeAssignmentProjectPlans[],
    checkpoint: () => Promise<void>,
  ) => Promise<T>;
  operation: NativeOperation;
}): Promise<NativeProjectPlansResult<T>> {
  const { Core, root, profiles, projectRows, use, operation } = input;
  const formats = [...new Set(projectRows.map((p) => p.format))];
  const requests = formats.map((format) => ({
    owner: root,
    profiles,
    format,
    directories: [
      ...new Set(
        projectRows
          .filter((p) => p.format === format)
          .map((p) => p.fact.projectRoot),
      ),
    ],
  }));
  let retained: NativeOperationProjectContextBatch | undefined,
    inside: NativeOperationProjectContextMetrics | undefined;
  const metrics = () => {
    const snapshot = retained?.metrics;
    if (
      !snapshot ||
      typeof snapshot.yamlFileReads !== "number" ||
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
      throw Error("PL.PROVENANCE_CHANGED: A1 group coverage");
    }
    const plans: NativeAssignmentProjectPlans[] = [];
    for (let index = 0; index < requests.length; index++) {
      const request = requests[index],
        group = batch.groups[index];
      if (!request || !group) {
        throw Error("PL.PROVENANCE_CHANGED: A1 group coverage");
      }
      const contexts = group.contexts;
      if (contexts.length !== request.directories.length) {
        throw Error("PL.PROVENANCE_CHANGED: A1 context coverage");
      }
      const pairs = new Map<
        string,
        Pick<NativeAssignmentProjectPlans, "student" | "full">
      >();
      for (let i = 0; i < request.directories.length; i++) {
        const input = request.directories[i],
          context = contexts[i];
        if (
          input === undefined ||
          !context ||
          context.input !== join(root, input)
        ) {
          throw Error("PL.PROVENANCE_CHANGED: A1 input order");
        }
        pairs.set(input, {
          student: await Core.planProject(context, {
            audience: "student",
          }),
          full: await Core.planProject(context, { audience: "full" }),
        });
      }
      for (const row of projectRows.filter(
        (p) => p.format === request.format,
      )) {
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
  use: (prepared: {
    adapter: NativeAdapter;
    proof: Awaited<ReturnType<NativeAdapter["validateCourse"]>>;
    projectRows: ReturnType<typeof nativeProjectRows>;
    projectPlans: NativeAssignmentDeliveryOptions["projectPlans"];
    deliveries: NativeDelivered[];
    checkpoint: () => Promise<void>;
  }) => Promise<T>,
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
  const expected = projectRows
    .filter((p) => p.fact.check)
    .map((p) => p.source + "\0" + p.fact.exerciseId)
    .sort();
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
export { authoredNativeSettings } from "./native-course-stages.ts";
export async function prepareNativeCourse(input: {
  Core: typeof CorePublic;
  operation: NativeOperation;
  descriptor: NativePreparedOperation;
  selection: {
    expectedSources: string[];
    assessments: { source: string; id: string }[];
  };
  options: NativeEntryOptions;
  observedConfig: unknown;
}) {
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
    const composed = await withNativeAssignments(
      {
        ...input,
        references: references.references,
      },
      async (prepared) => {
        const { adapter, projectRows, projectPlans, deliveries, checkpoint } =
          prepared;
        const courseId = deliveries[0]?.publicPackage.owner;
        if (
          !courseId ||
          deliveries.some((d) => d.publicPackage.owner !== courseId)
        )
          throw Error("PL.ASSIGNMENT_CHANGED: course owner");
        const { content, sourcePolicies } = coursePolicies(
          adapter,
          selection.expectedSources,
          projectRows,
        );
        const state = courseArtifacts();
        const {
          projects,
          nativeInputs,
          nativeAnswers,
          nativeResponseSlots,
          artifacts,
          bodies,
        } = state;
        await prepareCourseMenus({
          options,
          selection,
          content,
          adapter,
          operation,
          projectPlans,
          references,
          checkpoint,
          bodies,
        });
        let registryInput: RuntimeRegistry | undefined;
        const fence = async () => {
          await checkpoint();
        };
        // Ровно одна batch в этой composition; после выхода остаётся старый
        // истёкший token, а не fallback или checkpoint следующей партии.
        liveFence = fence;
        const registry = async () => {
          registryInput ??= decodeRuntimeRegistry(
            (
              await checkedJSON(
                resolve(
                  options.runtimeRegistry ??
                    auxiliary.environment.PRAIRIELEARN_RUNTIME_REGISTRY ??
                    join(options.root, "prairielearn/runtime-profiles.json"),
                ),
              )
            ).value,
          );
          return registryInput;
        };
        await prepareCourseQuestions({
          Core,
          operation,
          checkpoint,
          auxiliary,
          references,
          Download,
          adapter,
          expectedSources: selection.expectedSources,
          courseId,
          projectRows,
          projectPlans,
          sourcePolicies,
          registry,
          deliveries,
          state,
        });
        await fence();
        let result:
          | Awaited<ReturnType<typeof exportCourse>>
          | Awaited<ReturnType<typeof exportPrairieLearn>>;
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
          if (!firstAssessment) {
            throw Error("PL.NATIVE_INTENT_INCOMPLETE: missing assessment");
          }
          const config = validateNativeRaw(
            adapter.business(firstAssessment.source).raw,
            { source: firstAssessment.source },
          ).config;
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
            ...(options.candidateImage
              ? { candidateImage: options.candidateImage }
              : {}),
            deferPublish: true,
            nativeInputs,
            nativeAnswers,
            nativeResponseSlots,
            nativeBody: true,
            nativeAuxiliary: auxiliary,
            studentArtifact: async (fact) => {
              const artifact = artifacts[fact.exerciseId];
              if (!artifact) {
                throw Error("PL.SELECTION_INVALID: missing student artifact");
              }
              return artifact;
            },
          });
          if (!result || !("discard" in result)) {
            throw Error("PL.PUBLICATION_INVALID: missing staged output");
          }
          save(result);
        } else {
          result = await prepareStandaloneCourse({
            options,
            output,
            deliveries,
            registryInput,
            state,
            auxiliary,
            fence,
            save,
          });
        }
        await fence();
        if (!result || !("publish" in result) || !("discard" in result)) {
          throw Error("PL.PUBLICATION_INVALID: missing staged output");
        }
        return result;
      },
    );
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
