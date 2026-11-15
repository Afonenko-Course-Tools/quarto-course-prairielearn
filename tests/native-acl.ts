import { array, record, required, string } from "./fixture-values.ts";
// Usage: deno run -A tests/native-acl.ts NATIVE_ROOT PINNED_UPSTREAM_RESOLVER_BUNDLE
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [nativeRoot, bundle] = Deno.args;
if (!nativeRoot || !bundle) {
  throw new Error("native-acl.ts NATIVE_ROOT PINNED_UPSTREAM_RESOLVER_BUNDLE");
}
const resolver = record(
  await import(pathToFileURL(bundle).href),
).resolveAccessControl;
if (typeof resolver !== "function")
  throw Error("Upstream resolver отсутствует");
const resolveAccessControl = (input: unknown) => record(resolver(input));
const instance = record(
  JSON.parse(
    await Deno.readTextFile(
      join(nativeRoot, "courseInstances/pilot/infoCourseInstance.json"),
    ),
  ),
);
const delivery = record(
  JSON.parse(await Deno.readTextFile(join(nativeRoot, "delivery.json"))),
);
for await (const entry of Deno.readDir(
  join(nativeRoot, "courseInstances/pilot/assessments"),
)) {
  const info = record(
    JSON.parse(
      await Deno.readTextFile(
        join(
          nativeRoot,
          "courseInstances/pilot/assessments",
          entry.name,
          "infoAssessment.json",
        ),
      ),
    ),
  );
  const rules = array(info.accessControl).map((value, index) => {
    const r = record(value),
      dateControl = record(r.dateControl),
      release = record(dateControl.release),
      due = record(dateControl.due);
    const body = {
      ...r,
      dateControl: {
        ...dateControl,
        release: { date: new Date(string(release.date)) },
        due: {
          date: due.date === null ? null : new Date(string(due.date)),
        },
      },
    };
    Reflect.deleteProperty(body, "uuid");
    Reflect.deleteProperty(body, "labels");
    return index === 0
      ? {
          targetType: "none",
          number: 0,
          rule: { ...body, prairieTestExams: [] },
        }
      : {
          targetType: "student_label",
          number: index,
          rule: body,
          studentLabelIds: array(r.labels).map((value) => {
            const name = string(value);
            const label = array(instance.studentLabels)
              .map(record)
              .find((l) => l.name === name);
            if (!label) throw new Error("missing declared label");
            return string(label.uuid);
          }),
        };
  });
  const base = {
    rules,
    date: new Date("2026-10-10T12:00:00Z"),
    displayTimezone: string(instance.timezone),
    authzMode: "Public",
    courseRole: "None",
    courseInstanceRole: "None",
    prairieTestReservations: [],
  };
  const work = array(delivery.works)
    .map(record)
    .find((w) => w.id === entry.name);
  if (!work) throw new Error("native work missing from manifest");
  if (!work.relatedExercise) {
    if (rules.length !== 1 || record(work.policy).assignment) {
      throw new Error("ordinary lab carries defense ACL");
    }
    for (const labels of [[], ["foreign-label"]]) {
      const result = resolveAccessControl({
        ...base,
        enrollment: {
          enrollmentId: "ordinary-student",
          studentLabelIds: labels,
        },
      });
      if (result.authorization !== "granted" || !result.submittable) {
        throw new Error("joined ordinary Student lab denied");
      }
    }
    console.log(
      "upstream native resolver: ordinary lab available to joined Student without assignment label",
      entry.name,
    );
    continue;
  }
  for (const labels of [[], ["foreign-label"]]) {
    const r = resolveAccessControl({
      ...base,
      enrollment: { enrollmentId: "ordinary-student", studentLabelIds: labels },
    });
    if (r.authorization !== "denied" || r.showBeforeRelease) {
      throw new Error("unassigned student listed or authorized");
    }
  }
  const assigned = resolveAccessControl({
    ...base,
    enrollment: {
      enrollmentId: "ordinary-student",
      studentLabelIds: required(rules[1]).studentLabelIds,
    },
  });
  if (assigned.authorization !== "granted" || !assigned.submittable) {
    throw new Error("assigned ordinary student cannot submit");
  }
  const revoked = resolveAccessControl({
    ...base,
    enrollment: { enrollmentId: "ordinary-student", studentLabelIds: [] },
  });
  if (revoked.authorization !== "denied") {
    throw new Error("revoked label still grants");
  }
  console.log(
    "upstream native resolver: unassigned/foreign/revoked denied, assigned ordinary student granted",
    entry.name,
  );
}
