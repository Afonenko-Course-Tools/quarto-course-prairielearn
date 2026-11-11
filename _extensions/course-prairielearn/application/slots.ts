import type { NativeAdapterValidationInput } from "course-core/public.ts";
import { createMetrics } from "../observability/bridge.ts";
import { closed } from "./declarations.ts";
import type { GradingPolicy, NativeSlotPoints } from "./grading-policy.ts";

const metrics = createMetrics("course-prairielearn");
type Assessment = NonNullable<NativeAdapterValidationInput["assessment"]>;
export type AssessmentSlot = Assessment["slots"][number];
export type SlotWork = Pick<Assessment, "id"> & { slots: unknown; title?: string };

function candidateList(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 4096) return false;
  const members: unknown[] = value;
  for (const member of members) if (typeof member !== "string") return false;
  return true;
}

function validateSlotAssignment(value: unknown, selection: unknown) {
  const assignment = closed(value, ["requirement", "workMode"], ["stage"]);
  if (
    selection === "choice" && assignment.requirement !== "required" ||
    assignment.requirement !== "required" &&
      assignment.requirement !== "optional" ||
    assignment.workMode !== "individual" && assignment.workMode !== "pair" &&
      assignment.workMode !== "group" ||
    assignment.stage !== undefined && assignment.stage !== "demonstration" &&
      assignment.stage !== "classroom" && assignment.stage !== "homework"
  ) {
    throw Error("PL.SLOTS_INVALID: invalid assignment");
  }
}
function assertSlots(value: unknown, courseId: string, workId: string, qualified: boolean): asserts value is AssessmentSlot[] {
  if (!Array.isArray(value) || !value.length || value.length > 4096) throw Error("PL.SLOTS_INVALID: required slots v2");
  const slots: unknown[] = value;
  const ids = new Set<string>(), candidates = new Set<string>();
  const exr = new RegExp(qualified ? `^${courseId}/exr-[a-z0-9][a-z0-9-]*$` : "^exr-[a-z0-9][a-z0-9-]*$");
  for (const value of slots) {
    const slot = closed(value, ["id", "selection", "candidates", "assignment"]);
    const id = slot.id;
    const local = typeof id === "string" ? qualified ? id.replace(courseId + "/" + workId + "/", "") : id : "";
    if (!candidateList(slot.candidates)) throw Error("PL.SLOTS_INVALID: invalid candidate set");
    const members = slot.candidates;
    const first = members[0];
    if (typeof id !== "string" || qualified && !id.startsWith(courseId + "/" + workId + "/") || ids.has(id) ||
      members.some((member) => !exr.test(member) || candidates.has(member)) || new Set(members).size !== members.length ||
      slot.selection === "fixed" && (members.length !== 1 || typeof first !== "string" || local !== first.split("/").at(-1)) ||
      (slot.selection === "random" || slot.selection === "choice") && (!/^alt-[a-z0-9][a-z0-9-]*$/.test(local) || members.length < 2) ||
      slot.selection !== "fixed" && slot.selection !== "random" && slot.selection !== "choice") {
      throw Error("PL.SLOTS_INVALID: invalid identity, selection or candidate set");
    }
    ids.add(id);
    for (const member of members) candidates.add(member);
    validateSlotAssignment(slot.assignment, slot.selection);
  }
}
export const validateSlots = metrics.wrapSync({ id: "course-prairielearn.application.slots.validateSlots", kind: "phase" },
  function validateSlots(slots: unknown, courseId: string, workId: string, qualified: boolean = false): AssessmentSlot[] {
    assertSlots(slots, courseId, workId, qualified);
    return slots;
  });
export const qualifiedSlots = metrics.wrapSync({ id: "course-prairielearn.application.slots.qualifiedSlots", kind: "phase" },
  function qualifiedSlots(courseId: string, work: SlotWork): AssessmentSlot[] {
    return validateSlots(work.slots, courseId, work.id).map((slot) => ({
      ...slot, id: courseId + "/" + work.id + "/" + slot.id, candidates: slot.candidates.map((id) => courseId + "/" + id),
    }));
  });
type NativeQuestion = NativeSlotPoints & { id: string; preferences: { courseRequirement: "required" | "optional" }; numberChoose?: never; alternatives?: never };
type NativeBlock = NativeQuestion | (NativeSlotPoints & { numberChoose: 1; alternatives: { id: string; preferences: NativeQuestion["preferences"] }[]; id?: never; preferences?: never });
function nativePoints(grading: GradingPolicy, slotId: string): NativeSlotPoints {
  const points = grading.slots[slotId];
  if (points === undefined) throw Error("PL.GRADING_INVALID: отсутствуют native points для " + slotId);
  return points;
}
export const nativeSlotBlocks = metrics.wrapSync({ id: "course-prairielearn.application.slots.nativeSlotBlocks", kind: "phase" },
  function nativeSlotBlocks(courseId: string, work: SlotWork, grading: GradingPolicy): NativeBlock[] {
    return validateSlots(work.slots, courseId, work.id).map((slot): NativeBlock => {
      if (slot.selection === "choice") throw Error("PL.SLOTS_INVALID: choice requires nativeSlotZones");
      const preferences = { courseRequirement: slot.assignment.requirement };
      const points = nativePoints(grading, slot.id);
      return slot.selection === "random"
        ? { numberChoose: 1, alternatives: slot.candidates.map((id) => ({ id: courseId + "/" + id, preferences })), ...points }
        : { id: courseId + "/" + slot.candidates[0], ...points, preferences };
    });
  });
type NativeZone = { title: string | undefined; questions: NativeBlock[]; bestQuestions?: number; numberChoose?: never };
/** Choice — отдельная видимая best-one зона; обычные блоки сохраняют семантику. */
export const nativeSlotZones = metrics.wrapSync({ id: "course-prairielearn.application.slots.nativeSlotZones", kind: "phase" },
  function nativeSlotZones(courseId: string, work: SlotWork, grading: GradingPolicy): NativeZone[] {
    const slots = validateSlots(work.slots, courseId, work.id), zones: NativeZone[] = [];
    let regular: AssessmentSlot[] = [];
    const flush = () => {
      const first = regular[0];
      if (first !== undefined) {
        zones.push({ title: first.assignment.requirement === "optional" ? "Добровольные задания" : work.title,
          questions: nativeSlotBlocks(courseId, { ...work, slots: regular }, grading) });
        regular = [];
      }
    };
    for (const slot of slots) {
      if (slot.selection !== "choice") {
        const first = regular[0];
        if (first !== undefined && first.assignment.requirement !== slot.assignment.requirement) flush();
        regular.push(slot);
        continue;
      }
      flush();
      const points = nativePoints(grading, slot.id);
      zones.push({ title: "Выполните одну из задач", bestQuestions: 1,
        questions: slot.candidates.map((id) => ({ id: courseId + "/" + id, ...points, preferences: { courseRequirement: slot.assignment.requirement } })) });
    }
    flush();
    return zones;
  });
