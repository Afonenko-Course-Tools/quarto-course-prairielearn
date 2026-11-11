import type { AnswerFacts } from "course-core/public.ts";
import type { NativeAuxiliary } from "./native-auxiliary.ts";
import type { PublicationCondition } from "./publication-conditions.ts";
export interface StudentArtifact {
  files: { name: string; bytes: Uint8Array; reason?: string }[];
  archive: Uint8Array;
}
export interface ProjectContext {
  deferPublish?: boolean;
  nativeBody?: boolean | undefined;
  nativeAuxiliary?: NativeAuxiliary | undefined;
  nativeAnswers?: Record<string, AnswerFacts> | undefined;
  projectRoot: string;
  projects: Record<string, string>;
  publicationConditions?: Record<string, PublicationCondition>;
  studentArtifacts?: Record<string, StudentArtifact>;
}
