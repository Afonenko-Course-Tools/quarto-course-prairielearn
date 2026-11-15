import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
async function uuidImplementation(key: string): Promise<string> {
  // UUIDv5 DNS namespace; identity is course/exercise, never a source path.
  const ns = new Uint8Array([
    0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0,
    0x4f, 0xd4, 0x30, 0xc8,
  ]);
  const name = new TextEncoder().encode("quarto-course-prairielearn:" + key),
    bytes = new Uint8Array(ns.length + name.length);
  bytes.set(ns);
  bytes.set(name, ns.length);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes)).slice(
    0,
    16,
  );
  const version = h.at(6),
    variant = h.at(8);
  if (version === undefined || variant === undefined) {
    throw Error("PL UUID digest too short");
  }
  h[6] = (version & 15) | 80;
  h[8] = (variant & 63) | 128;
  const hex = Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
export const uuid = __metrics.wrapAsync(
  {
    id: "course-prairielearn.application.export.uuid",
    kind: "phase",
  },
  uuidImplementation,
);
