import type * as CorePublic from "course-core/public.ts";
import { pathToFileURL } from "node:url";
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
/** Installed providers are executable trusted code. Check their consumed public surface
 * before assigning signatures from the qualified source dependency. */
function coreProvider(value: unknown): value is typeof CorePublic {
  if (!record(value)) return false;
  const functions = [
    "withNativeCaptureScope",
    "withCurrentNativeOperation",
    "withPendingNativeOperation",
    "withNativePublication",
    "planProject",
    "materializationClosure",
    "materializeProject",
  ] satisfies (keyof typeof CorePublic)[];
  const schemas = [
    "NativeAdapterValidationInputSchema",
    "ArtifactFilesSchema",
    "ArtifactFileSchema",
    "ProjectPlanSchema",
    "NativeOperationIdentitySchema",
    "NativePreparedOperationSchema",
  ] satisfies (keyof typeof CorePublic)[];
  return (
    functions.every((key) => typeof value[key] === "function") &&
    schemas.every((key) => {
      const schema = value[key];
      return record(schema) && typeof schema.parse === "function";
    })
  );
}
export async function installedCore(path: string): Promise<typeof CorePublic> {
  const value: unknown = await import(pathToFileURL(path).href);
  if (!coreProvider(value)) {
    throw Error(
      "PL.PUBLIC_API_REQUIRED: installed Core public functions/schemas",
    );
  }
  return value;
}

type CaptureProvider = Pick<typeof CorePublic, "withNativeCaptureScope">;
function captureProvider(value: unknown): value is CaptureProvider {
  return record(value) && typeof value.withNativeCaptureScope === "function";
}
/** Initial admission needs only capture. Remaining APIs are checked when reached,
 * so a capture failure retains its original diagnostic and cause. */
export async function installedCapture(path: string): Promise<CaptureProvider> {
  const value: unknown = await import(pathToFileURL(path).href);
  if (!captureProvider(value)) {
    throw Error(
      "PL.PUBLIC_API_REQUIRED: installed Core withNativeCaptureScope",
    );
  }
  return value;
}

type PublicationProvider = Pick<typeof CorePublic, "withNativePublication">;
function publicationProvider(value: unknown): value is PublicationProvider {
  return record(value) && typeof value.withNativePublication === "function";
}
/** Inspection consumes publication only; project/grading APIs do not belong to
 * this admission stage and must not replace the public publication refusal. */
export async function installedPublication(
  path: string,
): Promise<PublicationProvider> {
  const value: unknown = await import(pathToFileURL(path).href);
  if (!publicationProvider(value)) {
    throw Error("PL.PUBLIC_API_REQUIRED: installed Core withNativePublication");
  }
  return value;
}
