import { dirname, join, resolve } from "node:path";
import { publishDirectory } from "./publication.ts";

/** The sole owner of temporary trees, optional private inventory and publication.
 * No renderer or policy lookup can publish an output independently. */
export class OwnedExportOutput {
  private state: "prepared" | "published" | "discarded" = "prepared";
  private privateStage: string | undefined;
  private scratch: string | undefined;
  private constructor(
    readonly stage: string,
    readonly output: string,
    private readonly environment: Readonly<Record<string, string>> | undefined,
    private readonly privateOutput?: string,
  ) {}
  static async create(
    output: string,
    environment?: Readonly<Record<string, string>>,
    privateOutput?: string,
  ) {
    const out = resolve(output),
      privateOut =
        privateOutput === undefined ? undefined : resolve(privateOutput);
    await freshOutput(out);
    if (privateOut !== undefined) await freshOutput(privateOut);
    const stage = await Deno.makeTempDir({
      dir: dirname(out),
      prefix: privateOut ? ".pl-course-" : ".pl-delivery-",
    });
    return new OwnedExportOutput(stage, out, environment, privateOut);
  }
  async scratchDirectory() {
    this.scratch ??= await Deno.makeTempDir({
      dir: dirname(this.output),
      prefix: ".pl-selected-",
    });
    return this.scratch;
  }
  async writeFiles(files: readonly { name: string; data: Uint8Array }[]) {
    for (const file of files) {
      const target = join(this.stage, file.name);
      await Deno.mkdir(dirname(target), { recursive: true });
      await Deno.writeFile(target, file.data);
    }
  }
  async writeJson(path: string, value: unknown) {
    const target = join(this.stage, path);
    await Deno.mkdir(dirname(target), { recursive: true });
    await Deno.writeTextFile(target, JSON.stringify(value, null, 2) + "\n");
  }
  async preparePrivate(value: unknown) {
    if (!this.privateOutput || this.privateStage) {
      throw Error("PL invalid private export preparation");
    }
    await Deno.mkdir(dirname(this.privateOutput), { recursive: true });
    this.privateStage = await Deno.makeTempFile({
      dir: dirname(this.privateOutput),
      prefix: ".pl-checks-",
    });
    await Deno.writeTextFile(
      this.privateStage,
      JSON.stringify(value, null, 2) + "\n",
    );
  }
  async releaseScratch() {
    if (this.scratch === undefined) return;
    const path = this.scratch;
    this.scratch = undefined;
    try {
      await Deno.remove(path, { recursive: true });
    } catch {
      /* Preserve primary failure. */
    }
  }
  async discard() {
    if (this.state !== "prepared") return;
    this.state = "discarded";
    let failure: unknown;
    for (const path of [this.stage, this.privateStage]) {
      if (path === undefined) continue;
      try {
        await Deno.remove(path, { recursive: true });
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) failure ??= error;
      }
    }
    await this.releaseScratch();
    if (failure !== undefined) throw failure;
  }
  async discardAfterFailure() {
    try {
      await this.discard();
    } catch {
      /* Preserve preparation/publication failure. */
    }
  }
  async publish() {
    if (this.state !== "prepared") {
      throw Error("PL export preparation already consumed");
    }
    try {
      await freshOutput(this.output);
      if (this.privateOutput !== undefined) {
        if (this.privateStage === undefined) {
          throw Error("PL private inventory not prepared");
        }
        await freshOutput(this.privateOutput);
        await Deno.link(this.privateStage, this.privateOutput);
      }
      try {
        await publishDirectory(this.stage, this.output, this.environment);
      } catch (error) {
        if (
          this.privateStage !== undefined &&
          this.privateOutput !== undefined
        ) {
          try {
            const source = await Deno.lstat(this.privateStage),
              target = await Deno.lstat(this.privateOutput);
            if (
              source.dev !== null &&
              source.ino !== null &&
              source.dev === target.dev &&
              source.ino === target.ino
            )
              await Deno.remove(this.privateOutput);
          } catch {
            /* Preserve publication failure; never remove a replacement. */
          }
        }
        throw error;
      }
      this.state = "published";
      if (this.privateStage !== undefined) await Deno.remove(this.privateStage);
      await this.releaseScratch();
    } catch (error) {
      await this.discardAfterFailure();
      throw error;
    }
  }
}
export async function freshOutput(path: string) {
  try {
    await Deno.lstat(path);
    throw Error("PL fresh output required: " + path);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}
