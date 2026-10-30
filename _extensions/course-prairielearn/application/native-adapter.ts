// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { nativeWorkspaceArtifact } from "./native-workspace.ts";
import {
  decodeNativeCheck,
  nativeCheckScalars,
  NativeProjectChecksSchema,
} from "./native-checks.ts";
import {
  decodeNativeBusiness,
  NativeBusinessSchema,
  nativePolicy,
  validateNativeRaw,
} from "./native-business.ts";
import { hash, safePath } from "./source-selection.ts";

const originSchema = z.strictObject({
  operation: z.uuid(),
  captureWitness: z.uuid(),
  source: z.string().refine(safePath),
  format: z.enum(["html", "revealjs"]),
  projection: z.enum(["student", "author"]),
  profiles: z.array(z.string()).max(16),
});
export const NativeRawCaptureSchema = z.strictObject({
  schema: z.literal("pl-native-business-capture-v1"),
  origin: originSchema,
  business: NativeBusinessSchema,
});
export type NativeRawCapture = z.output<typeof NativeRawCaptureSchema>;
// Runtime-схемы Core поставляет composition через его публичный модуль.
export type PublicCore = {
  withPendingNativeOperation: (
    expectation: any,
    callback: (pending: any) => Promise<unknown>,
  ) => Promise<unknown>;
  NativeAdapterValidationInputSchema: { parse: (value: unknown) => any };
  ArtifactInventorySchema: { parse: (value: unknown) => any };
};
const ownBase = "_generated/course-spec/prairielearn-native";
const generation = z.string().uuid();
async function directory(root: string, path: string) {
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      const st = await Deno.lstat(current);
      if (st.isSymlink || !st.isDirectory) {
        throw Error("PL.CAPTURE_PATH: небезопасный каталог");
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
      await Deno.mkdir(current);
    }
  }
  return current;
}
async function ownFile(root: string, path: string) {
  if (!safePath(path)) throw Error("PL.CAPTURE_PATH: небезопасный путь");
  const parts = path.split("/");
  let current = root;
  for (const [i, part] of parts.entries()) {
    current = join(current, part);
    const st = await Deno.lstat(current);
    if (
      st.isSymlink || !(i === parts.length - 1 ? st.isFile : st.isDirectory)
    ) throw Error("PL.CAPTURE_PATH: ссылка либо неверный тип");
  }
  return current;
}
export async function prepareNativeAdapter(core: PublicCore, expectation: any) {
  const root = await Deno.realPath(expectation.root);
  const profiles = expectation.profiles ??
    (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(Boolean);
  return await core.withPendingNativeOperation(
    { ...expectation, root, profiles },
    async (pending) => {
      const identity = structuredClone(pending.identity),
        inputs = structuredClone(pending.inputs);
      const id = generation.parse(identity.operation);
      const folder = await directory(root, ownBase + "/" + id);
      const requests = await Promise.all(
        inputs.map(async (input: any) => ({
          ...input,
          file: await hash(input.source) + ".json",
        })),
      );
      const request = {
        schema: "pl-native-business-request-v1",
        owner: root,
        identity,
        inputs: requests,
      };
      try {
        const previous = JSON.parse(
          await Deno.readTextFile(
            await ownFile(root, ownBase + "/" + id + "/request.json"),
          ),
        );
        if (!isDeepStrictEqual(previous, request)) {
          throw Error("PL.CAPTURE_CHANGED: preparation");
        }
        const current = await requestFor(root);
        if (current.id !== id) {
          throw Error("PL.CAPTURE_CHANGED: active preparation");
        }
        return;
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
      await Deno.writeTextFile(
        join(folder, "request.json"),
        JSON.stringify(request),
        { createNew: true },
      );
      const base = await directory(root, ownBase);
      const pendingFile = join(base, "active.pending.json");
      await Deno.writeTextFile(pendingFile, JSON.stringify({ operation: id }));
      await Deno.rename(pendingFile, join(base, "active.json"));
    },
  );
}
async function requestFor(root: string) {
  const active = JSON.parse(
    await Deno.readTextFile(await ownFile(root, ownBase + "/active.json")),
  );
  const id = generation.parse(active.operation);
  const request = JSON.parse(
    await Deno.readTextFile(
      await ownFile(root, ownBase + "/" + id + "/request.json"),
    ),
  );
  if (
    request.schema !== "pl-native-business-request-v1" ||
    request.identity.operation !== id || request.owner !== root
  ) throw Error("PL.CAPTURE_CHANGED: request");
  return { id, request };
}
/** Только собственный raw capture; эта запись не является Core release proof. */
export async function captureNativeBusiness(
  root: string,
  source: string,
  business: unknown,
  format: "html" | "revealjs",
) {
  root = await Deno.realPath(root);
  const { id, request } = await requestFor(root);
  const input = request.inputs.find((item: any) => item.source === source);
  if (!input || input.file !== await hash(source) + ".json") {
    throw Error("PL.CAPTURE_CHANGED: source");
  }
  const capture = NativeRawCaptureSchema.parse({
    schema: "pl-native-business-capture-v1",
    origin: {
      operation: id,
      captureWitness: input.captureWitness,
      source,
      format,
      projection: request.identity.projection,
      profiles: request.identity.profiles,
    },
    business: validateNativeRaw(business).raw,
  });
  await Deno.writeTextFile(
    join(root, ownBase, id, input.file),
    JSON.stringify(capture),
    { createNew: true },
  );
  return capture;
}
export function createNativeAdapter(
  options: { root: string; core: PublicCore },
) {
  const loaded = new Map<string, ReturnType<typeof decodeNativeBusiness>>();
  const effectiveInputs = new Map<string, any>();
  const adapter = {
    name: "prairielearn",
    nativeMetadataReadSet: Object.freeze(
      [
        "configuration",
        "assessment",
        "projectChecks",
        "projectMaterialization",
      ] as const,
    ),
    async validate(value: unknown) {
      const input = options.core.NativeAdapterValidationInputSchema.parse(
        value,
      );
      const root = await Deno.realPath(options.root);
      const { id, request } = await requestFor(root);
      if (id !== input.origin.operation) {
        throw Error("PL.CAPTURE_CHANGED: generation");
      }
      const ref = request.inputs.find((item: any) =>
        item.source === input.origin.source
      );
      if (
        !ref || ref.captureWitness !== input.origin.captureWitness ||
        ref.file !== await hash(input.origin.source) + ".json"
      ) throw Error("PL.CAPTURE_CHANGED: witness");
      const raw = NativeRawCaptureSchema.parse(
        JSON.parse(
          await Deno.readTextFile(
            await ownFile(root, ownBase + "/" + id + "/" + ref.file),
          ),
        ),
      );
      if (JSON.stringify(raw.origin) !== JSON.stringify(input.origin)) {
        throw Error("PL.CAPTURE_CHANGED: origin");
      }
      for (const declaration of input.declarations) {
        const original = raw.business.declarations.find((d) =>
          d.id === declaration.id
        );
        if (!original) {
          throw Error("PL.CAPTURE_CHANGED: missing raw declaration");
        }
        for (const [key, value] of Object.entries(declaration.attributes)) {
          if (
            key.startsWith("prairielearn-") &&
            original.attributes[key] !== value
          ) throw Error("PL.CAPTURE_CHANGED: authored adapter attribute");
        }
      }
      const slots = adapter.nativeMetadataReadSet;
      const envelope = input.nativeMetadata;
      if (
        !envelope || !Array.isArray(envelope.readSet) ||
        envelope.readSet.length !== slots.length ||
        slots.some((slot) => !envelope.readSet.includes(slot)) ||
        !envelope.values ||
        Object.keys(envelope.values).some((key) => !slots.includes(key as any))
      ) {
        throw Error("PL.CAPTURE_CHANGED: missing or incomplete nativeMetadata");
      }
      const mapping = {
        configuration: "config",
        assessment: "assessment",
        projectChecks: "projectChecks",
        projectMaterialization: "materialization",
      } as const;
      const authoritativeRaw: any = { declarations: raw.business.declarations };
      for (const slot of slots) {
        if (Object.hasOwn(envelope.values, slot)) {
          authoritativeRaw[mapping[slot]] = envelope.values[slot];
        }
      }
      // Обе стороны проходят тот же прежний PL canon. Отсутствие slot сохраняет отдельный смысл.
      const planes = (value: unknown) => {
        const checked = validateNativeRaw(value), r = checked.raw;
        return {
          ...(Object.hasOwn(r, "config")
            ? { configuration: checked.config }
            : {}),
          ...(Object.hasOwn(r, "assessment")
            ? { assessment: nativePolicy(r.assessment) }
            : {}),
          ...(Object.hasOwn(r, "projectChecks")
            ? {
              projectChecks: NativeProjectChecksSchema.parse(
                nativeCheckScalars(r.projectChecks),
              ),
            }
            : {}),
          ...(Object.hasOwn(r, "materialization")
            ? { projectMaterialization: r.materialization }
            : {}),
        };
      };
      if (!isDeepStrictEqual(planes(raw.business), planes(authoritativeRaw))) {
        throw Error("PL.CAPTURE_CHANGED: authored native metadata");
      }
      const business = decodeNativeBusiness(authoritativeRaw, input);
      const sources: { path: string; kind: "directory" | "file" }[] = [];
      for (const declaration of input.declarations) {
        const path = declaration.attributes.project?.replace(/^\//, "");
        if (!safePath(path)) {
          throw Error("PL.PROJECT_INVALID: требуется owner-relative project");
        }
        const settings = business.questions[declaration.id];
        const check = declaration.attributes["project-check"];
        if (settings.grading.method === "manual" && check) {
          throw Error(
            "PL.MANUAL_INVALID: Manual не требует автоматического project-check",
          );
        }
        if (settings.grading.method !== "manual" && !check) {
          throw Error("PL.PROJECT_CHECK_INVALID: требуется project-check");
        }
        if (settings.grading.method !== "manual") {
          decodeNativeCheck(authoritativeRaw.projectChecks, check);
        }
        sources.push({ path, kind: "directory" });
      }
      loaded.set(input.origin.source, business);
      effectiveInputs.set(input.origin.source, input);
      return { sources };
    },
    async workspaceArtifact(
      request: {
        operation: any;
        expectedSources: string[];
        source: string;
        exerciseId: string;
        inventory: unknown;
        zip: (files: { name: string; bytes: Uint8Array }[]) => Uint8Array;
      },
    ) {
      await request.operation.validateRelease({
        expectedSources: request.expectedSources,
      }, [adapter]);
      const business = loaded.get(request.source),
        input = effectiveInputs.get(request.source);
      const declaration = input?.declarations.find((d: any) =>
        d.id === request.exerciseId
      );
      if (
        !business || !declaration ||
        request.operation.identity.operation !== input.origin.operation
      ) throw Error("PL.CAPTURE_CHANGED: Workspace operation");
      const inventory = options.core.ArtifactInventorySchema.parse(
        request.inventory,
      );
      if (
        inventory.operation !== input.origin.operation ||
        inventory.exerciseId !== request.exerciseId ||
        inventory.audience !== "student"
      ) throw Error("PL.WORKSPACE_SEED: inventory identity");
      for (const file of inventory.files) {
        if (await hash(file.bytes) !== file.sha256) {
          throw Error("PL.WORKSPACE_SEED: inventory bytes changed");
        }
      }
      return await nativeWorkspaceArtifact({
        root: options.root,
        project: declaration.attributes.project.replace(/^\//, ""),
        settings: business.questions[request.exerciseId].submission,
        materialization: business.raw.materialization,
        exerciseId: request.exerciseId,
        files: inventory.files.map((f: any) => ({
          name: f.target,
          bytes: f.bytes,
        })),
        zip: request.zip,
        assertCurrent: () => request.operation.assertCurrent(),
      });
    },
    /** Значения только после настоящего executable callback; publish владеет outer Core fence. */
    business(source: string) {
      const result = loaded.get(source);
      if (!result) throw Error("PL.CAPTURE_MISSING: validation не выполнена");
      return structuredClone(result);
    },
  };
  return adapter;
}
