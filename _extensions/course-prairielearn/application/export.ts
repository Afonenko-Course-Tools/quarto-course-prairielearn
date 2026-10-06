import { dirname, isAbsolute, join, relative, resolve } from "node:path";
const fail = (message: string): never => {
  throw Error("ADAPTER: " + message);
};
const record = (v: any) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const safe = (v: unknown): v is string =>
  typeof v === "string" && !!v && !v.includes("\\") && !v.includes("\0") &&
  !isAbsolute(v) && !v.split("/").some((p) => !p || p === "." || p === "..");
const fields = (v: any, required: string[], optional: string[] = []) =>
  record(v) && required.every((k) => Object.hasOwn(v, k)) &&
  Object.keys(v).every((k) => [...required, ...optional].includes(k));
export interface ProjectContext {
  projectRoot: string;
  projects: Record<string, string>;
}
async function command(args: string[], input: string): Promise<string> {
  const child = new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(input));
  await writer.close();
  const result = await child.output();
  if (!result.success) fail(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout);
}
async function uuid(key: string): Promise<string> {
  // UUIDv5 DNS namespace; identity is course/exercise, never a source path.
  const ns = new Uint8Array([
    0x6b,
    0xa7,
    0xb8,
    0x10,
    0x9d,
    0xad,
    0x11,
    0xd1,
    0x80,
    0xb4,
    0x00,
    0xc0,
    0x4f,
    0xd4,
    0x30,
    0xc8,
  ]);
  const name = new TextEncoder().encode("quarto-course-prairielearn:" + key),
    bytes = new Uint8Array(ns.length + name.length);
  bytes.set(ns);
  bytes.set(name, ns.length);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes)).slice(
    0,
    16,
  );
  h[6] = (h[6] & 15) | 80;
  h[8] = (h[8] & 63) | 128;
  const hex = Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
async function files(
  root: string,
): Promise<{ name: string; data: Uint8Array }[]> {
  const collected: { name: string; data: Uint8Array }[] = [];
  async function walk(directory: string) {
    if ((await Deno.lstat(directory)).isSymlink) {
      fail("symlink in project files");
    }
    for await (const entry of Deno.readDir(directory)) {
      const path = join(directory, entry.name);
      if (entry.isSymlink) fail("symlink in project files");
      if (
        entry.name.startsWith(".") ||
        ["build", "node_modules", "_generated", "_extensions"].includes(
          entry.name,
        )
      ) continue;
      if (entry.isDirectory) await walk(path);
      else if (entry.isFile) {
        collected.push({
          name: relative(root, path).replaceAll("\\", "/"),
          data: await Deno.readFile(path),
        });
      } else fail("special project file");
    }
  }
  await walk(root);
  return collected.sort((a, b) => a.name.localeCompare(b.name));
}
export async function exportPrairieLearn(
  p: any,
  context: ProjectContext,
  binding: any,
  output: string,
): Promise<void> {
  if (
    !fields(p, [
      "schema",
      "owner",
      "release",
      "apiVersion",
      "questions",
      "works",
      "resources",
    ]) || p?.schema !== "course-body-package-v1" ||
    !/^([a-z][a-z0-9-]*)$/.test(p.owner) || !Array.isArray(p.questions) ||
    !p.questions.length || !Array.isArray(p.resources) ||
    !Array.isArray(p.apiVersion)
  ) fail("current selected public body package required");
  if (
    !fields(binding, ["questions"]) || !record(binding.questions) ||
    Object.keys(binding.questions).length !== p.questions.length
  ) fail("explicit per-question PL binding required");
  const root = await Deno.realPath(context.projectRoot), out = resolve(output);
  try {
    await Deno.lstat(out);
    fail("output already exists; use a fresh delivery directory");
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  if (
    !Array.isArray(p.works) || p.works.length !== 1 ||
    !Array.isArray(p.works[0].items) || !p.works[0].items.length ||
    new Set(p.works[0].items).size !== p.works[0].items.length ||
    p.works[0].items.length !== p.questions.length ||
    p.questions.some((q: any) => !p.works[0].items.includes(q.key))
  ) fail("selected work question closure required");
  const prepared: { name: string; data: Uint8Array }[] = [];
  const text = (name: string, data: string) =>
    prepared.push({ name, data: new TextEncoder().encode(data) });
  const keys = new Set<string>();
  for (const q of p.questions) {
    if (
      !fields(q, [
        "owner",
        "id",
        "key",
        "source",
        "visibility",
        "answerType",
        "condition",
        "publicAnswer",
      ]) || q.owner !== p.owner || q.key !== p.owner + "/" + q.id ||
      !/^exr-[a-z0-9][a-z0-9-]*$/.test(q.id) || keys.has(q.key) ||
      q.visibility !== "public" || q.answerType !== "manual" ||
      !Array.isArray(q.condition) || !Array.isArray(q.publicAnswer)
    ) fail("invalid public question");
    keys.add(q.key);
    const b = binding.questions[q.id];
    if (
      !fields(b, ["topic", "files", "externalGradingOptions"]) ||
      typeof b.topic !== "string" || !b.topic.trim() ||
      !Array.isArray(b.files) || !b.files.length ||
      new Set(b.files).size !== b.files.length || b.files.some((f: unknown) =>
        !safe(f) || /[",<>]/.test(String(f))
      )
    ) fail("explicit topic, submission files and external grader required");
    const grading = b.externalGradingOptions;
    if (
      !fields(grading, ["image"], [
        "entrypoint",
        "timeout",
        "enableNetworking",
        "environment",
      ]) || typeof grading.image !== "string" || !grading.image.trim() ||
      grading.timeout !== undefined &&
        (!Number.isInteger(grading.timeout) || grading.timeout < 1 ||
          grading.timeout > 600) ||
      grading.enableNetworking !== undefined &&
        typeof grading.enableNetworking !== "boolean" ||
      grading.entrypoint !== undefined &&
        !(typeof grading.entrypoint === "string" ||
          Array.isArray(grading.entrypoint) && grading.entrypoint.length &&
            grading.entrypoint.every((x: unknown) => typeof x === "string")) ||
      grading.environment !== undefined &&
        (!record(grading.environment) ||
          Object.values(grading.environment).some((x) => typeof x !== "string"))
    ) fail("invalid external grader binding");
    const project = context.projects[q.id];
    if (
      typeof project !== "string" || !project.startsWith("/") ||
      !safe(project.slice(1))
    ) fail("project path required");
    const source = resolve(root, project.slice(1));
    let walk = root;
    for (const part of project.slice(1).split("/")) {
      walk = join(walk, part);
      if ((await Deno.lstat(walk)).isSymlink) fail("symlink in project path");
    }
    if ((await Deno.realPath(source)) !== source) fail("project escapes bank");
    const student = await files(join(source, "student")),
      tests = await files(join(source, "tests"));
    if (!student.length || !tests.length) {
      fail("student and tests project files required");
    }
    const base = "questions/" + q.key;
    for (const f of student) {
      prepared.push({
        name: base + "/clientFilesQuestion/" + f.name,
        data: f.data,
      });
    }
    for (const f of tests) {
      prepared.push({ name: base + "/tests/" + f.name, data: f.data });
    }
    const blocks = structuredClone(q.condition);
    const resources = new Map<string, any>();
    const map = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (["RawBlock", "RawInline", "Cite", "Note"].includes(node.t)) {
        fail("unsupported native node " + node.t);
      }
      if (node.t === "Header") node.c[1][0] = "";
      if (
        ["Div", "Span", "CodeBlock", "Code"].includes(node.t) &&
        node.c[0][1].some((c: string) =>
          ["answer", "answer-spec", "correct", "solution", "grading-notes"]
            .includes(c)
        )
      ) fail("private marker in public condition");
      if (node.t === "Image" || node.t === "Link") {
        const href = node.c[2][0],
          resource = p.resources.find((r: any) => r.target === href);
        if (resource) {
          if (
            !safe(resource.target) || resource.owner !== p.owner ||
            resource.visibility !== "public" ||
            typeof resource.data !== "string"
          ) fail("invalid resource");
          resources.set(resource.target, resource);
          node.c[2][0] = "PL_CLIENT_FILE_URL_TOKEN/" + resource.target;
        } else if (!(node.t === "Link" && /^https?:\/\//.test(href))) {
          fail("unmapped condition resource");
        }
      }
      Object.values(node).forEach((value) => {
        if (Array.isArray(value)) value.forEach(map);
        else map(value);
      });
    };
    blocks.forEach(map);
    for (const r of resources.values()) {
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      } catch {
        fail("resource encoding");
      }
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new Uint8Array(bytes!)),
        ),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== r.sha256) fail("resource hash mismatch");
      prepared.push({
        name: base + "/clientFilesQuestion/" + r.target,
        data: bytes!,
      });
    }
    const authoredHtml = await command(
      ["pandoc", "--from=json", "--to=html5", "--mathml"],
      JSON.stringify({ "pandoc-api-version": p.apiVersion, meta: {}, blocks }),
    );
    const html = authoredHtml.replaceAll("{{", "&#123;&#123;").replaceAll(
      "}}",
      "&#125;&#125;",
    ).replaceAll(
      "PL_CLIENT_FILE_URL_TOKEN",
      "{{options.client_files_question_url}}",
    );
    const escape = (v: string) =>
      v.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll(
        "<",
        "&lt;",
      ).replaceAll(">", "&gt;");
    const downloads = student.map((f) =>
      '<pl-file-download file-name="' + escape(f.name) + '"></pl-file-download>'
    ).join("\n");
    text(
      base + "/question.html",
      "<pl-question-panel>\n" + html + "\n" + downloads +
        '\n<pl-file-upload file-names="' + escape(b.files.join(",")) +
        '"></pl-file-upload>\n</pl-question-panel>\n<pl-submission-panel><pl-external-grader-results></pl-external-grader-results></pl-submission-panel>\n',
    );
    text(
      base + "/info.json",
      JSON.stringify(
        {
          uuid: await uuid(q.key),
          type: "v3",
          title: q.id,
          topic: b.topic,
          gradingMethod: "External",
          singleVariant: true,
          showCorrectAnswer: false,
          partialCredit: false,
          externalGradingOptions: grading,
        },
        null,
        2,
      ) + "\n",
    );
  }
  if (new Set(prepared.map((f) => f.name)).size !== prepared.length) {
    fail("delivery file collision");
  }
  const stage = await Deno.makeTempDir({
    dir: dirname(out),
    prefix: ".pl-delivery-",
  });
  try {
    for (const f of prepared) {
      const path = join(stage, f.name);
      await Deno.mkdir(dirname(path), { recursive: true });
      await Deno.writeFile(path, f.data);
    }
    await Deno.writeTextFile(
      join(stage, "delivery.json"),
      JSON.stringify(
        {
          course: p.owner,
          release: p.release,
          works: p.works,
          questions: [...keys],
        },
        null,
        2,
      ) + "\n",
    );
    await Deno.rename(stage, out);
  } catch (e) {
    await Deno.remove(stage, { recursive: true });
    throw e;
  }
}
