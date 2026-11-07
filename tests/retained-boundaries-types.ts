import { checkedJSON, publicExtension } from "../_extensions/course-prairielearn/application/native-materialize.ts";
import { readNativeEntryCandidate } from "../_extensions/course-prairielearn/application/native-entry.ts";
import { nativeWorkspaceArtifact } from "../_extensions/course-prairielearn/application/native-workspace.ts";
import { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";
import { exportCourse } from "../_extensions/course-prairielearn/application/export-course.ts";

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Assert<T extends true> = T;
type NotAny<T> = IsAny<T> extends true ? false : true;
type JSONInput = Awaited<ReturnType<typeof checkedJSON>>["value"];
type Candidate = Awaited<ReturnType<typeof readNativeEntryCandidate>>;
type Workspace = Awaited<ReturnType<typeof nativeWorkspaceArtifact>>;
type Course = Awaited<ReturnType<typeof exportCourse>>;
export type RetainedBoundaryChecks = [
  Assert<NotAny<JSONInput>>,
  Assert<NotAny<Candidate["identity"]>>,
  Assert<NotAny<Candidate["identity"]["operation"]>>,
  Assert<NotAny<Workspace["initial"]>>,
  Assert<NotAny<Awaited<ReturnType<typeof publicExtension>>>>,
  Assert<NotAny<Course>>,
  Assert<NotAny<ReturnType<typeof runtimeDescriptor>["sourceFiles"]>>,
];
