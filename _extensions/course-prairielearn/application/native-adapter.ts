import type * as CorePublic from "course-core/public.ts";
import type {
  NativeOperationIdentity,
  NativePendingOperationExpectation,
  NativePreparedLease,
  NativePreparedOperation,
} from "course-core/public.ts";
import { nativeBusinessInput, nativeMetadataReadSet } from "./native-input.ts";
import { assertNativeSeedTargets } from "./native-business.ts";
import type { NativeAuxiliary } from "./native-auxiliary.ts";
import { validateGradingComponents } from "./grading-policy.ts";
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { nativeWorkspaceArtifact } from "./native-workspace.ts";
import { readNativeEntryCandidate } from "./native-entry.ts";
import { decodeNativeCheck } from "./native-checks.ts";
import { decodeNativeBusiness } from "./native-business.ts";
import { hash, safePath } from "./source-selection.ts";

// Типы берутся из того же публичного Core, который выбирает composition.
// При проверке course-core/ разрешается import map; runtime import отсутствует.
export type PublicCore = Pick<
  typeof CorePublic,
  | "withPendingNativeOperation"
  | "NativeAdapterValidationInputSchema"
  | "ArtifactInventorySchema"
  | "NativeOperationIdentitySchema"
  | "NativePreparedOperationSchema"
>;
export type NativePreparedRequest = {
  schema: "pl-native-business-request-v1";
  owner: string;
  identity: NativeOperationIdentity;
  outputDirectory: string;
  inputs: NativePreparedOperation["inputs"];
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
async function requestValue(
  root: string,
  identity: NativeOperationIdentity,
  inputs: NativePreparedOperation["inputs"],
  outputDirectory: string,
): Promise<NativePreparedRequest> {
  if (
    !inputs.length || inputs.some((input) =>
      !safePath(input.source) ||
      !generation.safeParse(input.captureWitness).success
    ) || new Set(inputs.map((input) => input.source)).size !== inputs.length
  ) throw Error("PL.CAPTURE_CHANGED: prepared sources");
  return {
    schema: "pl-native-business-request-v1",
    owner: root,
    identity: structuredClone(identity),
    outputDirectory,
    inputs: structuredClone(inputs),
  };
}
/** DTO-проекция не даёт lease authority и не пишет файлы. */
export async function nativePreparedRequest(core: PublicCore, value: unknown) {
  if (!core.NativePreparedOperationSchema) {
    throw Error("PL.PUBLIC_API_REQUIRED: prepared operation");
  }
  const d = core.NativePreparedOperationSchema.parse(value);
  if (
    d.root !== resolve(d.root) ||
    d.outputDirectory !== resolve(d.outputDirectory) ||
    !d.outputDirectory.startsWith(d.root + "/_generated/")
  ) throw Error("PL.CAPTURE_CHANGED: prepared owner/output");
  return await requestValue(d.root, d.identity, d.inputs, d.outputDirectory);
}
async function saveRequest(root: string, request: NativePreparedRequest) {
  const id = generation.parse(request.identity.operation),
    folder = await directory(root, ownBase + "/" + id);
  try {
    const previous = JSON.parse(
      await Deno.readTextFile(
        await ownFile(root, ownBase + "/" + id + "/request.json"),
      ),
    );
    if (!isDeepStrictEqual(previous, request)) {
      throw Error("PL.CAPTURE_CHANGED: preparation");
    }
    if ((await requestFor(root)).id !== id) {
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
  const base = await directory(root, ownBase),
    pendingFile = join(base, "active.pending.json");
  await Deno.writeTextFile(pendingFile, JSON.stringify({ operation: id }), {
    createNew: true,
  });
  await Deno.rename(pendingFile, join(base, "active.json"));
}
export async function prepareNativeAdapter(
  core: PublicCore,
  expectation: Omit<NativePendingOperationExpectation, "profiles"> & {
    profiles?: string[];
  },
  lease?: Pick<NativePreparedLease, "descriptor" | "assert">,
) {
  const root = await Deno.realPath(expectation.root);
  if (lease) {
    if (!core.NativePreparedOperationSchema) {
      throw Error("PL.PUBLIC_API_REQUIRED: prepared operation");
    }
    const descriptor = core.NativePreparedOperationSchema.parse(
      lease.descriptor,
    );
    if (
      descriptor.root !== root ||
      descriptor.outputDirectory !== expectation.outputDirectory ||
      descriptor.identity.projection !== expectation.projection ||
      expectation.profiles !== undefined &&
        !isDeepStrictEqual(descriptor.identity.profiles, expectation.profiles)
    ) throw Error("PL.CAPTURE_CHANGED: lease expectation");
    await lease.assert(descriptor);
    await saveRequest(root, await nativePreparedRequest(core, descriptor));
    await lease.assert(descriptor);
    return descriptor;
  }
  const profiles = expectation.profiles ??
    (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(Boolean);
  return await core.withPendingNativeOperation({
    ...expectation,
    root,
    profiles,
  }, async (pending) => {
    await saveRequest(
      root,
      await requestValue(
        root,
        pending.identity,
        pending.inputs,
        expectation.outputDirectory,
      ),
    );
  });
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
    request.identity.operation !== id || request.owner !== root ||
    typeof request.outputDirectory !== "string" ||
    !request.outputDirectory.startsWith(root + "/") ||
    request.outputDirectory.split("/").includes("..")
  ) throw Error("PL.CAPTURE_CHANGED: request");
  return { id, request };
}
/** CLI читает лишь correlation candidate; полномочия затем заново проверяет публичная Core operation. */
export async function readNativeAdapterExpectation(
  core: PublicCore,
  owner: string,
) {
  const candidate = await readNativeEntryCandidate(owner),
    root = candidate.root;
  const identity = core.NativeOperationIdentitySchema.parse(candidate.identity);
  return {
    identity,
    expectedSources: candidate.expectedSources,
    expectation: {
      root,
      profiles: identity.profiles,
      projection: identity.projection,
      outputDirectory: candidate.outputDirectory,
    },
  };
}
export function createNativeAdapter(
  options: { root: string; core: PublicCore; preparedIdentity?: unknown },
) {
  const preparedIdentity = options.preparedIdentity === undefined
    ? undefined
    : options.core.NativeOperationIdentitySchema.parse(
      options.preparedIdentity,
    );
  const loaded = new Map<string, ReturnType<typeof decodeNativeBusiness>>();
  const effectiveInputs = new Map<string, any>();
  let composing = false;
  let validatingRequest: Awaited<ReturnType<typeof requestFor>> | undefined;
  let validatedCourse: {
    operation: any;
    identity: any;
    request: any;
    proof: any;
  } | undefined;
  const adapter = {
    name: "prairielearn",
    nativeMetadataReadSet,
    async validate(value: unknown) {
      const { input, raw } = nativeBusinessInput(options.core, value);
      // Direct DTO validation остаётся чистой: state может заполнить только
      // callback полной composition внутри genuine Core operation.
      if (composing) {
        const current = validatingRequest;
        if (
          !current || input.origin.operation !== current.id ||
          !isDeepStrictEqual(
            input.origin.profiles,
            current.request.identity.profiles,
          ) ||
          input.origin.projection !== current.request.identity.projection
        ) {
          throw Error("PL.CAPTURE_CHANGED: generation/profiles/projection");
        }
        const ref = current.request.inputs.find((item: any) =>
          item.source === input.origin.source
        );
        if (!ref || ref.captureWitness !== input.origin.captureWitness) {
          throw Error("PL.CAPTURE_CHANGED: source/witness");
        }
      }
      const business = decodeNativeBusiness(raw, input, {
        deferComposition: composing,
      });
      const sources: { path: string; kind: "directory" | "file" }[] = [];
      for (const declaration of input.declarations) {
        const settings = business.questions[declaration.id];
        if (declaration.answer) {
          if (
            declaration.attributes["project-check"] ||
            declaration.attributes.project
          ) {
            throw Error(
              "PL.ANSWER_UNQUALIFIED: answer form cannot acquire project runtime",
            );
          }
          const hasManual = declaration.answer.type === "manual" ||
            declaration.answer.type === "multipart" &&
              declaration.answer.parts.some((p: any) => p.type === "manual");
          const hasAuto = declaration.answer.type !== "manual" &&
            (declaration.answer.type !== "multipart" ||
              declaration.answer.parts.some((p: any) => p.type === "numeric"));
          const expected = hasManual
            ? hasAuto ? "mixed" : "manual"
            : "external";
          if (settings.grading.method !== expected) {
            throw Error("PL.GRADING_INVALID: canonical answer grading method");
          }
          continue;
        }
        const path = declaration.attributes.project?.replace(/^\//, "");
        if (!safePath(path)) {
          throw Error("PL.PROJECT_INVALID: требуется owner-relative project");
        }
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
          decodeNativeCheck(raw.projectChecks, check);
        }
        sources.push({ path, kind: "directory" });
        for (
          const common
            of (business.materialization as any)?.projects?.[declaration.id]
              ?.["common-files"] ?? []
        ) sources.push({ path: common.source, kind: "file" });
      }
      if (composing) {
        loaded.set(input.origin.source, business);
        effectiveInputs.set(input.origin.source, input);
      }
      return { sources };
    },
    async validateCourse(
      operation: any,
      request: { expectedSources: string[]; courseId?: string },
      checkpoint?: () => Promise<void>,
    ) {
      if (composing) throw Error("PL.ASSESSMENT_INVALID: recursive validation");
      if (
        validatedCourse && validatedCourse.operation === operation &&
        isDeepStrictEqual(validatedCourse.identity, operation.identity) &&
        isDeepStrictEqual(validatedCourse.request, request)
      ) {
        try {
          await (checkpoint ? checkpoint() : operation.assertCurrent());
          return validatedCourse.proof;
        } catch (error) {
          validatedCourse = undefined;
          loaded.clear();
          effectiveInputs.clear();
          throw error;
        }
      }
      loaded.clear();
      effectiveInputs.clear();
      validatedCourse = undefined;
      composing = true;
      try {
        const root = await Deno.realPath(options.root);
        validatingRequest = await requestFor(root);
        if (
          !isDeepStrictEqual(
            validatingRequest.request.identity,
            operation.identity,
          ) ||
          preparedIdentity &&
            !isDeepStrictEqual(
              validatingRequest.request.identity,
              preparedIdentity,
            ) ||
          !isDeepStrictEqual(
            validatingRequest.request.inputs.map((i: any) => i.source),
            request.expectedSources,
          )
        ) {
          throw Error("PL.CAPTURE_CHANGED: operation/prepared/source coverage");
        }
        await operation.assertCurrent();
        const proof = await operation.validateRelease(request, [adapter]);
        if (
          loaded.size !== request.expectedSources.length ||
          request.expectedSources.some((source) => !loaded.has(source))
        ) throw Error("PL.ASSESSMENT_INVALID: missing authenticated source");
        assertNativeSeedTargets([...loaded.values()]);
        const methods: Record<string, "external" | "manual" | "mixed"> = {};
        for (const business of loaded.values()) {
          for (const [id, settings] of Object.entries(business.questions)) {
            if (Object.hasOwn(methods, id)) {
              throw Error("PL.ASSESSMENT_INVALID: repeated declaration");
            }
            methods[id] = settings.grading.method;
          }
        }
        for (const [source, business] of loaded) {
          const input = effectiveInputs.get(source);
          if (input.assessment && business.assessment) {
            validateGradingComponents({
              ...input.assessment,
              source,
              extensions: { prairielearn: business.assessment },
            }, methods);
          }
        }
        await operation.assertCurrent();
        if (!isDeepStrictEqual(await requestFor(root), validatingRequest)) {
          throw Error(
            "PL.CAPTURE_CHANGED: correlation changed during validation",
          );
        }
        validatedCourse = {
          operation,
          identity: structuredClone(operation.identity),
          request: structuredClone(request),
          proof,
        };
        return proof;
      } catch (error) {
        loaded.clear();
        effectiveInputs.clear();
        throw error;
      } finally {
        composing = false;
        validatingRequest = undefined;
      }
    },
    /** Exact public Core delivery; планы и QRC context приходят от существующей
     * живой composition. Этот bridge не создаёт scope/plan/condition authority.
     */
    async assignmentDelivery(
      operation: any,
      request: { source: string; assessmentId: string },
      options: { projectPlans: readonly unknown[]; references?: unknown },
      release: { expectedSources: string[]; courseId?: string },
      checkpoint?: () => Promise<void>,
    ) {
      const proof = await adapter.validateCourse(
        operation,
        release,
        checkpoint,
      );
      const delivery = await operation.assignmentDelivery(request, options);
      if (
        delivery.schema !== "course-native-assignment-delivery-v1" ||
        delivery.origin.operation !== operation.identity.operation ||
        delivery.origin.projection !== operation.identity.projection ||
        !isDeepStrictEqual(
          delivery.origin.profiles,
          operation.identity.profiles,
        ) ||
        delivery.assessment.source !== request.source ||
        delivery.assessment.id !== request.assessmentId ||
        delivery.publicPackage.works.length !== 1 ||
        delivery.publicPackage.works[0].id !== request.assessmentId ||
        delivery.publicPackage.works[0].source !== request.source
      ) {
        throw Error("PL.ASSIGNMENT_CHANGED: public delivery binding");
      }
      const nativeAnswers: Record<string, unknown> = {},
        nativeSettings: Record<string, unknown> = {};
      const ids = new Set<string>();
      for (const question of delivery.publicPackage.questions) {
        const input = effectiveInputs.get(question.source);
        const declaration = input?.declarations.find((d: any) =>
          d.id === question.id
        );
        const settings = loaded.get(question.source)?.questions[question.id];
        if (
          !declaration || !settings || ids.has(question.id) ||
          !delivery.conditions[question.id]
        ) throw Error("PL.ASSIGNMENT_CHANGED: selected question");
        ids.add(question.id);
        if (declaration.answer) {
          if (question.answerType !== declaration.answer.type) {
            throw Error("PL.ANSWER_UNQUALIFIED: public/private form mismatch");
          }
          nativeAnswers[question.id] = structuredClone(declaration.answer);
        } else if (question.answerType !== "manual") {
          throw Error("PL.ANSWER_UNQUALIFIED: missing canonical answer");
        }
        nativeSettings[question.id] = structuredClone(settings);
      }
      if (Object.keys(delivery.conditions).some((id) => !ids.has(id))) {
        throw Error("PL.ASSIGNMENT_CHANGED: extra condition");
      }
      await (checkpoint ? checkpoint() : operation.assertCurrent());
      return {
        proof,
        delivery,
        publicPackage: delivery.publicPackage,
        conditions: delivery.conditions,
        nativeAnswers,
        nativeSettings,
      };
    },
    /** Закрытое состояние PL composition; не включать в public Body/catalog/README. */
    validatedInput(source: string) {
      const input = effectiveInputs.get(source);
      if (!validatedCourse || !input) {
        throw Error("PL.CAPTURE_MISSING: validation не выполнена");
      }
      return structuredClone(input);
    },
    async workspaceArtifact(
      request: {
        operation: any;
        auxiliary?: NativeAuxiliary;
        checkpoint?: () => Promise<void>;
        expectedSources: string[];
        source: string;
        exerciseId: string;
        inventory: unknown;
        zip: (files: { name: string; bytes: Uint8Array }[]) => Uint8Array;
      },
    ) {
      await adapter.validateCourse(request.operation, {
        expectedSources: request.expectedSources,
      }, request.checkpoint);
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
        if (
          file.bytes.byteLength !== file.size ||
          await hash(file.bytes) !== file.sha256
        ) {
          throw Error("PL.WORKSPACE_SEED: inventory bytes changed");
        }
      }
      return await nativeWorkspaceArtifact({
        root: options.root,
        project: declaration.attributes.project.replace(/^\//, ""),
        settings: business.questions[request.exerciseId].submission,
        materialization: business.materialization,
        exerciseId: request.exerciseId,
        seedTarget: business.seedTargets[request.exerciseId],
        files: inventory.files.map((f: any) => ({
          name: f.target,
          bytes: f.bytes,
        })),
        zip: request.zip,
        assertCurrent: request.checkpoint ??
          (() => request.operation.assertCurrent()),
        auxiliary: request.auxiliary,
      });
    },
    /** Значения только после настоящего executable callback; publish владеет outer Core fence. */
    business(source: string) {
      const result = loaded.get(source);
      if (!validatedCourse || !result) {
        throw Error("PL.CAPTURE_MISSING: validation не выполнена");
      }
      return structuredClone(result);
    },
  };
  return adapter;
}
