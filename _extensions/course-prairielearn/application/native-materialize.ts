import type { NativeAuxiliary } from "./native-auxiliary.ts";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  applicationJavaTarget,
  describeSubmission,
  fileSubmission,
} from "./submission.ts";
import { selectNativeStarterSources } from "./native-selection.ts";
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
import type * as ReferencePublic from "reference-catalog/public.ts";
import { withStudentSubmissionNames } from "./student-artifact.ts";
import type * as DownloadPublic from "project-download/public.ts";
type ReferenceAPI = Pick<
  typeof ReferencePublic,
  "loadBodyLinks" | "createBodyLinks" | "bindConditionLinks"
>;
type DownloadAPI = Pick<typeof DownloadPublic, "zip" | "packageArtifact">;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function referenceProvider(value: unknown): value is ReferenceAPI {
  return (
    record(value) &&
    typeof value.loadBodyLinks === "function" &&
    typeof value.createBodyLinks === "function" &&
    typeof value.bindConditionLinks === "function"
  );
}
function downloadProvider(value: unknown): value is DownloadAPI {
  return (
    record(value) &&
    typeof value.zip === "function" &&
    typeof value.packageArtifact === "function"
  );
}
export function publicExtension(
  owner: string,
  name: "reference-catalog",
): Promise<ReferenceAPI>;
export function publicExtension(
  owner: string,
  name: "project-download",
): Promise<DownloadAPI>;
export async function publicExtension(
  owner: string,
  name: "reference-catalog" | "project-download",
): Promise<ReferenceAPI | DownloadAPI> {
  for (const root of [
    join(owner, "_extensions", name),
    join(owner, "_extensions/Afonenko-Course-Tools", name),
  ]) {
    try {
      const p = join(root, "public.ts");
      if ((await Deno.realPath(p)) === p && (await Deno.lstat(p)).isFile) {
        if (name === "reference-catalog") {
          const api: unknown = await import(pathToFileURL(p).href);
          if (!referenceProvider(api))
            throw Error("PL.PUBLIC_API_REQUIRED: reference-catalog functions");
          return api;
        }
        const api: unknown = await import(pathToFileURL(p).href);
        if (!downloadProvider(api))
          throw Error("PL.PUBLIC_API_REQUIRED: project-download functions");
        return api;
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
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  return { value };
}
export async function nativeReferenceBindings(input: {
  owner: string;
  outputDirectory: string;
  book: string;
  config: unknown;
  operation: Pick<NativeOperation, "catalog">;
}) {
  const QRC = await publicExtension(input.owner, "reference-catalog"),
    file = await checkedJSON(
      join(input.outputDirectory, "reference-catalog-local.json"),
    );
  const config = record(input.config) ? input.config : {};
  const referenceConfig = record(config["reference-catalog"])
    ? config["reference-catalog"]
    : {};
  const website = record(config.website) ? config.website : {};
  const navigation = record(config["course-navigation"])
    ? config["course-navigation"]
    : {};
  const namespace = referenceConfig.namespace;
  const site = website["site-url"],
    course = navigation["course-url"];
  if (
    (site !== undefined && typeof site !== "string") ||
    (course !== undefined && typeof course !== "string")
  )
    throw Error("PL.REFERENCE_BINDING_REQUIRED: publication URL");
  const baseUrl =
    site ??
    (course
      ? new URL(input.book + "/", course.endsWith("/") ? course : course + "/")
          .href
      : undefined);
  if (typeof namespace !== "string" || !baseUrl) {
    throw Error(
      "PL.REFERENCE_BINDING_REQUIRED: actual namespace/publication base-url",
    );
  }
  const links = referenceConfig.imports
    ? await QRC.loadBodyLinks({
        catalogFile: join(
          input.outputDirectory,
          "reference-catalog-local.json",
        ),
        baseUrl,
        root: input.owner,
        namespace,
        imports: referenceConfig.imports,
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
        linksBySource[fragment.source] = QRC.bindConditionLinks(
          {
            context: { input: fragment.source },
            links: fragment.links,
          },
          {
            catalog: file.value,
            baseUrl,
            sources,
            resourceLinks: fragment.resources,
          },
        );
        const fragmentReferences: NonNullable<
          MaterializationBindings["referencesBySource"]
        >[string] = {};
        referencesBySource[fragment.source] = fragmentReferences;
        for (const ref of fragment.references) {
          fragmentReferences[ref.token] = await links.resolve(
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
export async function materializeNativeQuestion(input: {
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
}) {
  const { Core, pair, condition } = input;
  const initial = describeSubmission(input.settings.submission, []);
  // Full остаётся private inventory; только настоящие starter roles нужны
  // для предварительных имён сдачи. Окончательный student проверяет сам Core.
  const full = input.fact.check
    ? await Core.materializeProject(
        pair.full,
        condition,
        await input.bindings(pair.full, condition, initial),
      )
    : undefined;
  const preliminary =
    input.fact.check && full
      ? await selectNativeStarterSources(
          Core.ArtifactFilesSchema.parse(full).files.filter(
            (file) => file.reason === "starter",
          ),
          input.fact.check.sourceProfile,
          input.runtime,
        )
      : undefined;
  const student = preliminary
    ? undefined
    : await Core.materializeProject(
        pair.student,
        condition,
        await input.bindings(pair.student, condition, initial),
      );
  const summarize = (
    sourceMappings: SubmissionInstructions["files"],
    archive?: string,
  ) => {
    const javaFiles =
      sourceMappings.length &&
      sourceMappings.every((file) => file.name.endsWith(".java"));
    const selectedSubmission =
      input.settings.submission.mode !== "workspace" && javaFiles
        ? fileSubmission(
            sourceMappings.map((file) => file.name),
            input.settings.submission.mode === "editor"
              ? input.settings.submission.aceMode
              : undefined,
          )
        : input.settings.submission;
    return describeSubmission(selectedSubmission, sourceMappings, {
      ...((archive ??
        (javaFiles &&
        selectedSubmission.mode === "upload" &&
        selectedSubmission.layout === "zip"
          ? "solution.zip"
          : undefined)) !== undefined
        ? { archive: archive ?? "solution.zip" }
        : {}),
    });
  };
  const sourceMappings =
    preliminary?.map((file) => ({
      name: file.name,
      starterPath: file.target,
    })) ??
    (student?.files ?? [])
      .filter(
        (file) =>
          input.settings.submission.mode !== "workspace" &&
          file.reason === "starter" &&
          applicationJavaTarget(file.target),
      )
      .map((file) => ({ name: file.target, starterPath: file.target }));
  const preliminaryArchive =
    input.fact.check?.["additional-java-sources"]?.archive;
  const submission = summarize(sourceMappings, preliminaryArchive);
  const final = await Core.materializeProject(
    pair.student,
    condition,
    await input.bindings(pair.student, condition, submission),
  );
  let checked;
  if (input.fact.check) {
    checked = await projectNativeChecks({
      ...input,
      student: final,
      full,
      studentPlan: pair.student,
      fullPlan: pair.full,
    });
    if (!isDeepStrictEqual(checked.selection.sources, preliminary)) {
      throw Error("PL.SELECTION_CHANGED: final starter");
    }
    const actualSubmission = summarize(
      checked.selection.sources.map((file) => ({
        name: file.name,
        starterPath: file.target,
      })),
      checked.selection.descriptor.additionalJavaSources?.archive,
    );
    if (
      checked.selection.descriptor.additionalJavaSources?.archive !==
        preliminaryArchive ||
      !isDeepStrictEqual(actualSubmission, submission)
    ) {
      throw Error("PL.SELECTION_CHANGED: final submission");
    }
  }
  if (
    input.settings.submission.mode === "workspace" ||
    input.materialization?.includeGit === true
  ) {
    const workspace = await input.adapter.workspaceArtifact({
      operation: input.operation,
      ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
      ...(input.auxiliary ? { auxiliary: input.auxiliary } : {}),
      expectedSources: input.expectedSources,
      source: input.fact.source,
      exerciseId: input.fact.exerciseId,
      inventory: final,
      zip: input.Download.zip,
    });
    return {
      ...checked,
      student: final,
      ...withStudentSubmissionNames(
        { files: workspace.files, archive: workspace.archive },
        checked?.selection.sources ?? [],
      ),
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
  return {
    ...checked,
    student: final,
    ...withStudentSubmissionNames(
      { files, archive },
      checked?.selection.sources ?? [],
    ),
  };
}
