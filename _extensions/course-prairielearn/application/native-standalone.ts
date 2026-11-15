import { dirname, join, resolve } from "node:path";
import { exportPrairieLearn } from "./export.ts";
import { captureNativeAuxiliary } from "./native-auxiliary.ts";
import type {
  CourseArtifacts,
  NativeDelivered,
  RuntimeRegistry,
} from "./native-course-stages.ts";
import type { NativeEntryOptions } from "./native-entry.ts";
import { checkedJSON } from "./native-materialize.ts";
import { canonical } from "./source-selection.ts";
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export async function prepareStandaloneCourse(input: {
  options: NativeEntryOptions;
  output: string;
  deliveries: NativeDelivered[];
  registryInput: RuntimeRegistry | undefined;
  state: CourseArtifacts;
  auxiliary: ReturnType<typeof captureNativeAuxiliary>;
  fence: () => Promise<void>;
  save: (prepared: { discard: () => Promise<void> }) => void;
}) {
  const { options, output, deliveries, registryInput, auxiliary, fence, save } =
    input;
  const { settings, nativeInputs, nativeAnswers, artifacts, projects } =
    input.state;
  let result: Awaited<ReturnType<typeof exportPrairieLearn>>;
  if (options.checksOutput || !options.bindingPath || deliveries.length !== 1) {
    throw Error(
      "PL.INPUT_INVALID: standalone binding and one selected work required",
    );
  }
  const binding = await checkedJSON(resolve(options.bindingPath));
  const scratch = await Deno.makeTempDir({
    dir: dirname(resolve(output)),
    prefix: ".pl-native-inputs-",
  });
  try {
    const paths: Record<string, string> = {};
    const delivery = deliveries[0];
    if (!delivery) throw Error("PL.NATIVE_INTENT_INCOMPLETE: missing delivery");
    if (!record(binding.value) || !record(binding.value.questions)) {
      throw Error("PL.BINDING_CHANGED: missing questions");
    }
    for (const q of delivery.publicPackage.questions) {
      const expected = settings[q.id],
        provided = binding.value.questions[q.id],
        selected = nativeInputs[q.id];
      if (
        !record(provided) ||
        canonical({
          topic: provided.topic,
          submission: provided.submission,
          grading: provided.grading ?? { method: "external" },
          singleVariant: provided.singleVariant,
        }) !== canonical(expected)
      )
        throw Error("PL.BINDING_CHANGED: authored settings");
      if (nativeAnswers[q.id]) continue;
      paths[q.id] = "/" + q.id;
      for (const folder of ["student", "tests"]) {
        await Deno.mkdir(join(scratch, q.id, folder), {
          recursive: true,
        });
      }
      if (!selected) {
        // Genuine materialized bytes, а не повторное чтение owner/student.
        const artifact = artifacts[q.id];
        if (!artifact) throw Error("PL.SELECTION_INVALID: missing artifact");
        for (const file of artifact.files) {
          const path = join(scratch, q.id, "student", file.name);
          await Deno.mkdir(dirname(path), { recursive: true });
          await Deno.writeFile(path, file.bytes);
        }
      }
      if (selected) {
        if (
          canonical(provided.files) !==
          canonical(selected.sources.map((f) => f.name))
        )
          throw Error("PL.BINDING_CHANGED: primary files");
        for (const [folder, files] of [
          ["student", selected.sources],
          ["tests", selected.tests],
        ] as const) {
          for (const f of files) {
            const path = join(scratch, q.id, folder, f.name);
            await Deno.mkdir(dirname(path), { recursive: true });
            await Deno.writeFile(path, f.bytes);
          }
        }
        await Deno.writeTextFile(
          join(scratch, q.id, "tests/grading-job.json"),
          JSON.stringify(selected.descriptor),
        );
        const project = projects.find((p) => p.exerciseId === q.id);
        const profile = project
          ? registryInput?.profiles?.[project.check.runtime]
          : undefined;
        const external = provided.externalGradingOptions;
        if (
          !profile?.image ||
          !record(external) ||
          external.image !== profile.image ||
          external.enableNetworking !== false
        ) {
          throw Error(
            "PL.RUNTIME_INVALID: exact registered image binding required",
          );
        }
      }
    }
    result = await exportPrairieLearn(
      delivery.publicPackage,
      {
        projectRoot: scratch,
        projects: paths,
        studentArtifacts: artifacts,
        nativeAnswers,
        deferPublish: true,
        nativeBody: true,
        nativeAuxiliary: auxiliary,
      },
      binding.value,
      output,
    );
    if (!result || !("discard" in result)) {
      throw Error("PL.PUBLICATION_INVALID: missing staged output");
    }
    save(result);
    await fence();
  } finally {
    await Deno.remove(scratch, { recursive: true });
  }
  return result;
}
