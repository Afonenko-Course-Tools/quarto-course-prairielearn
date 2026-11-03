// Только compiler: настоящий materialization DTO проходит до exporter/writer.
import type { materializeNativeQuestion } from "../_extensions/course-prairielearn/application/native-materialize.ts";
import type {
  exportCourse,
  NativeCompilerInput,
} from "../_extensions/course-prairielearn/application/export-course.ts";
import type {
  ProjectContext,
  StudentArtifact,
} from "../_extensions/course-prairielearn/application/export.ts";
import type { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Exact<A, B> = IsAny<A> extends true ? false
  : IsAny<B> extends true ? false
  : [A, B] extends [B, A] ? true
  : false;
type Require<T extends true> = T;
type Materialized = Awaited<ReturnType<typeof materializeNativeQuestion>>;
type ExportInput = Parameters<typeof exportCourse>[0];

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
  Exact<NativeCompilerInput["descriptor"], ReturnType<typeof runtimeDescriptor>>
>;
