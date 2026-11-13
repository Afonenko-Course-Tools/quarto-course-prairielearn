import type * as CorePublic from "course-core/public.ts";
import type {
  NativeAssignmentDeliveryOptions,
  NativeOperation,
  PublicBodyPackage,
} from "course-core/public.ts";
import { captureNativeAuxiliary } from "./native-auxiliary.ts";
import { nativeCheck } from "./native-checks.ts";
import type {
  CourseArtifacts,
  coursePolicies,
  NativeAdapter,
  NativeDelivered,
  RuntimeRegistry,
} from "./native-course-stages.ts";
import {
  materializeNativeQuestion,
  nativeReferenceBindings,
  publicExtension,
} from "./native-materialize.ts";
import { nativeProjectRows } from "./native-provenance.ts";
import { canonical } from "./source-selection.ts";
type MaterializationInput = {
  Core: typeof CorePublic;
  operation: NativeOperation;
  checkpoint: () => Promise<void>;
  auxiliary: ReturnType<typeof captureNativeAuxiliary>;
  references: Awaited<ReturnType<typeof nativeReferenceBindings>>;
  Download: Awaited<ReturnType<typeof publicExtension>>;
  adapter: NativeAdapter;
  expectedSources: string[];
  courseId: string;
  projectRows: ReturnType<typeof nativeProjectRows>;
  projectPlans: NativeAssignmentDeliveryOptions["projectPlans"];
  sourcePolicies: ReturnType<typeof coursePolicies>["sourcePolicies"];
  registry: () => Promise<RuntimeRegistry>;
  deliveries: NativeDelivered[];
  state: CourseArtifacts;
};
async function materializeCourseQuestion(
  input: MaterializationInput & {
    delivered: NativeDelivered;
    q: PublicBodyPackage["questions"][number];
    materializationTotal: number;
    advance: () => number;
  },
) {
  const {
    Core,
    operation,
    checkpoint,
    auxiliary,
    references,
    Download,
    adapter,
    expectedSources,
    courseId,
    projectRows,
    projectPlans,
    sourcePolicies,
    registry,
    delivered,
    q,
    materializationTotal,
  } = input;
  const {
    settings,
    nativeAnswers,
    nativeResponseSlots,
    artifacts,
    projects,
    nativeInputs,
  } = input.state;
  const value = delivered.nativeSettings[q.id],
    answer = delivered.nativeAnswers[q.id],
    condition = delivered.conditions[q.id];
  if (!value || !condition) {
    throw Error("PL.ASSIGNMENT_CHANGED: missing settings/condition");
  }
  if (settings[q.id] && canonical(settings[q.id]) !== canonical(value)) {
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
    return;
  }
  if (artifacts[q.id]) {
    return;
  }
  const facts = projectRows.filter(
    (p) => p.source === q.source && p.fact.exerciseId === q.id,
  );
  const pairs = projectPlans.filter(
    (p) => p.source === q.source && p.exerciseId === q.id,
  );
  const row = facts[0],
    pair = pairs[0];
  if (facts.length !== 1 || pairs.length !== 1 || !row || !pair) {
    throw Error("PL.PROVENANCE_CHANGED: selected project/plan");
  }
  const policy = sourcePolicies.get(q.source);
  if (!policy) throw Error("PL.CAPTURE_MISSING: source policy");
  const fact = row.fact,
    business = policy.business,
    declaration = policy.input.declarations.find((d) => d.id === q.id);
  if (
    fact.check &&
    (!declaration ||
      !business.projectChecks ||
      canonical(
        nativeCheck(
          business.projectChecks,
          declaration.attributes["project-check"] ?? "",
        ),
      ) !== canonical(fact.check))
  )
    throw Error("PL.CHECKS_CHANGED: Core/C policy parity");
  const runtime = fact.check
    ? (await registry()).profiles?.[fact.check.runtime]
    : undefined;
  if (fact.check && !runtime) {
    throw Error("PL.RUNTIME_INVALID: selected profile");
  }
  const progressIndex = input.advance(),
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
    ...(typeof row.materialization?.includeGit === "boolean"
      ? { materialization: { includeGit: row.materialization.includeGit } }
      : {}),
    settings: value,
    courseId,
    runtime: runtime ?? {},
    bindings: (plan, condition, submission) =>
      references.bindings(Core, plan, condition, submission),
    Download,
    adapter,
    expectedSources: expectedSources,
  });
  console.error(
    `PrairieLearn: подготовка задания ${progressIndex}/${materializationTotal} ${q.key} — готово (${(
      (performance.now() - started) /
      1000
    ).toFixed(1)} с)`,
  );
  artifacts[q.id] = materialized;
  if (materialized.project) {
    projects.push(materialized.project);
    if (!materialized.selection) {
      throw Error("PL.SELECTION_INVALID: missing materialized selection");
    }
    nativeInputs[q.id] = materialized.selection;
  }
}
export async function prepareCourseQuestions(input: MaterializationInput) {
  const { deliveries } = input;
  const { bodies } = input.state;
  const materializationTotal = new Set(
    deliveries.flatMap((d) =>
      d.publicPackage.questions
        .filter((q) => !d.nativeAnswers[q.id])
        .map((q) => q.id),
    ),
  ).size;
  let materializationIndex = 0;
  for (const delivered of deliveries) {
    const deliveredWork = delivered.publicPackage.works[0];
    if (!deliveredWork) throw Error("PL.ASSIGNMENT_CHANGED: missing work");
    bodies.set(deliveredWork.id, delivered.publicPackage);
    for (const q of delivered.publicPackage.questions) {
      await materializeCourseQuestion({
        ...input,
        delivered,
        q,
        materializationTotal,
        advance: () => ++materializationIndex,
      });
    }
  }
}
