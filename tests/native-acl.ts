// Usage: deno run -A tests/native-acl.ts NATIVE_ROOT PINNED_UPSTREAM_RESOLVER_BUNDLE
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [nativeRoot, bundle] = Deno.args;
if (!nativeRoot || !bundle) {
  throw new Error("native-acl.ts NATIVE_ROOT PINNED_UPSTREAM_RESOLVER_BUNDLE");
}
const { resolveAccessControl } = await import(pathToFileURL(bundle).href);
const instance = JSON.parse(
  await Deno.readTextFile(
    join(nativeRoot, "courseInstances/pilot/infoCourseInstance.json"),
  ),
);
for await (
  const entry of Deno.readDir(
    join(nativeRoot, "courseInstances/pilot/assessments"),
  )
) {
  const info = JSON.parse(
    await Deno.readTextFile(
      join(
        nativeRoot,
        "courseInstances/pilot/assessments",
        entry.name,
        "infoAssessment.json",
      ),
    ),
  );
  const rules = info.accessControl.map((r: any, index: number) => {
    const body: any = {
      ...r,
      dateControl: {
        ...r.dateControl,
        release: { date: new Date(r.dateControl.release.date) },
        due: {
          date: r.dateControl.due.date === null
            ? null
            : new Date(r.dateControl.due.date),
        },
      },
    };
    delete body.uuid;
    delete body.labels;
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
        studentLabelIds: r.labels.map((name: string) => {
          const label = instance.studentLabels.find((l: any) =>
            l.name === name
          );
          if (!label) throw new Error("missing declared label");
          return label.uuid;
        }),
      };
  });
  const base = {
    rules,
    date: new Date("2026-10-10T12:00:00Z"),
    displayTimezone: instance.timezone,
    authzMode: "Public",
    courseRole: "None",
    courseInstanceRole: "None",
    prairieTestReservations: [],
  };
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
      studentLabelIds: rules[1].studentLabelIds,
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
