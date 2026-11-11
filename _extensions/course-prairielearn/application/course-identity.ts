import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
async function identityImplementation(
  name: string,
  namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
) {
  const ns = Uint8Array.from(
    namespace.replaceAll("-", "").match(/../g) ?? [],
    (x) => parseInt(x, 16),
  );
  const bytes = new Uint8Array([...ns, ...new TextEncoder().encode(name)]);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes)).slice(
    0,
    16,
  );
  const version = h.at(6), variant = h.at(8);
  if (version === undefined || variant === undefined) {
    throw Error("PL UUID digest too short");
  }
  h[6] = (version & 15) | 80;
  h[8] = (variant & 63) | 128;
  const hex = [...h].map((x) => x.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
export const identity = __metrics.wrapAsync({
  id: "course-prairielearn.application.export-course.identity",
  kind: "phase",
}, identityImplementation);
