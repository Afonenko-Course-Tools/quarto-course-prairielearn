import { required } from "./fixture-values.ts";
// Чистые data controls; не Core operation/assignment/P authority.
import { strict as assert } from "node:assert";
import * as Provenance from "../_extensions/course-prairielearn/application/native-provenance.ts";
import { decodeNativeCheck } from "../_extensions/course-prairielearn/application/native-checks.ts";
import {
  assertNativeChecksCoverage,
  withNativeProjectPlans,
} from "../_extensions/course-prairielearn/application/native-course.ts";
import type { NativeCheckProject } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import type {
  NativeAssignmentProvenance,
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
Deno.test(
  "C alone resolves complete hidden/non-PL generic fact with existing typed check canon",
  () => {
    assert.equal(typeof Provenance.normalizeNativeProjectFact, "function");
    const { projectCheck: _selector, ...generic } = fact;
    const expected = { ...generic, check: decodeNativeCheck(policy, "native") };
    const result = normalize(fact, policy);
    assert.deepEqual(result, expected);
    assert.equal(result.bankMember, false);
    assert(!("projectCheck" in result));
    assert.equal(fact.projectCheck, "native");
  },
);
Deno.test(
  "No-check generic fact is unchanged and raw config is not business authority",
  () => {
    const { projectCheck: _selector, ...generic } = fact;
    assert.deepEqual(normalize(generic, undefined), generic);
    assert.deepEqual(normalize(generic, { unrelated: "data" }), generic);
  },
);
Deno.test(
  "Selector/raw-plane mismatch and unknown fields refuse before projection",
  () => {
    for (const [f, p] of [
      [fact, undefined],
      [fact, null],
      [fact, false],
      [{ ...fact, projectCheck: "" }, policy],
      [{ ...fact, projectCheck: "missing" }, policy],
      [fact, { ...policy, extra: true }],
    ])
      assert.throws(() => Reflect.apply(normalize, undefined, [f, p]));
  },
);
Deno.test(
  "typed project rows сохраняют hidden/non-PL normalization и safe project paths",
  async () => {
    const value: NativeAssignmentProvenance = {
      documents: [
        {
          source: "hidden.qmd",
          format: "revealjs",
          projects: [fact],
          projectChecks: policy,
        },
      ],
    };
    const rows = Provenance.nativeProjectRows(value);
    assert.deepEqual(
      required(rows[0]).fact.check,
      decodeNativeCheck(policy, "native"),
    );
    assert.equal(required(rows[0]).format, "revealjs");
    assert.equal(required(rows[0]).fact.bankMember, false);
    const checked: NativeCheckProject = {
      ...fact,
      qualifiedId: "course/exr-hidden",
      check: decodeNativeCheck(policy, "native"),
      sources: [],
      trustedTests: [],
      verificationTests: [],
      references: [],
      contractFixtures: [],
      readiness: { ready: true, missing: [] },
    };
    // Чистая проверка покрытия: не утверждает наличие проверенных native bytes.
    assertNativeChecksCoverage(rows, [checked]);
    assert.throws(
      () => assertNativeChecksCoverage(rows, []),
      /PL.NATIVE_CHECKS_SCOPE_INCOMPLETE/,
    );
    assert.throws(
      () => assertNativeChecksCoverage(rows, [checked, checked]),
      /PL.NATIVE_CHECKS_SCOPE_INCOMPLETE/,
    );
    const bad = structuredClone(value);
    required(required(bad.documents[0]).projects[0]).projectRoot = "../private";
    assert.throws(
      () => Provenance.nativeProjectRows(bad),
      /PL.PROJECT_INVALID/,
    );
    // Synthetic malformed callback data проверяют реальные отказы до acquisition;
    // такой объект не считается genuine operation/A1 положительным случаем.
    for (const [groups, code] of [
      [[], "A1 group coverage"],
      [[{ contexts: [] }], "A1 context coverage"],
      [[{ contexts: [{ input: "/foreign" }] }], "A1 input order"],
    ] as const) {
      await assert.rejects(
        () =>
          Reflect.apply(withNativeProjectPlans, undefined, [
            {},
            "/owner",
            [],
            rows,
            () => {
              throw Error("Unexpected plan callback");
            },
            {
              withProjectContracts: (
                _requests: unknown,
                use: (batch: unknown) => unknown,
              ) => use({ groups }),
            },
          ]),
        new RegExp(code),
      );
    }
  },
);

Deno.test(
  "checks map parses once per provenance source, with independent owner policies",
  async () => {
    const { NativeProjectChecksSchema } =
      await import("../_extensions/course-prairielearn/application/native-checks.ts");
    const parse = NativeProjectChecksSchema.parse;
    let calls = 0;
    NativeProjectChecksSchema.parse = (...args) => {
      calls++;
      return parse(...args);
    };
    try {
      const second = structuredClone(policy);
      second.defaults.scoring.mode = "all-pass";
      const input: NativeAssignmentProvenance = {
        documents: [
          {
            source: "one.qmd",
            format: "html",
            projectChecks: policy,
            projects: [fact, { ...fact, exerciseId: "exr-second" }],
          },
          {
            source: "nested/two.qmd",
            format: "html",
            projectChecks: second,
            projects: [{ ...fact, source: "nested/two.qmd" }],
          },
        ],
      };
      const before = structuredClone(input);
      const rows = Provenance.nativeProjectRows(input);
      assert.equal(calls, 2, "whole map was reparsed for each project");
      assert.equal(required(rows[0]).fact.check?.scoring.mode, "weighted");
      assert.equal(required(rows[2]).fact.check?.scoring.mode, "all-pass");
      assert.deepEqual(input, before);
      const malformed = structuredClone(input);
      required(malformed.documents[1]).projectChecks = {
        ...second,
        profiles: { ...second.profiles, unrelated: { unknown: true } },
      };
      assert.throws(() => Provenance.nativeProjectRows(malformed));
    } finally {
      NativeProjectChecksSchema.parse = parse;
    }
  },
);
