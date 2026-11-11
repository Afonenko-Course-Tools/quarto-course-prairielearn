import type { PublicBodyPackage } from "course-core/public.ts";
import type { ProjectContext } from "./export-types.ts";
import { planSelectedExport } from "./selected-export-plan.ts";
import { questionArtifacts } from "./question-artifacts.ts";
import { OwnedExportOutput } from "./export-output.ts";
export type { ProjectContext, StudentArtifact } from "./export-types.ts";
export { publicProjectFiles } from "./export-files.ts";
export { renderPublicBody } from "./public-body-render.ts";
export { uuid } from "./export-identity.ts";
import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
type PreparedPrairieLearn = {
  publish(): Promise<void>;
  discard(): Promise<void>;
};
export function exportPrairieLearn(
  p: PublicBodyPackage,
  context: ProjectContext & { deferPublish: true },
  binding: unknown,
  output: string,
): Promise<PreparedPrairieLearn>;
export function exportPrairieLearn(
  p: PublicBodyPackage,
  context: ProjectContext & { deferPublish?: false | undefined },
  binding: unknown,
  output: string,
): Promise<void>;
export function exportPrairieLearn(
  p: PublicBodyPackage,
  context: ProjectContext,
  binding: unknown,
  output: string,
): Promise<void | PreparedPrairieLearn>;
export async function exportPrairieLearn(
  p: PublicBodyPackage,
  context: ProjectContext,
  binding: unknown,
  output: string,
): Promise<void | PreparedPrairieLearn> {
  return await observedPrairieLearn(p, context, binding, output);
}
async function preparePrairieLearn(
  p: PublicBodyPackage,
  context: ProjectContext,
  binding: unknown,
  output: string,
): Promise<void | { publish(): Promise<void>; discard(): Promise<void> }> {
  const plan = await planSelectedExport(p, context, binding);
  const owned = await OwnedExportOutput.create(
    output,
    context.nativeAuxiliary?.environment,
  );
  try {
    const artifacts = await questionArtifacts(plan);
    await owned.writeFiles(artifacts.files);
    await owned.writeJson("delivery.json", {
      course: p.owner,
      release: p.release,
      works: p.works,
      questions: artifacts.keys,
    });
    if (context.deferPublish) {
      return {
        publish: () => owned.publish(),
        discard: () => owned.discard(),
      };
    }
    await owned.publish();
  } catch (error) {
    await owned.discardAfterFailure();
    throw error;
  }
}

const observedPrairieLearn = __metrics.wrapAsync({
  id: "course-prairielearn.application.export.exportPrairieLearn",
  kind: "phase",
}, preparePrairieLearn);
