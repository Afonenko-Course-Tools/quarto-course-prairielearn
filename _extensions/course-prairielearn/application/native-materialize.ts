import type { NativeAuxiliary } from "./native-auxiliary.ts";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { applicationJavaTarget, describeSubmission, fileSubmission } from "./submission.ts";
import { projectNativeChecks } from "./native-check-projection.ts";
import type { CheckedNativeProjectFact } from "./native-check-projection.ts";
import type * as CorePublic from "course-core/public.ts";
import type {
  ArtifactFiles,
  MaterializableCondition,
  MaterializationBindings,
  NativeAssignmentProjectPlans,
  NativeOperation,
  ProjectPlan,
  SubmissionInstructions,
} from "course-core/public.ts";
import type { createNativeAdapter } from "./native-adapter.ts";
import type { question } from "./declarations.ts";
import type { RuntimeProfile } from "./runtime-descriptor.ts";
export async function publicExtension(owner: string, name: string) {
  for (
    const root of [
      join(owner, "_extensions", name),
      join(owner, "_extensions/Afonenko-Course-Tools", name),
    ]
  ) {
    try {
      const p = join(root, "public.ts");
      if (await Deno.realPath(p) === p && (await Deno.lstat(p)).isFile) {
        return await import(pathToFileURL(p).href);
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  throw Error("PL.PUBLIC_API_REQUIRED: installed " + name + "/public.ts");
}
/** Обычное чтение JSON-конфигурации один раз за операцию. */
export async function checkedJSON(path: string) {
  const canonical = await Deno.realPath(path);
  if (canonical !== resolve(path)) {
    throw Error("PL.INPUT_INVALID: aliased JSON input");
  }
  const bytes = await Deno.readFile(canonical);
  return {
    value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  };
}
export async function nativeReferenceBindings(
  input: {
    owner: string;
    outputDirectory: string;
    book: string;
    config: any;
    operation: Pick<NativeOperation, "catalog">;
  },
) {
  const QRC = await publicExtension(input.owner, "reference-catalog"),
    file = await checkedJSON(
      join(input.outputDirectory, "reference-catalog-local.json"),
    );
  const namespace = input.config["reference-catalog"]?.namespace;
  const site = input.config.website?.["site-url"],
    course = input.config["course-navigation"]?.["course-url"];
  const baseUrl = site ??
    (course
      ? new URL(input.book + "/", course.endsWith("/") ? course : course + "/")
        .href
      : undefined);
  if (typeof namespace !== "string" || !baseUrl) {
    throw Error(
      "PL.REFERENCE_BINDING_REQUIRED: actual namespace/publication base-url",
    );
  }
  const links = input.config["reference-catalog"]?.imports
    ? await QRC.loadBodyLinks({
      catalogFile: join(input.outputDirectory, "reference-catalog-local.json"),
      baseUrl,
      root: input.owner,
      namespace,
      imports: input.config["reference-catalog"].imports,
    })
    : QRC.createBodyLinks({ catalog: file.value, baseUrl });
  const sources = Object.fromEntries(
    input.operation.catalog.documents.map((d) => [d.source, d.output]),
  );
  return {
    QRC,
    catalog: file.value,
    baseUrl,
    sources,
    references: {
      namespace,
      resolve: links.resolve,
      sourceUrl(source: string) {
        if (!sources[source]) {
          throw Error("PL.REFERENCE_BINDING_REQUIRED: native source output");
        }
        return new URL(sources[source], baseUrl).href;
      },
    },
    async bindings(
      Core: Pick<typeof CorePublic, "materializationClosure">,
      plan: ProjectPlan,
      condition: MaterializableCondition,
      submission: SubmissionInstructions,
    ): Promise<MaterializationBindings> {
      const closure = await Core.materializationClosure(plan, condition),
        linksBySource: NonNullable<MaterializationBindings["linksBySource"]> =
          {},
        referencesBySource: NonNullable<
          MaterializationBindings["referencesBySource"]
        > = {};
      for (const fragment of closure.fragments) {
        linksBySource[fragment.source] = QRC.bindConditionLinks({
          context: { input: fragment.source },
          links: fragment.links,
        }, {
          catalog: file.value,
          baseUrl,
          sources,
          resourceLinks: fragment.resources,
        });
        referencesBySource[fragment.source] = {};
        for (const ref of fragment.references) {
          referencesBySource[fragment.source][ref.token] = await links.resolve(
            ref.key,
            ref.style,
            fragment.source,
          );
        }
      }
      return { linksBySource, referencesBySource, submission };
    },
  };
}
/** Genuine Core calls remain inside the live A1 + native operation callback. */
export async function materializeNativeQuestion(
  input: {
    Core: Pick<
      typeof CorePublic,
      | "materializeProject"
      | "ArtifactFilesSchema"
      | "ProjectPlanSchema"
      | "ArtifactFileSchema"
    >;
    operation: NativeOperation;
    pair: NativeAssignmentProjectPlans;
    condition: MaterializableCondition;
    fact: CheckedNativeProjectFact;
    materialization?: { includeGit?: boolean };
    settings: Pick<ReturnType<typeof question>, "submission">;
    courseId: string;
    runtime: RuntimeProfile;
    bindings: (
      plan: ProjectPlan,
      condition: MaterializableCondition,
      submission: SubmissionInstructions,
    ) => Promise<MaterializationBindings>;
    Download: {
      zip: Parameters<
        Awaited<ReturnType<typeof createNativeAdapter>>["workspaceArtifact"]
      >[0]["zip"];
      packageArtifact: (inventory: ArtifactFiles) => Promise<Uint8Array>;
    };
    adapter: Pick<
      Awaited<ReturnType<typeof createNativeAdapter>>,
      "workspaceArtifact"
    >;
    expectedSources: string[];
    auxiliary?: NativeAuxiliary;
    checkpoint?: () => Promise<void>;
  },
) {
  const { Core, pair, condition } = input;
  const initial = describeSubmission(input.settings.submission, []);
  const student = await Core.materializeProject(
    pair.student,
    condition,
    await input.bindings(pair.student, condition, initial),
  );
  const full = input.fact.check
    ? await Core.materializeProject(
      pair.full,
      condition,
      await input.bindings(pair.full, condition, initial),
    )
    : undefined;
  let checked;
  if (input.fact.check) {
    checked = await projectNativeChecks({
      ...input,
      student,
      full,
      studentPlan: pair.student,
      fullPlan: pair.full,
    });
  }
  const sourceMappings = checked?.selection.sources.map(file => ({ name: file.name, starterPath: file.target })) ??
    student.files.filter(file => input.settings.submission.mode !== "workspace" && file.reason === "starter" && applicationJavaTarget(file.target)).map(file => ({ name: file.target, starterPath: file.target }));
  const javaFiles = sourceMappings.length && sourceMappings.every(file => file.name.endsWith(".java"));
  const selectedSubmission = input.settings.submission.mode !== "workspace" && javaFiles
    ? fileSubmission(sourceMappings.map(file => file.name), input.settings.submission.mode === "editor" ? input.settings.submission.aceMode : undefined)
    : input.settings.submission;
  const submission = describeSubmission(selectedSubmission, sourceMappings, {
    archive: checked?.selection.descriptor.additionalJavaSources?.archive ??
      (javaFiles && selectedSubmission.mode === "upload" && selectedSubmission.layout === "zip" ? "solution.zip" : undefined),
  });
  const final = await Core.materializeProject(
    pair.student,
    condition,
    await input.bindings(pair.student, condition, submission),
  );
  if (checked) {
    for (const f of checked.selection.sources) {
      const actual = final.files.find((file) => file.target === f.target);
      if (
        !actual || !isDeepStrictEqual(actual.bytes, f.bytes)
      ) throw Error("PL.SELECTION_CHANGED: final starter");
    }
  }
  if (
    input.settings.submission.mode === "workspace" ||
    input.materialization?.includeGit === true
  ) {
    const workspace = await input.adapter.workspaceArtifact({
      operation: input.operation,
      checkpoint: input.checkpoint,
      auxiliary: input.auxiliary,
      expectedSources: input.expectedSources,
      source: input.fact.source,
      exerciseId: input.fact.exerciseId,
      inventory: final,
      zip: input.Download.zip,
    });
    return {
      ...checked,
      student: final,
      files: workspace.files,
      archive: workspace.archive,
    };
  }
  const files = final.files.map((f) => ({
    name: f.target,
    bytes: f.bytes,
    reason: f.reason,
  }));
  const archive = await input.Download.packageArtifact(final);
  await (input.checkpoint
    ? input.checkpoint()
    : input.operation.assertCurrent());
  return { ...checked, student: final, files, archive };
}
