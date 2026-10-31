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
  return { expectedSources, assessments };
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
  const { withNativeCaptureScope } = await import(
    pathToFileURL(join(core, "capture.ts")).href
  );
  let selected:
    | Awaited<ReturnType<typeof selectNativeOwnerAssignments>>
    | undefined;
  let descriptor: any, observedConfig: any;
  await withNativeCaptureScope({
    root: owner,
    projection: "author",
    outputDirectory,
  }, {
    assignment: {
      mode: "new",
      prepare: async (observed: Readonly<Record<string, any>>) => {
        observedConfig = structuredClone(observed.config);
        selected = await selectNativeOwnerAssignments(observed, {
          ...options,
          root: owner,
        });
        return selected;
      },
    },
  }, async (scope: any) => {
    await scope.withPreparedOperation(async (lease: any) => {
      const Core = await import(pathToFileURL(join(core!, "public.ts")).href);
      descriptor = Core.NativePreparedOperationSchema.parse(lease.descriptor);
      if (
        !selected || descriptor.root !== owner ||
        descriptor.outputDirectory !== outputDirectory ||
        descriptor.identity.projection !== "author" ||
        JSON.stringify(descriptor.inputs.map((i: any) => i.source)) !==
          JSON.stringify(selected.expectedSources) ||
        JSON.stringify(descriptor.assessments) !==
          JSON.stringify(selected.assessments)
      ) throw Error("PL.CAPTURE_CHANGED: prepared selection");
      if (
        options.profiles?.length &&
        JSON.stringify(options.profiles) !==
          JSON.stringify(
            descriptor.identity.profiles.filter((p: string) =>
              p !== "student" && p !== "full"
            ),
          )
      ) throw Error("PL.CAPTURE_CHANGED: functional profiles");
      const { prepareNativeAdapter } = await import("./native-adapter.ts");
      await prepareNativeAdapter(Core, {
        root: owner,
        profiles: descriptor.identity.profiles,
        projection: "author",
        outputDirectory,
      }, lease);
      await lease.captureInputs(
        descriptor,
        selected.expectedSources,
        {
          // Executable/cwd/env/token принадлежат qualified Core lease.
          args: ["render", "--output-dir", relative(owner, outputDirectory)],
          stdout: "inherit",
          stderr: "inherit",
          timeoutMs: 20 * 60 * 1000,
        },
      );
      await lease.assert(descriptor);
    });
  });
  if (!descriptor || !selected) {
    throw Error("PL.CAPTURE_MISSING: prepared operation");
  }
  const Core = await import(pathToFileURL(join(core, "public.ts")).href);
  const { prepareNativeCourse } = await import("./native-course.ts");
  return await publishNativePrepared(
    (use) =>
      Core.withCurrentNativeOperation({
        root: owner,
        profiles: descriptor.identity.profiles,
        projection: descriptor.identity.projection,
        outputDirectory,
      }, use),
    async (operation: any) => {
      if (
        JSON.stringify(operation.identity) !==
          JSON.stringify(descriptor.identity)
      ) {
        throw Error("PL.CAPTURE_CHANGED: sealed generation");
      }
      return await prepareNativeCourse({
        Core,
        operation,
        descriptor,
        selection: selected!,
        options,
        observedConfig,
      });
    },
  );
}
/** Тот же порядок nativeEntry: handle сохраняется ВНУТРИ parent callback.
 * scope — настоящий Core gate в production; функция не создаёт authority. */
export async function publishNativePrepared(
  scope: (use: (operation: any) => Promise<any>) => Promise<any>,
  prepare: (operation: any) => Promise<any>,
) {
  let prepared: any;
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
