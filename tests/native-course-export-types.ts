// Только compiler: настоящий materialization DTO проходит до exporter/writer.
import type { materializeNativeQuestion } from "../_extensions/course-prairielearn/application/native-materialize.ts";
import type {
  exportCourse,
  NativeCompilerInput,
  ExportCourseContent,
} from "../_extensions/course-prairielearn/application/export-course.ts";
import type {
  ProjectContext,
  StudentArtifact,
} from "../_extensions/course-prairielearn/application/export.ts";
import type { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";
import type { NativeProjectCheck } from "../_extensions/course-prairielearn/application/native-checks.ts";

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
type Materialized = Awaited<ReturnType<typeof materializeNativeQuestion>>;
type ExportInput = Parameters<typeof exportCourse>[0];
type _NormalizedCourseCheck = Require<
  Exact<
    NonNullable<ExportCourseContent["projects"]>[number]["check"],
    NativeProjectCheck | undefined
  >
>;

declare const materialized: Materialized;
declare const selection: NonNullable<Materialized["selection"]>;
const artifact: StudentArtifact = materialized;
const compilerInput: NativeCompilerInput = selection;
void artifact;
void compilerInput;

type _CourseArtifact = Require<
  Exact<
    Awaited<ReturnType<NonNullable<ExportInput["studentArtifact"]>>>,
    StudentArtifact
  >
>;
type _WriterArtifact = Require<
  Exact<
    NonNullable<ProjectContext["studentArtifacts"]>[string],
    StudentArtifact
  >
>;
type _Files = Require<
  Materialized["files"] extends StudentArtifact["files"] ? true : false
>;
type _FileBytes = Require<
  IsAny<Materialized["files"][number]["bytes"]> extends false ? true : false
>;
type _Archive = Require<
  Exact<StudentArtifact["archive"], Materialized["archive"]>
>;
type _NativeBytes = Require<
  Exact<
    NonNullable<
      ExportInput["nativeInputs"]
    >[string]["sources"][number]["bytes"],
    NonNullable<Materialized["selection"]>["sources"][number]["bytes"]
  >
>;
type _NativeDescriptor = Require<
  Exact<
    NativeCompilerInput["descriptor"],
    ReturnType<typeof runtimeDescriptor<NativeProjectCheck>>
  >
>;

// Ordinary publication сохраняет реальные decoded scalar/policy types, без any.
import type {
  NativeAdapterValidationInput,
  NativePublication,
} from "course-core/public.ts";
import type { PublicationInspection } from "../_extensions/course-prairielearn/public.ts";
import type {
  NativeBusinessInput,
  AssessmentPolicySchema,
} from "../_extensions/course-prairielearn/application/native-business.ts";
import type { Submission } from "../_extensions/course-prairielearn/application/submission.ts";
type PublicationBusiness =
  PublicationInspection["documents"][number]["business"];
type PublicationQuestion = PublicationBusiness["questions"][string];
type _PublicationPolicy = Require<
  Exact<
    PublicationBusiness["assessment"],
    ReturnType<typeof AssessmentPolicySchema.parse> | undefined
  >
>;
type _PublicationTopic = Require<
  Exact<PublicationQuestion["topic"], string | undefined>
>;
type _PublicationSubmission = Require<
  Exact<PublicationQuestion["submission"], Submission | undefined>
>;
type _PublicationGrading = Require<
  Exact<
    PublicationQuestion["grading"]["method"],
    "external" | "manual" | "mixed"
  >
>;
type _BusinessConsumedInput = Require<
  NativeAdapterValidationInput extends NativeBusinessInput ? true : false
>;
type _PublicationInput = Require<
  Exact<
    ReturnType<NativePublication["adapterInputs"]>[number],
    NativeAdapterValidationInput
  >
>;

// Реальная Native body цепочка: Exact отклоняет any, одной assignability мало.
import type {
  NativeOperation,
  NativeAssignmentDelivery,
  NativeAssignmentRequest,
  NativeAssignmentDeliveryOptions,
} from "course-core/public.ts";
import type {
  PublicBodyPackage,
  BodyResource,
} from "course-core/body-export/model.ts";
import type { createNativeAdapter } from "../_extensions/course-prairielearn/application/native-adapter.ts";
import type {
  prepareNativeCourse,
  withNativeAssignments,
  withNativeProjectPlans,
} from "../_extensions/course-prairielearn/application/native-course.ts";
import type { exportPrairieLearn } from "../_extensions/course-prairielearn/application/export.ts";
type Adapter = ReturnType<typeof createNativeAdapter>;
type Delivered = Awaited<ReturnType<Adapter["assignmentDelivery"]>>;
type PreparedBodies = Parameters<
  Parameters<typeof withNativeAssignments>[1]
>[0];
type _CourseOperation = Require<
  Exact<Parameters<typeof prepareNativeCourse>[0]["operation"], NativeOperation>
>;
type _CompositionOperation = Require<
  Exact<
    Parameters<typeof withNativeAssignments>[0]["operation"],
    NativeOperation
  >
>;
type _ProjectOperation = Require<
  Exact<Parameters<typeof withNativeProjectPlans>[5], NativeOperation>
>;
type _AdapterOperation = Require<
  Exact<Parameters<Adapter["assignmentDelivery"]>[0], NativeOperation>
>;
type _AdapterRequest = Require<
  Exact<Parameters<Adapter["assignmentDelivery"]>[1], NativeAssignmentRequest>
>;
type _AdapterOptions = Require<
  Exact<
    Parameters<Adapter["assignmentDelivery"]>[2],
    NativeAssignmentDeliveryOptions
  >
>;
type _CoreDelivery = Require<
  Exact<Delivered["delivery"], NativeAssignmentDelivery>
>;
type _AdapterPackage = Require<
  Exact<Delivered["publicPackage"], PublicBodyPackage>
>;
type _CompositionPackage = Require<
  Exact<
    PreparedBodies["deliveries"][number]["publicPackage"],
    PublicBodyPackage
  >
>;
type _InputBody = Require<
  Exact<Awaited<ReturnType<ExportInput["body"]>>, PublicBodyPackage>
>;
type _ExporterPackage = Require<
  Exact<Parameters<typeof exportPrairieLearn>[0], PublicBodyPackage>
>;
type _BodyResource = Require<
  Exact<
    Awaited<ReturnType<ExportInput["body"]>>["resources"][number],
    BodyResource
  >
>;
