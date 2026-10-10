import { closed } from "./declarations.ts";
export function normalizeDiscovery(value: any = {}) {
  closed(value, [], ["min-executed", "allow-skipped"]);
  const merged = { "min-executed": 1, "allow-skipped": false, ...value };
  if (
    !Number.isInteger(merged["min-executed"]) || merged["min-executed"] < 1 ||
    typeof merged["allow-skipped"] !== "boolean"
  ) throw new Error("PL discovery invalid");
  return merged;
}
