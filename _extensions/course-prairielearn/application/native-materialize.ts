import type { NativeAuxiliary } from "./native-auxiliary.ts";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { hash } from "./source-selection.ts";
import { describeSubmission } from "./submission.ts";
import { projectNativeChecks } from "./native-check-projection.ts";
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
/** Файлы C/operator inputs: data only, hash fence без source discovery. */
export async function checkedJSON(path: string) {
  const canonical = await Deno.realPath(path);
  if (canonical !== resolve(path)) {
    throw Error("PL.INPUT_INVALID: aliased JSON input");
  }
  const bytes = await Deno.readFile(canonical),
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    sha256 = await hash(bytes);
  return {
    value,
    async assert() {
      if (
        await Deno.realPath(path) !== canonical ||
        await hash(await Deno.readFile(canonical)) !== sha256
      ) throw Error("PL.INPUT_CHANGED: JSON dependency");
    },
  };
}
export async function nativeReferenceBindings(
  input: {
    owner: string;
    outputDirectory: string;
    book: string;
    config: any;
    operation: any;
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
    input.operation.catalog.documents.map((d: any) => [d.source, d.output]),
  );
  return {
    QRC,
    catalog: file.value,
    baseUrl,
    sources,
    check: file.assert,
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
    async bindings(Core: any, plan: any, condition: any, submission: any) {
      const closure = await Core.materializationClosure(plan, condition),
        linksBySource: any = {},
        referencesBySource: any = {};
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
    Core: any;
    operation: any;
    pair: any;
    condition: any;
    fact: any;
    materialization?: { includeGit?: boolean };
    settings: any;
    sourceRows: any[];
    courseId: string;
    runtime: any;
    bindings: (plan: any, condition: any, submission: any) => Promise<any>;
    Download: any;
    adapter: any;
    expectedSources: string[];
    auxiliary?: NativeAuxiliary;
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
  const submission = describeSubmission(
    input.settings.submission,
    checked?.selection.sources.map((f: any) => ({
      name: f.name,
      starterPath: f.target,
    })) ?? [],
  );
  const final = await Core.materializeProject(
    pair.student,
    condition,
    await input.bindings(pair.student, condition, submission),
  );
  if (checked) {
    for (const f of checked.selection.sources) {
      const actual = final.files.find((file: any) => file.target === f.target);
      if (
        !actual || actual.sha256 !== f.sha256 ||
        await hash(actual.bytes) !== f.sha256
      ) throw Error("PL.SELECTION_CHANGED: final starter");
    }
  }
  const files = final.files.map((f: any) => ({
    name: f.target,
    bytes: f.bytes,
  }));
  let archive = await input.Download.packageArtifact(final);
  if (
    input.settings.submission.mode === "workspace" ||
    input.materialization?.includeGit === true
  ) {
    const workspace = await input.adapter.workspaceArtifact({
      operation: input.operation,
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
  await input.operation.assertCurrent();
  return { ...checked, student: final, files, archive };
}
