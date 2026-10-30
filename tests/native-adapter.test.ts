function assert(v: unknown, m: string): asserts v {
  if (!v) throw Error(m);
}
Deno.test("PL public owner business parser validates native Manual and assessment policy", async () => {
  const api: Record<string, any> = await import(
    "../_extensions/course-prairielearn/public.ts"
  );
  assert(
    typeof api.decodeNativeBusiness === "function",
    "PL public native business parser missing",
  );
  const raw = {
    config: {
      "question-defaults": {
        topic: "Git",
        grading: { method: "manual" },
        submission: { mode: "upload" },
      },
      "assessment-defaults": { assignment: { mode: "assessment-id" } },
    },
    assessment: {
      attempts: 1,
      pass: { "at-least": 1 },
      "auto-points": 0,
      "manual-points": 100,
    },
    declarations: [{
      id: "exr-git",
      attributes: { "prairielearn-grading": "manual" },
    }],
  };
  const effective = [{
    id: "exr-git",
    attributes: {
      target: "prairielearn",
      project: "projects/git",
      "prairielearn-grading": "manual",
    },
  }];
  const assessment = {
    id: "sec-git",
    kind: "lab",
    slots: [{
      id: "exr-git",
      selection: "fixed",
      candidates: ["exr-git"],
      assignment: { requirement: "required", workMode: "individual" },
    }],
  };
  const result = api.decodeNativeBusiness(raw, {
    course: { id: "example", adapters: ["prairielearn"] },
    declarations: effective,
    assessment,
  });
  assert(
    result.questions["exr-git"].grading.method === "manual",
    "Manual lost",
  );
  assert(
    result.assessment.assignment["student-label"].startsWith("pl-"),
    "assignment mode not normalized",
  );
  let cross = "";
  try {
    api.decodeNativeBusiness(raw, {
      course: { id: "example", adapters: ["prairielearn"] },
      declarations: effective,
      assessment: {
        ...assessment,
        slots: [{
          ...assessment.slots[0],
          id: "exr-foreign",
          candidates: ["exr-foreign"],
        }],
      },
    });
  } catch (e) {
    cross = String(e);
  }
  assert(
    cross.includes("PL.ASSESSMENT_UNQUALIFIED"),
    "cross-document policy was silently qualified",
  );
  for (
    const patch of [{ assessment: { ...raw.assessment, attempts: 0 } }, {
      assessment: { ...raw.assessment, "manual-points": -1 },
    }, {
      config: {
        ...raw.config,
        "question-defaults": {
          ...raw.config["question-defaults"],
          unknown: true,
        },
      },
    }, {
      declarations: [{
        id: "exr-git",
        attributes: { "prairielearn-submit": "upload" },
      }],
    }]
  ) {
    let rejected = false;
    try {
      api.decodeNativeBusiness({ ...raw, ...patch }, {
        course: { id: "example", adapters: ["prairielearn"] },
        declarations: effective,
        assessment,
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "Malformed native business declaration accepted");
  }
});
Deno.test("PL public native factory exposes executable validator and capture preparation", async () => {
  const api: Record<string, any> = await import(
    "../_extensions/course-prairielearn/public.ts"
  );
  assert(
    typeof api.prepareNativeAdapter === "function" &&
      typeof api.createNativeAdapter === "function",
    "Public native operation adapter missing",
  );
});

Deno.test("native question-defaults Workspace carrier selects upload independently and requires explicit options", async () => {
  const { decodeNativeBusiness } = await import(
    "../_extensions/course-prairielearn/public.ts"
  );
  const config = {
    "question-defaults": {
      topic: "Git",
      grading: { method: "manual" },
      submission: {
        mode: "workspace",
        workspaceOptions: {
          image: "example.invalid/fixture@sha256:" + "0".repeat(64),
          home: "/workspace",
          port: "8080",
          gradedFiles: [
            "work/**",
            "work/.git/**",
            "work/.*",
            "explanation.m[d]",
            ".pl-seed/identity.jso[n]",
          ],
        },
      },
    },
  };
  const declarations = ["upload", "workspace"].map((mode, i) => ({
    id: "exr-native-" + i,
    attributes: { "prairielearn-submission": mode },
  }));
  const result = decodeNativeBusiness({ config, declarations }, {
    course: { adapters: ["prairielearn"] },
    declarations,
  });
  assert(
    result.questions["exr-native-0"].submission.mode === "upload",
    "upload inherited Workspace fields",
  );
  assert(
    Object.keys(result.questions["exr-native-0"].submission).join(",") ===
      "mode",
    "upload variant is not closed",
  );
  assert(
    result.questions["exr-native-1"].submission.mode === "workspace" &&
      result.questions["exr-native-1"].submission.workspaceOptions.port ===
        8080,
    "explicit native options lost",
  );
  const broken = structuredClone(config);
  delete (broken["question-defaults"].submission as any).workspaceOptions;
  let refused = false;
  try {
    decodeNativeBusiness({ config: broken, declarations }, {
      course: { adapters: ["prairielearn"] },
      declarations,
    });
  } catch {
    refused = true;
  }
  assert(refused, "Workspace options guessed");
});

Deno.test("PL native project-check canon rejects malformed runtime and path policies", async () => {
  const { decodeNativeCheck } = await import(
    "../_extensions/course-prairielearn/public.ts"
  );
  const base = {
    defaults: { runtime: "java25-junit-v1", scoring: { mode: "all-pass" } },
    "source-profiles": {
      main: {
        mode: "implementation",
        root: "student/src/main/java",
        include: ["**/*.java"],
      },
    },
    profiles: {
      main: { "source-profile": "main", tests: ["tests/**/*.java"] },
    },
  };
  const parsed = decodeNativeCheck(base, "main");
  assert(parsed.sourceProfile.mode === "implementation", "source profile lost");
  for (
    const patch of [
      { tests: ["../foreign/*.java"] },
      { limits: { networking: true } },
      { limits: { "run-seconds": -1 } },
      { runtime: "java25-gradle-junit-v1" },
      { "api-precheck": { files: ["tests/Api.java"], entry: "bad;entry" } },
      {
        "additional-java-sources": {
          archive: "extra.zip",
          "max-files": 129,
          "max-file-bytes": 1,
          "max-total-bytes": 1,
          "max-archive-bytes": 1,
        },
      },
      { scoring: { mode: "threshold", basis: "unknown", value: 1 } },
      { unknown: true },
    ]
  ) {
    let error = "";
    try {
      decodeNativeCheck({
        ...base,
        profiles: { main: { ...base.profiles.main, ...patch } },
      }, "main");
    } catch (e) {
      error = String(e);
    }
    assert(
      Boolean(error),
      "malformed native project-check accepted: " + JSON.stringify(patch),
    );
  }
});
