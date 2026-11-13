// Статические гарантии checked selection → genuine Core materialization.
import type * as Core from "course-core/public.ts";
import type {
  ArtifactFiles,
  MaterializableCondition,
  MaterializationBindings,
  NativeAssignmentProjectPlans,
  ProjectPlan,
} from "course-core/public.ts";
import type { NativeProjectCheck } from "../_extensions/course-prairielearn/application/native-checks.ts";
import type { selectNativeCompilerInputs } from "../_extensions/course-prairielearn/application/native-selection.ts";
import type { projectNativeChecks } from "../_extensions/course-prairielearn/application/native-check-projection.ts";
import type {
  materializeNativeQuestion,
  nativeReferenceBindings,
} from "../_extensions/course-prairielearn/application/native-materialize.ts";
import type { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Exact<A, B> =
  IsAny<A> extends true
    ? false
    : IsAny<B> extends true
      ? false
      : [A, B] extends [B, A]
        ? true
        : false;
type Require<T extends true> = T;
type Materialization = Parameters<typeof materializeNativeQuestion>[0];
type Selection = Parameters<typeof selectNativeCompilerInputs>[0];
type Projection = Awaited<ReturnType<typeof projectNativeChecks>>;
type Descriptor = ReturnType<typeof runtimeDescriptor>;

declare const core: typeof Core;
const materializationCore: Materialization["Core"] = core;
const selectionCore: Selection["core"] = core;
void materializationCore;
void selectionCore;

type _Plan = Require<Exact<Selection["studentPlan"], ProjectPlan>>;
type _ParsedPlan = Require<
  Exact<
    ReturnType<Selection["core"]["ProjectPlanSchema"]["parse"]>,
    ProjectPlan
  >
>;
type _ParsedInventory = Require<
  Exact<
    ReturnType<Selection["core"]["ArtifactFilesSchema"]["parse"]>,
    ArtifactFiles
  >
>;
type _Pair = Require<
  Exact<Materialization["pair"], NativeAssignmentProjectPlans>
>;
type _Condition = Require<
  Exact<Materialization["condition"], MaterializableCondition>
>;
type _Bindings = Require<
  Exact<
    Awaited<ReturnType<Materialization["bindings"]>>,
    MaterializationBindings
  >
>;
type _ReferenceBindings = Require<
  Exact<
    Awaited<
      ReturnType<
        Awaited<ReturnType<typeof nativeReferenceBindings>>["bindings"]
      >
    >,
    MaterializationBindings
  >
>;
type _Inventory = Require<
  Exact<
    Awaited<ReturnType<typeof materializeNativeQuestion>>["student"],
    ArtifactFiles
  >
>;
type _Check = Require<
  Exact<NonNullable<Projection["project"]["check"]>, NativeProjectCheck>
>;
// Старый feedback DSL удалён; runtime descriptor получает только действующие поля.
type _NoAuthoredFeedback = Require<
  Exact<
    Extract<"feedback", keyof Parameters<typeof runtimeDescriptor>[0]>,
    never
  >
>;
type _NoRuntimeFeedback = Require<
  Exact<Extract<"feedback", keyof Descriptor>, never>
>;
type _NoProjectedFeedback = Require<
  Exact<
    Extract<
      "feedback",
      keyof Awaited<ReturnType<typeof selectNativeCompilerInputs>>["descriptor"]
    >,
    never
  >
>;
type _Sources = Require<
  Exact<
    Awaited<
      ReturnType<typeof selectNativeCompilerInputs>
    >["sources"][number]["name"],
    string
  >
>;
type _References = Require<
  Exact<
    Projection["project"]["references"][number]["sources"][number]["data"],
    string
  >
>;

// Выдача получает текущие bytes и обязательный студенческий комплект.
import type { exportCourse } from "../_extensions/course-prairielearn/application/export-course.ts";
import type { ArtifactFile } from "course-core/public.ts";
type ExportInput = Parameters<typeof exportCourse>[0];
type _ArtifactFields = Require<
  Exact<keyof ArtifactFile, "target" | "audience" | "reason" | "bytes">
>;
type _RequiredNativeBytes = Require<
  undefined extends ExportInput["nativeInputs"] ? false : true
>;
type _RequiredStudentArtifact = Require<
  undefined extends ExportInput["studentArtifact"] ? false : true
>;
type _RequiredContent = Require<
  undefined extends ExportInput["content"] ? false : true
>;
