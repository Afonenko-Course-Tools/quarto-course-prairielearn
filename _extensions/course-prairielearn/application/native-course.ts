import type * as CorePublic from "course-core/public.ts";
import type {
  NativeAssignmentProjectPlans,
  NativeOperationProjectContextBatch,
  NativeOperationProjectContextMetrics,
  NativePreparedOperation,
} from "course-core/public.ts";
import type {
  NativeAssignmentDeliveryOptions,
  NativeOperation,
} from "course-core/public.ts";
import type { PublicBodyPackage } from "course-core/body-export/model.ts";
import { captureNativeAuxiliary } from "./native-auxiliary.ts";
import { dirname, join, resolve } from "node:path";
import { createNativeAdapter } from "./native-adapter.ts";
import { nativeProjectWitness } from "./native-provenance.ts";
import type { NativeEntryOptions } from "./native-entry.ts";
import { canonical } from "./source-selection.ts";
import { decodeNativeCheck } from "./native-checks.ts";
import { validateNativeRaw } from "./native-business.ts";
import { nativeChecksManifest } from "./native-check-inventory.ts";
import { exportCourse, nativeUnitMenus } from "./export-course.ts";
import { exportPrairieLearn } from "./export.ts";
import {
  checkedJSON,
  materializeNativeQuestion,
  nativeReferenceBindings,
  publicExtension,
} from "./native-materialize.ts";
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
  witness: Awaited<ReturnType<typeof nativeProjectWitness>>,
  use: (
    plans: NativeAssignmentProjectPlans[],
    checkpoint: () => Promise<void>,
  ) => Promise<T>,
  operation: NativeOperation,
): Promise<NativeProjectPlansResult<T>> {
  const formats = [
    ...new Set(witness.projects.map((p) => p.format)),
  ];
  const requests = formats.map((format) => ({
    owner: root,
    profiles,
    format,
    directories: [
      ...new Set(
        witness.projects.filter((p) => p.format === format).map((p) =>
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
      const request = requests[index],
        contexts = batch.groups[index].contexts;
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
        const input = request.directories[i];
        if (contexts[i].input !== join(root, input)) {
          throw Error(
            "PL.PROVENANCE_CHANGED: A1 input order",
          );
        }
        pairs.set(input, {
          student: await Core.planProject(contexts[i], {
            audience: "student",
          }),
          full: await Core.planProject(contexts[i], { audience: "full" }),
        });
      }
      for (
        const row of witness.projects.filter((p) => p.format === request.format)
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
      witness: Awaited<ReturnType<typeof nativeProjectWitness>>;
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
  const witness = await nativeProjectWitness(
    Core,
    await operation.assignmentProvenance(),
    { identity: descriptor.identity, sources: selection.expectedSources },
  );
  return await withNativeProjectPlans(
    Core,
    descriptor.root,
    descriptor.identity.profiles,
    witness,
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
        witness,
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
  witness: Awaited<ReturnType<typeof nativeProjectWitness>>,
  projects: readonly import("./native-check-inventory.ts").NativeCheckProject[],
) {
  const expected = witness.projects.filter((p) => p.fact.check).map((
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
export function authoredNativeSettings(value: any) {
  const { singleVariant, grading, submission, ...rest } = value;
  const { aceMode, ...sub } = submission;
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
    observedConfig: any;
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
      const { adapter, witness, projectPlans, deliveries, checkpoint } =
        prepared;
      const courseId = deliveries[0]?.publicPackage.owner;
      if (
        !courseId ||
        deliveries.some((d) => d.publicPackage.owner !== courseId)
      ) throw Error("PL.ASSIGNMENT_CHANGED: course owner");
      const content: any = {
        assessments: [],
        exercises: [],
        projects: witness.projects.map((p) => p.fact),
      };
      for (const source of selection.expectedSources) {
        const value = adapter.validatedInput(source),
          business = adapter.business(source);
        if (value.assessment) {
          content.assessments.push({
            ...value.assessment,
            source,
            extensions: { prairielearn: business.assessment },
          });
        }
        for (const declaration of value.declarations) {
          content.exercises.push({
            id: declaration.id,
            source,
            target: "prairielearn",
            project: declaration.attributes.project,
            extensions: {
              prairielearn: authoredNativeSettings(
                business.questions[declaration.id],
              ),
            },
          });
        }
      }
      type Materialized = Awaited<ReturnType<typeof materializeNativeQuestion>>;
      const projects: NonNullable<Materialized["project"]>[] = [],
        nativeInputs: Record<string, NonNullable<Materialized["selection"]>> =
          {},
        nativeAnswers: any = {},
        nativeResponseSlots: any = {},
        artifacts: Record<string, Materialized> = {},
        settings: any = {},
        bodies = new Map<string, PublicBodyPackage>();
      // Введение каждого реально используемого меню готово до дорогих A1 ZIP.
      // Assignment membership проверяет Core по раннему observed context intent.
      if (options.instance) {
        const selectedWorks = selection.assessments.map((a) => {
          const work = content.assessments.find((w: any) =>
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
        const needed = new Map<string, any>();
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
      let registryInput: any;
      const fence = async () => {
        await checkpoint();
      };
      // Ровно одна batch в этой composition; после выхода остаётся старый
      // истёкший token, а не fallback или checkpoint следующей партии.
      liveFence = fence;
      const registry = async () => {
        registryInput ??= await checkedJSON(
          resolve(
            options.runtimeRegistry ??
              auxiliary.environment.PRAIRIELEARN_RUNTIME_REGISTRY ??
              join(options.root, "prairielearn/runtime-profiles.json"),
          ),
        );
        if (![1, 2].includes(registryInput.value.schemaVersion)) {
          throw Error("PL.RUNTIME_INVALID: registry version");
        }
        return registryInput.value;
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
        bodies.set(
          delivered.publicPackage.works[0].id,
          delivered.publicPackage,
        );
        for (const q of delivered.publicPackage.questions) {
          const value = delivered.nativeSettings[q.id],
            answer = delivered.nativeAnswers[q.id];
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
            const slots = delivered.conditions[q.id].responseSlots;
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
          const facts = witness.projects.filter((p) =>
            p.source === q.source && p.fact.exerciseId === q.id
          );
          const pairs = projectPlans.filter((p) =>
            p.source === q.source && p.exerciseId === q.id
          );
          if (facts.length !== 1 || pairs.length !== 1) {
            throw Error("PL.PROVENANCE_CHANGED: selected project/plan");
          }
          const fact = facts[0].fact,
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
                    declaration.attributes["project-check"],
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
            pair: pairs[0],
            condition: delivered.conditions[q.id],
            fact,
            materialization: facts[0].materialization,
            settings: value,
            courseId,
            runtime,
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
            nativeInputs[q.id] = materialized.selection!;
          }
        }
      }
      await fence();
      let result: any;
      if (options.instance) {
        if (!options.checksOutput) {
          throw Error("PL.INPUT_INVALID: course checks-output required");
        }
        assertNativeChecksCoverage(witness, projects);
        const checks = nativeChecksManifest({
          courseId,
          bookRoot: options.book,
          projects,
        });
        const config = validateNativeRaw(
          adapter.business(selection.assessments[0].source).raw,
          { source: selection.assessments[0].source },
        )
          .config;
        result = await exportCourse({
          courseId,
          projectRoot: descriptor.root,
          content,
          checks,
          config,
          registry: registryInput?.value ?? { schemaVersion: 1, profiles: {} },
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
          candidateImage: options.candidateImage,
          deferPublish: true,
          nativeInputs,
          nativeAnswers,
          nativeResponseSlots,
          nativeBody: true,
          nativeAuxiliary: auxiliary,
          studentArtifact: async (fact) => artifacts[fact.exerciseId],
        });
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
          const paths: any = {};
          for (const q of deliveries[0].publicPackage.questions) {
            const expected = settings[q.id],
              provided = binding.value.questions?.[q.id],
              selected = nativeInputs[q.id];
            if (
              !provided ||
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
              for (const file of artifacts[q.id].files) {
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
              const profile = registryInput.value.profiles[
                projects.find((p) => p.exerciseId === q.id)!.check!.runtime
              ];
              if (
                !profile.image ||
                provided.externalGradingOptions?.image !== profile.image ||
                provided.externalGradingOptions.enableNetworking !== false
              ) {
                throw Error(
                  "PL.RUNTIME_INVALID: exact registered image binding required",
                );
              }
            }
          }
          result = await exportPrairieLearn(
            deliveries[0].publicPackage,
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
          save(result);
          await fence();
        } finally {
          await Deno.remove(scratch, { recursive: true });
        }
      }
      await fence();
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
