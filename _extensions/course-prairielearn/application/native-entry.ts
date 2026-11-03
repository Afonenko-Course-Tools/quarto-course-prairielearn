import type * as CorePublic from "course-core/public.ts";
import type {
  NativeOperation,
  NativePreparedOperation,
} from "course-core/public.ts";
import type { withNativeCaptureScope as CoreCaptureScope } from "course-core/capture.ts";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Inert C entry: только builtin IO собственного correlation transport.
// До публичного Core gate не импортировать exporter/metrics/runtime modules.
const safe = (v: unknown): v is string =>
  typeof v === "string" && !!v && !v.includes("\\") && !v.includes("\0") &&
  !v.startsWith("/") &&
  !v.split("/").some((p) => !p || p === "." || p === "..");
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
    .test(v);
async function ownFile(root: string, path: string) {
  if (!safe(path)) throw Error("PL.CAPTURE_CHANGED: candidate path");
  let current = root;
  for (const [i, part] of path.split("/").entries()) {
    current = join(current, part);
    const s = await Deno.lstat(current);
    if (
      s.isSymlink || s.isFile && s.size > 4 * 1024 * 1024 ||
      !(i === path.split("/").length - 1 ? s.isFile : s.isDirectory)
    ) throw Error("PL.CAPTURE_CHANGED: candidate alias/type");
  }
  return current;
}
/** Не Core authority: request должен быть повторно принят публичным gate. */
export async function readNativeEntryCandidate(owner: string) {
  const root = await Deno.realPath(owner),
    base = "_generated/course-spec/prairielearn-native";
  try {
    const active = JSON.parse(
      await Deno.readTextFile(await ownFile(root, base + "/active.json")),
    );
    if (!uuid(active.operation)) {
      throw Error("PL.CAPTURE_CHANGED: candidate generation");
    }
    const request = JSON.parse(
      await Deno.readTextFile(
        await ownFile(root, base + "/" + active.operation + "/request.json"),
      ),
    );
    const id = request.identity;
    if (
      request.schema !== "pl-native-business-request-v1" ||
      request.owner !== root || !id || id.operation !== active.operation ||
      !uuid(id.operation) || id.runtime !== "quarto-1.11.5" ||
      !["student", "author"].includes(id.projection) ||
      !Array.isArray(id.profiles) || id.profiles.length > 16 ||
      id.profiles.some((p: unknown) =>
        typeof p !== "string" || !/^[-a-z0-9]+$/.test(p)
      ) || typeof request.outputDirectory !== "string" ||
      request.outputDirectory !== resolve(request.outputDirectory) ||
      !request.outputDirectory.startsWith(root + "/") ||
      !Array.isArray(request.inputs) || !request.inputs.length ||
      request.inputs.length > 4096 || request.inputs.some((i: any) =>
        !safe(i.source) || !uuid(i.captureWitness)
      ) || new Set(request.inputs.map((i: any) =>
          i.source
        )).size !== request.inputs.length
    ) {
      throw Error("PL.CAPTURE_CHANGED: candidate binding");
    }
    return {
      root,
      identity: structuredClone(id),
      outputDirectory: request.outputDirectory,
      expectedSources: request.inputs.map((i: any) =>
        i.source
      ) as string[],
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw Error("PL.CAPTURE_MISSING: native preparation required", {
        cause: error,
      });
    }
    throw error;
  }
}
/** Только уже наблюдённые Quarto owner facts; не читает/не разбирает QMD. */
export async function selectNativeOwnerAssignments(
  observed: Readonly<Record<string, any>>,
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
  const assessments = selected.map((id) => {
    const matches = expectedSources.filter((source: string) =>
      observed.fileInformation?.[source]?.metadata?.assessment?.id === id
    );
    if (matches.length !== 1) {
      throw Error(
        "PL.NATIVE_SELECTION_UNQUALIFIED: explicit unique frontmatter assessment.id required: " +
          id,
      );
    }
    return { source: matches[0], id: id as string };
  });
  const contextAssessments: { source: string; id: string }[] = [];
  if (options.instance) {
    // Состав optional меню известен только после native capture. До child
    // резервируем observed IDs, не выдавая их за выбранные работы поставки.
    for (const source of expectedSources) {
      const id = observed.fileInformation?.[source]?.metadata?.assessment?.id;
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
  stagingReceipt?: string;
  publicationConditions?: string;
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
  const { withNativeCaptureScope }: {
    withNativeCaptureScope: typeof CoreCaptureScope;
  } = await import(
    pathToFileURL(join(coreDirectory, "capture.ts")).href
  );
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
      const Core: typeof CorePublic = await import(
        pathToFileURL(join(coreDirectory, "public.ts")).href
      );
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
  const Core: typeof CorePublic = await import(
    pathToFileURL(join(coreDirectory, "public.ts")).href
  );
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
