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
export async function nativeEntry(
  options: {
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
  },
) {
  if (!safe(options.book)) throw Error("PL.INPUT_INVALID: book");
  const owner = await Deno.realPath(
    join(await Deno.realPath(options.root), options.book),
  );
  const candidate = await readNativeEntryCandidate(owner);
  if (
    options.profiles?.length &&
    JSON.stringify(options.profiles) !==
      JSON.stringify(
        candidate.identity.profiles.filter((p: string) =>
          p !== "student" && p !== "full"
        ),
      )
  ) throw Error("PL.CAPTURE_CHANGED: functional profiles");
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
  await withNativeCaptureScope({
    root: owner,
    projection: candidate.identity.projection,
    outputDirectory: candidate.outputDirectory,
  }, {
    assignment: {
      prepare: async (nativeOwner: Readonly<Record<string, any>>) => {
        // Реальный gate предшествует этому callback. Native metadata не разрешаем сами.
        const inputs = nativeOwner.files?.input;
        if (
          !Array.isArray(inputs) ||
          inputs.some((v: unknown) => typeof v !== "string")
        ) throw Error("PL.NATIVE_SELECTION_UNQUALIFIED: owner input contract");
        const actual = inputs.map((p: string) =>
          relative(owner, resolve(owner, p)).replaceAll("\\", "/")
        );
        if (
          actual.some((p: string) => !safe(p)) ||
          JSON.stringify([...actual].sort()) !==
            JSON.stringify([...candidate.expectedSources].sort())
        ) throw Error("PL.CAPTURE_CHANGED: actual source coverage");
        const { declarations } = await import("./declarations.ts");
        const selected = options.instance
          ? declarations(nativeOwner.config?.prairielearn, options.instance)
            .instance.works
          : [options.work];
        if (
          !selected.length ||
          selected.some((id: unknown) => typeof id !== "string" || !id)
        ) throw Error("PL.INPUT_INVALID: selected assessments");
        // G3: текущий public owner не задаёт проверенную ID→source таблицу.
        // Не добавлять YAML/parser/path convention и не угадывать source из ID.
        throw Error(
          "PL.NATIVE_SELECTION_UNQUALIFIED: требуется public source binding выбранных работ; assignment child не запущен",
        );
      },
    },
  }, async () => {
    // G1: old candidate generation нельзя молча связать с новой prepared generation.
    throw Error(
      "PL.NATIVE_CORRELATION_UNQUALIFIED: public prepared correlation contract required",
    );
  });
}
