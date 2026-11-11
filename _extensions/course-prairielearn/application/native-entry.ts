import { installedCapture, installedCore } from "./public-provider.ts";
import type {
  NativeOperation,
  NativeAssignmentPreparation,
  NativePreparedOperation,
} from "course-core/public.ts";
import { join, relative, resolve } from "node:path";

import { readNativeEntryCandidate } from "./native-request-candidate.ts";
export { readNativeEntryCandidate } from "./native-request-candidate.ts";
const safe = (v: unknown): v is string =>
  typeof v === "string" && !!v && !v.includes("\\") && !v.includes("\0") &&
  !v.startsWith("/") &&
  !v.split("/").some((p) => !p || p === "." || p === "..");
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
/** Только уже наблюдённые Quarto owner facts; не читает/не разбирает QMD. */
export async function selectNativeOwnerAssignments(
  observed: Parameters<NativeAssignmentPreparation["assignment"]["prepare"]>[0],
  options: { root: string; book: string; instance?: string; work?: string },
) {
  if (
    observed.dir !== options.root || !Array.isArray(observed.files?.input) ||
    !observed.files.input.length
  ) throw Error("PL.NATIVE_SELECTION_UNQUALIFIED: owner input contract");
  const expectedSources = observed.files.input.map((input: unknown) => {
    if (typeof input !== "string" || input !== resolve(input)) {
      throw Error(
        "PL.NATIVE_SELECTION_UNQUALIFIED: canonical owner input required",
      );
    }
    const source = relative(options.root, input).replaceAll("\\", "/");
    if (!safe(source)) {
      throw Error("PL.NATIVE_SELECTION_UNQUALIFIED: foreign owner input");
    }
    return source;
  });
  if (new Set(expectedSources).size !== expectedSources.length) {
    throw Error("PL.NATIVE_SELECTION_UNQUALIFIED: duplicate owner input");
  }
  let selected: unknown[];
  if (options.instance) {
    // Импорт после публичного gate: declarations включает observability bridge.
    const { declarations } = await import("./declarations.ts");
    const declaration = declarations(
      observed.config?.prairielearn,
      options.instance,
    );
    if (declaration.book !== options.book) {
      throw Error("PL.INPUT_INVALID: delivery book");
    }
    selected = declaration.instance.works;
  } else selected = [options.work];
  if (
    !selected.length || selected.some((id) => typeof id !== "string" || !id) ||
    new Set(selected).size !== selected.length
  ) throw Error("PL.INPUT_INVALID: selected assessments");
  const assessmentId = (source: string): unknown => {
    const info = record(observed.fileInformation) ? observed.fileInformation[source] : undefined;
    const metadata = record(info) ? info.metadata : undefined;
    const assessment = record(metadata) ? metadata.assessment : undefined;
    return record(assessment) ? assessment.id : undefined;
  };
  const assessments = selected.map((id) => {
    if (typeof id !== "string" || !id) throw Error("PL.INPUT_INVALID: selected assessments");
    const matches = expectedSources.filter((source: string) =>
      assessmentId(source) === id
    );
    if (matches.length !== 1) {
      throw Error(
        "PL.NATIVE_SELECTION_UNQUALIFIED: explicit unique frontmatter assessment.id required: " +
          id,
      );
    }
    const source = matches[0];
    if (source === undefined) throw Error("PL.NATIVE_SELECTION_UNQUALIFIED: missing source");
    return { source, id };
  });
  const contextAssessments: { source: string; id: string }[] = [];
  if (options.instance) {
    // Состав optional меню известен только после native capture. До child
    // резервируем observed IDs, не выдавая их за выбранные работы поставки.
    for (const source of expectedSources) {
      const id = assessmentId(source);
      if (id === undefined) continue;
      if (
        typeof id !== "string" || !id ||
        [...assessments, ...contextAssessments].some((a) =>
          a.id === id && a.source !== source
        )
      ) {
        throw Error(
          "PL.NATIVE_SELECTION_UNQUALIFIED: ambiguous context assessment.id",
        );
      }
      if (!assessments.some((a) => a.id === id)) {
        contextAssessments.push({ source, id });
      }
    }
  }
  return { expectedSources, assessments, contextAssessments };
}
export type NativeEntryOptions = {
  root: string;
  book: string;
  output?: string;
  checksOutput?: string;
  runtimeRegistry?: string;
  candidateImage?: string;
  bindingPath?: string;
  instance?: string;
  work?: string;
  profiles?: string[];
  mode?: "new" | "existing";
};
export async function nativeEntry(options: NativeEntryOptions) {
  // Consume-existing не реализован: отказ до чтения owner и смены current pointer.
  if (options.mode !== undefined && options.mode !== "new") {
    throw Error(
      "PL.NATIVE_CONSUME_UNSUPPORTED: existing operation cannot be rebound as fresh intent",
    );
  }
  if (!safe(options.book)) throw Error("PL.INPUT_INVALID: book");
  const owner = await Deno.realPath(
    join(await Deno.realPath(options.root), options.book),
  );
  // Новая B reservation, не active.json поколения A. Путь входит в qualification argv/G/K.
  const outputDirectory = join(owner, "_generated/prairielearn-native-render");
  let core: string | undefined;
  for (
    const p of [
      join(owner, "_extensions/course-core"),
      join(owner, "_extensions/Afonenko-Course-Tools/course-core"),
    ]
  ) {
    try {
      const s = await Deno.lstat(p);
      if (s.isDirectory && !s.isSymlink && await Deno.realPath(p) === p) {
        core = p;
        break;
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  if (!core) throw Error("PL.INPUT_INVALID: installed public Core required");
  const coreDirectory = core;
  const { withNativeCaptureScope } = await installedCapture(join(coreDirectory, "public.ts"));
  let selected:
    | Awaited<ReturnType<typeof selectNativeOwnerAssignments>>
    | undefined;
  let descriptor: NativePreparedOperation | undefined;
  let observedConfig: unknown;
  let functionalProfiles: string[] | undefined;
  await withNativeCaptureScope({
    root: owner,
    projection: "author",
    outputDirectory,
  }, {
    assignment: {
      mode: "new",
      get profiles() {
        return functionalProfiles ??= (options.profiles ??
          (Deno.env.get("QUARTO_PROFILE") || "").split(",")).filter((p) =>
            p && p !== "student" && p !== "full"
          );
      },
      prepare: async (observed) => {
        observedConfig = structuredClone(observed.config);
        selected = await selectNativeOwnerAssignments(observed, {
          ...options,
          root: owner,
        });
        return {
          expectedSources: selected.expectedSources,
          assessments: [
            ...selected.assessments,
            ...selected.contextAssessments,
          ],
        };
      },
    },
  }, async (scope) => {
    await scope.withPreparedOperation(async (lease) => {
      const Core = await installedCore(join(coreDirectory, "public.ts"));
      const prepared = Core.NativePreparedOperationSchema.parse(
        lease.descriptor,
      );
      descriptor = prepared;
      if (
        !selected || prepared.root !== owner ||
        prepared.outputDirectory !== outputDirectory ||
        prepared.identity.projection !== "author" ||
        JSON.stringify(prepared.inputs.map((i) => i.source)) !==
          JSON.stringify(selected.expectedSources) ||
        JSON.stringify(prepared.assessments) !==
          JSON.stringify([
            ...selected.assessments,
            ...selected.contextAssessments,
          ])
      ) throw Error("PL.CAPTURE_CHANGED: prepared selection");
      if (
        JSON.stringify(functionalProfiles) !==
          JSON.stringify(
            prepared.identity.profiles.filter((p) =>
              p !== "student" && p !== "full"
            ),
          )
      ) throw Error("PL.CAPTURE_CHANGED: functional profiles");
      const { prepareNativeAdapter } = await import("./native-adapter.ts");
      await prepareNativeAdapter(Core, {
        root: owner,
        profiles: prepared.identity.profiles,
        projection: "author",
        outputDirectory,
      }, lease);
      await lease.captureInputs(
        prepared,
        selected.expectedSources,
        {
          // Executable/cwd/env/token принадлежат qualified Core lease.
          args: ["render", "--output-dir", relative(owner, outputDirectory)],
          stdout: "inherit",
          stderr: "inherit",
          timeoutMs: 20 * 60 * 1000,
        },
      );
      await lease.assert(prepared);
    });
  });
  if (!descriptor || !selected) {
    throw Error("PL.CAPTURE_MISSING: prepared operation");
  }
  const prepared = descriptor, selection = selected;
  const Core = await installedCore(join(coreDirectory, "public.ts"));
  const { prepareNativeCourse } = await import("./native-course.ts");
  return await publishNativePrepared(
    (
      use: (
        operation: NativeOperation,
      ) => Promise<NativePreparedPublication<unknown>>,
    ) =>
      Core.withCurrentNativeOperation({
        root: owner,
        profiles: prepared.identity.profiles,
        projection: prepared.identity.projection,
        outputDirectory,
      }, use),
    async (operation) => {
      if (
        JSON.stringify(operation.identity) !==
          JSON.stringify(prepared.identity)
      ) {
        throw Error("PL.CAPTURE_CHANGED: sealed generation");
      }
      return await prepareNativeCourse({
        Core,
        operation,
        descriptor: prepared,
        selection,
        options,
        observedConfig,
      });
    },
  );
}
/** Тот же порядок nativeEntry: handle сохраняется ВНУТРИ parent callback.
 * scope — настоящий Core gate в production; функция не создаёт authority. */
type NativePreparedPublication<T> = {
  publish(): Promise<T>;
  discard(): Promise<void>;
};
export async function publishNativePrepared<Operation, T>(
  scope: (
    use: (operation: Operation) => Promise<NativePreparedPublication<T>>,
  ) => Promise<NativePreparedPublication<T>>,
  prepare: (operation: Operation) => Promise<NativePreparedPublication<T>>,
): Promise<T> {
  let prepared: NativePreparedPublication<T> | undefined;
  try {
    prepared = await scope(async (operation) => {
      prepared = await prepare(operation);
      return prepared;
    });
    return await prepared.publish();
  } catch (error) {
    await prepared?.discard();
    throw error;
  }
}
