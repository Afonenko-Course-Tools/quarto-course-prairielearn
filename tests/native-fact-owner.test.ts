// Чистые data controls; не Core operation/assignment/P authority.
import { strict as assert } from "node:assert";
import * as Provenance from "../_extensions/course-prairielearn/application/native-provenance.ts";
import { decodeNativeCheck } from "../_extensions/course-prairielearn/application/native-checks.ts";
import * as Core from "course-core/public.ts";
import type {
  NativeOperationIdentity,
  NativeProjectFact,
} from "course-core/public.ts";
const policy = {
  defaults: {
    runtime: "java25-junit-v1",
    tests: ["tests/*.java"],
    scoring: { mode: "weighted" },
  },
  "source-profiles": {
    main: {
      mode: "implementation",
      root: "src/main/java",
      include: ["**/*.java"],
    },
  },
  profiles: { native: { "source-profile": "main" } },
};
const fact: NativeProjectFact = {
  exerciseId: "exr-hidden",
  source: "hidden.qmd",
  projectRoot: "projects/p",
  bankMember: false,
  statementVisibility: "restricted",
  artifactPolicy: { full: "full", conditions: false },
  projectCheck: "native",
};
const normalize = Provenance.normalizeNativeProjectFact;
Deno.test("C alone resolves complete hidden/non-PL generic fact with existing typed check canon", () => {
  assert.equal(
    typeof Provenance.normalizeNativeProjectFact,
    "function",
  );
  const { projectCheck: _selector, ...generic } = fact;
  const old = { ...generic, check: decodeNativeCheck(policy, "native") };
  const result = normalize(fact, policy);
  assert.deepEqual(result, old);
  assert.equal(result.bankMember, false);
  assert(!("projectCheck" in result));
  assert.equal(fact.projectCheck, "native");
});
Deno.test("No-check generic fact is unchanged and raw config is not business authority", () => {
  const { projectCheck: _selector, ...generic } = fact;
  assert.deepEqual(normalize(generic, undefined), generic);
  assert.deepEqual(normalize(generic, { unrelated: "data" }), generic);
});
Deno.test("Selector/plane/old-normalization mismatch and unknown fields refuse before projection", () => {
  for (
    const [f, p] of [
      [fact, undefined],
      [fact, null],
      [fact, false],
      [{ ...fact, projectCheck: "" }, policy],
      [{ ...fact, projectCheck: "missing" }, policy],
      [fact, { ...policy, extra: true }],
      [{ ...fact, check: { profile: "foreign" } }, policy],
      [{
        ...fact,
        projectCheck: undefined,
        check: decodeNativeCheck(policy, "native"),
      }, policy],
    ]
  ) assert.throws(() => Reflect.apply(normalize, undefined, [f, p]));
});
Deno.test("nativeProjectWitness сохраняет typed owner normalization и принадлежность проекта", async () => {
  const identity: NativeOperationIdentity = {
    operation: crypto.randomUUID(),
    profiles: [],
    projection: "author",
    runtime: "quarto-1.11.5",
  };
  const expected = { identity, sources: ["hidden.qmd"] };
  const value = {
    schema: "course-native-assignment-provenance-v1",
    identity,
    ownerInputs: ["hidden.qmd"],
    capturedInputs: ["hidden.qmd"],
    projects: [{
      source: "hidden.qmd",
      id: "exr-hidden",
      project: "/projects/p",
      format: "revealjs",
      target: "manual",
    }],
    documents: [{
      source: "hidden.qmd",
      format: "revealjs",
      projects: [fact],
      projectChecks: policy,
      projectMaterializations: {},
    }],
  };
  const w = await Provenance.nativeProjectWitness(Core, value, expected);
  assert.deepEqual(
    w.projects[0].fact.check,
    decodeNativeCheck(policy, "native"),
  );
  assert.equal(w.projects[0].declaration.target, "manual");
  const bad = structuredClone(value);
  bad.documents[0].projects[0].source = "foreign.qmd";
  await assert.rejects(() =>
    Provenance.nativeProjectWitness(Core, bad, expected)
  );
});
