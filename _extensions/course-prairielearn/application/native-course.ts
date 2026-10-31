import { join } from "node:path";
import { createNativeAdapter } from "./native-adapter.ts";
import {
  nativeProjectWitness,
  requireNativeChecksContract,
} from "./native-provenance.ts";
import type { NativeEntryOptions } from "./native-entry.ts";
/** Удерживает все A1 callbacks живыми до выдачи. Один owner в запросе A1;
 * разные фактические formats удерживаются вложенными callbacks, не DTO-копиями. */
export async function withNativeProjectPlans<T>(
  Core: any,
  root: string,
  profiles: string[],
  witness: any,
  use: (plans: any[]) => Promise<T>,
): Promise<T> {
  const formats = [
    ...new Set(witness.projects.map((p: any) => p.format)),
  ] as string[];
  const plans: any[] = [];
  async function next(index: number): Promise<T> {
    if (index === formats.length) return await use(plans);
    const format = formats[index],
      rows = witness.projects.filter((p: any) => p.format === format);
    const inputs = [
      ...new Set(
        rows.map((p: any) => p.fact.projectRoot + "/native-input.qmd"),
      ),
    ] as string[];
    return await Core.readProjectContexts([{
      owner: root,
      inputs,
      profiles,
      format,
    }], async (groups: any[]) => {
      const contexts = groups[0]?.contexts;
      if (!contexts || contexts.length !== inputs.length) {
        throw Error("PL.PROVENANCE_CHANGED: A1 context coverage");
      }
      const pairs = new Map<string, any>();
      for (let i = 0; i < inputs.length; i++) {
        if (contexts[i].input !== join(root, inputs[i])) {
          throw Error("PL.PROVENANCE_CHANGED: A1 input order");
        }
        pairs.set(inputs[i], {
          student: await Core.planProject(contexts[i], { audience: "student" }),
          full: await Core.planProject(contexts[i], { audience: "full" }),
        });
      }
      for (const row of rows) {
        plans.push({
          source: row.source,
          exerciseId: row.fact.exerciseId,
          ...pairs.get(row.fact.projectRoot + "/native-input.qmd"),
        });
      }
      return await next(index + 1);
    });
  }
  return await next(0);
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
): Promise<T> {
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
  );
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
  },
): Promise<never> {
  // До A1 inquiries/materialization/exporter: контракт private checks ещё не принят.
  // Не создавать fake CheckProject/legacy release или второй exporter для обхода.
  const adapter = createNativeAdapter({
    root: input.descriptor.root,
    core: input.Core,
    preparedIdentity: input.descriptor.identity,
  });
  await adapter.validateCourse(input.operation, {
    expectedSources: input.selection.expectedSources,
  });
  await nativeProjectWitness(
    input.Core,
    await input.operation.assignmentProvenance(),
    {
      identity: input.descriptor.identity,
      sources: input.selection.expectedSources,
    },
  );
  await input.operation.assertCurrent();
  return requireNativeChecksContract();
}
