import { captureNativeAuxiliary } from "./native-auxiliary.ts";
import { dirname, join, resolve } from "node:path";
import { createNativeAdapter } from "./native-adapter.ts";
import { nativeProjectWitness } from "./native-provenance.ts";
import type { NativeEntryOptions } from "./native-entry.ts";
import { canonical } from "./source-selection.ts";
import { decodeNativeCheck } from "./native-checks.ts";
import { validateNativeRaw } from "./native-business.ts";
import { nativeChecksManifest } from "./native-check-inventory.ts";
import { nativeVerificationInventory } from "./verification-inventory.ts";
import { exportCourse } from "./export-course.ts";
import { exportPrairieLearn } from "./export.ts";
import {
  checkedJSON,
  materializeNativeQuestion,
  nativeReferenceBindings,
  publicExtension,
} from "./native-materialize.ts";
export type NativeProjectPlansResult<T> = {
  value: T;
  projectContextMetrics: Readonly<{
    inside: Readonly<Record<string, number>>;
    final: Readonly<Record<string, number>>;
  }>;
};
/** Один genuine operation batch держит все actual formats/планы до выдачи.
 * Metrics читаются после await, когда закрывающий A1 fence уже выполнен. */
export async function withNativeProjectPlans<T>(
  Core: any,
  root: string,
  profiles: string[],
  witness: any,
  use: (plans: any[]) => Promise<T>,
  operation: any,
): Promise<NativeProjectPlansResult<T>> {
  if (typeof operation?.withProjectContexts !== "function") {
    throw Error(
      "PL.NATIVE_PROJECT_CONTEXT_REUSE_REQUIRED: public current-operation A1 batch unavailable; no standalone fallback",
    );
  }
  const formats = [
    ...new Set(witness.projects.map((p: any) => p.format)),
  ] as string[];
  const requests = formats.map((format) => ({
    owner: root,
    profiles,
    format,
    inputs: [
      ...new Set(
        witness.projects.filter((p: any) => p.format === format).map((p: any) =>
          p.fact.projectRoot + "/native-input.qmd"
        ),
      ),
    ] as string[],
  }));
  let retained: any, inside: Readonly<Record<string, number>> | undefined;
  const metrics = () => {
    const snapshot = retained?.metrics;
    if (
      !snapshot || typeof snapshot.inspectCalls !== "number" ||
      typeof snapshot.fullWalks !== "number" ||
      typeof snapshot.sourceBytesRead !== "number"
    ) {
      throw Error(
        "PL.NATIVE_METRICS_UNAVAILABLE: fresh public A1 batch observations required",
      );
    }
    return snapshot as Readonly<Record<string, number>>;
  };
  const value = await operation.withProjectContexts(
    requests,
    async (batch: any) => {
      retained = batch;
      if (batch.groups.length !== requests.length) {
        throw Error(
          "PL.PROVENANCE_CHANGED: A1 group coverage",
        );
      }
      const plans: any[] = [];
      for (let index = 0; index < requests.length; index++) {
        const request = requests[index],
          contexts = batch.groups[index].contexts;
        if (contexts.length !== request.inputs.length) {
          throw Error(
            "PL.PROVENANCE_CHANGED: A1 context coverage",
          );
        }
        const pairs = new Map<string, any>();
        for (let i = 0; i < request.inputs.length; i++) {
          const input = request.inputs[i];
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
          const row of witness.projects.filter((p: any) =>
            p.format === request.format
          )
        ) {
          plans.push({
            source: row.source,
            exerciseId: row.fact.exerciseId,
            ...pairs.get(row.fact.projectRoot + "/native-input.qmd"),
          });
        }
      }
      const result = await use(plans);
      inside = metrics();
      return result;
    },
  );
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
    Core: any;
    operation: any;
    descriptor: any;
    selection: {
      expectedSources: string[];
      assessments: { source: string; id: string }[];
    };
    references?: unknown;
  },
  use: (
    prepared: {
      adapter: any;
      proof: any;
      witness: any;
      projectPlans: any[];
      deliveries: any[];
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
    async (projectPlans) => {
      const deliveries = [];
      for (const assessment of selection.assessments) {
        deliveries.push(
          await adapter.assignmentDelivery(operation, {
            source: assessment.source,
            assessmentId: assessment.id,
          }, {
            projectPlans,
            ...(input.references ? { references: input.references } : {}),
          }, release),
        );
      }
      await operation.assertCurrent();
      return await use({ adapter, proof, witness, projectPlans, deliveries });
    },
    operation,
  );
}
/** Full captured check coverage, not an assumption about instance naming. */
export function assertNativeChecksCoverage(witness: any, projects: any[]) {
  const expected = witness.projects.filter((p: any) => p.fact.check).map((
    p: any,
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
    Core: any;
    operation: any;
    descriptor: any;
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
  // Existing flags are explicit dependencies; never silently replace a stage or
  // publication-source receipt with a second materialization/guessed provenance.
  if (options.stagingReceipt) {
    throw Error(
      "PL.NATIVE_STAGE_RECEIPT_UNQUALIFIED: native A1 replaces stage source reading; receipt integration pending review",
    );
  }
  if (options.publicationConditions) {
    throw Error(
      "PL.NATIVE_PUBLICATION_SOURCE_UNQUALIFIED: explicit publication source binding required",
    );
  }
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
      const { adapter, witness, projectPlans, deliveries } = prepared;
      const courseId = deliveries[0]?.publicPackage.owner;
      if (
        !courseId ||
        deliveries.some((d: any) => d.publicPackage.owner !== courseId)
      ) throw Error("PL.ASSIGNMENT_CHANGED: course owner");
      const rows = witness.sourceRows,
        bySource = new Map(rows.map((r: any) => [r.source, r.sha256]));
      const content: any = {
        assessments: [],
        exercises: [],
        projects: witness.projects.map((p: any) => p.fact),
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
      const projects: any[] = [],
        nativeInputs: any = {},
        nativeAnswers: any = {},
        nativeResponseSlots: any = {},
        artifacts: any = {},
        settings: any = {},
        bodies = new Map<string, any>();
      let registryInput: any;
      let standaloneBinding: { assert: () => Promise<void> } | undefined;
      const checkBindings = async () => {
        await references.check();
        await registryInput?.assert();
        await standaloneBinding?.assert();
      };
      const fence = async () => {
        await operation.assertCurrent();
        await checkBindings();
      };
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
            ) throw Error("PL.ASSIGNMENT_CHANGED: repeated answer");
            nativeAnswers[q.id] = answer;
            const slots = delivered.conditions[q.id].responseSlots;
            if (
              nativeResponseSlots[q.id] &&
              canonical(nativeResponseSlots[q.id]) !== canonical(slots)
            ) throw Error("PL.ASSIGNMENT_CHANGED: repeated slots");
            nativeResponseSlots[q.id] = slots;
            continue;
          }
          if (artifacts[q.id]) continue;
          const facts = witness.projects.filter((p: any) =>
            p.source === q.source && p.fact.exerciseId === q.id
          );
          const pairs = projectPlans.filter((p: any) =>
            p.source === q.source && p.exerciseId === q.id
          );
          if (facts.length !== 1 || pairs.length !== 1) {
            throw Error("PL.PROVENANCE_CHANGED: selected project/plan");
          }
          const fact = facts[0].fact,
            business = adapter.business(q.source),
            declaration = adapter.validatedInput(q.source).declarations.find((
              d: any,
            ) => d.id === q.id);
          if (
            fact.check &&
            canonical(
                decodeNativeCheck(
                  business.raw.projectChecks,
                  declaration.attributes["project-check"],
                ),
              ) !== canonical(fact.check)
          ) throw Error("PL.CHECKS_CHANGED: Core/C policy parity");
          const runtime = fact.check
            ? (await registry()).profiles?.[fact.check.runtime]
            : undefined;
          if (fact.check && !runtime) {
            throw Error("PL.RUNTIME_INVALID: selected profile");
          }
          const materialized = await materializeNativeQuestion({
            Core,
            operation,
            auxiliary,
            pair: pairs[0],
            condition: delivered.conditions[q.id],
            fact,
            materialization: facts[0].materialization,
            settings: value,
            sourceRows: rows,
            courseId,
            runtime,
            bindings: (plan, condition, submission) =>
              references.bindings(Core, plan, condition, submission),
            Download,
            adapter,
            expectedSources: selection.expectedSources,
          });
          artifacts[q.id] = materialized;
          if (materialized.project) {
            projects.push(materialized.project);
            nativeInputs[q.id] = materialized.selection;
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
        const sources = selection.expectedSources.map((source) => ({
          source,
          sha256: bySource.get(source) as string,
        })).sort((a, b) => a.source.localeCompare(b.source));
        const selectionScope = {
          schema: "pl-native-selected-checks-v1",
          identity: descriptor.identity,
          assessments: selection.assessments,
          sources,
          automaticIds: projects.map((p) => p.qualifiedId).sort(),
        };
        const checks = await nativeChecksManifest({
          courseId,
          bookRoot: options.book,
          sources,
          projects,
          version: 2,
          selectionScope,
        });
        const nativeVerification = await nativeVerificationInventory({
          courseId,
          operation: descriptor.identity.operation,
          selections: nativeInputs,
        });
        const config = validateNativeRaw(
          adapter.business(selection.assessments[0].source).raw,
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
            if (!bodies.has(id)) {
              throw Error(
                "PL.NATIVE_INTENT_INCOMPLETE: selected menu context absent: " +
                  id,
              );
            }
            return bodies.get(id);
          },
          candidateImage: options.candidateImage,
          deferPublish: true,
          nativeInputs,
          nativeAnswers,
          nativeResponseSlots,
          nativeVerification,
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
        standaloneBinding = binding;
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
                  canonical(selected.sources.map((f: any) => f.name))
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
                projects.find((p) => p.exerciseId === q.id).check.runtime
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
      return bindNativePublication(result, checkBindings);
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

/** После закрытия Core/A1 здесь нет live guard. Это не prior-P gate. */
export function bindNativePublication<
  T extends { publish: () => Promise<any>; discard: () => Promise<void> },
>(
  prepared: T,
  checkBindings: () => Promise<void>,
): T {
  return {
    ...prepared,
    publish: async () => {
      try {
        await checkBindings();
        return await prepared.publish();
      } catch (error) {
        await prepared.discard();
        throw error;
      }
    },
  };
}
