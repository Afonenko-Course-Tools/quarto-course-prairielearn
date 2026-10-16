import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-prairielearn");
import { validateSlots } from "./slots.ts";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { diagnostic, type DiagnosticContext } from "./diagnostics.ts";
const fail = (
  message: string,
  context?: DiagnosticContext,
  cause?: unknown,
): never => {
  throw diagnostic("ADAPTER", message, context, cause);
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
async function command(
  args: string[],
  input: string,
  context: DiagnosticContext,
): Promise<string> {
  const tool = Deno.env.get("QUARTO") || "quarto";
  const external = (cause: unknown, result?: Deno.CommandOutput) => {
    const stdout = result ? new TextDecoder().decode(result.stdout) : "";
    const stderr = result ? new TextDecoder().decode(result.stderr) : "";
    const error = Object.assign(
      new Error(
        `course-prairielearn: внешний инструмент ${tool} не выполнил преобразование Pandoc` +
          (result ? ` (код выхода ${result.code})` : "") +
          `\n  source: ${context.source || ""}\n  id: ${
            context.id || ""
          }\n  field: condition` +
          (stdout ? `\nstdout:\n${stdout}` : "") +
          (stderr ? `\nstderr:\n${stderr}` : ""),
        { cause },
      ),
      { tool, exitCode: result?.code, stdout, stderr },
    );
    error.name = "ExternalToolFailure";
    return error;
  };
  let child: Deno.ChildProcess;
  try {
    child = new Deno.Command(tool, {
      args,
      env: __metrics.childEnv({}),
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
  } catch (cause) {
    throw external(cause);
  }
  let writingFailure: unknown;
  try {
    const writer = child.stdin.getWriter();
    try {
      await writer.write(new TextEncoder().encode(input));
    } finally {
      await writer.close();
    }
  } catch (cause) {
    writingFailure = cause;
  }
  const result = await child.output();
  if (!result.success) throw external(result, result);
  if (writingFailure) throw external(writingFailure, result);
  return new TextDecoder().decode(result.stdout);
}
export async function uuid(key: string): Promise<string> {
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
  context: DiagnosticContext,
  allowStudentGitignore = false,
): Promise<{ name: string; data: Uint8Array }[]> {
  const collected: { name: string; data: Uint8Array }[] = [];
  async function walk(directory: string) {
    if ((await Deno.lstat(directory)).isSymlink) {
      fail("Символьная ссылка в файлах проекта", context);
    }
    for await (const entry of Deno.readDir(directory)) {
      const path = join(directory, entry.name);
      if (entry.isSymlink) fail("Символьная ссылка в файлах проекта", context);
      if (
        (entry.name.startsWith(".") &&
          !(allowStudentGitignore && directory === root &&
            entry.name === ".gitignore" && entry.isFile)) ||
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
      } else fail("В проекте присутствует файл особого типа", context);
    }
  }
  await walk(root);
  return collected.sort((a, b) => a.name.localeCompare(b.name));
}
export async function renderPublicBody(
  p: any, nodes: any[], key: string, questionContext: DiagnosticContext,
  resourceBase: string, clientFilesToken: string,
): Promise<{html: string; files: {name: string; data: Uint8Array}[]}> {
  const questionFail = (message: string, field: string, cause?: unknown): never =>
    fail(message, {...questionContext, field}, cause);
  const files: {name: string; data: Uint8Array}[] = [];
    const blocks = structuredClone(nodes);
    const authored = JSON.stringify(nodes);
    let markerIndex = 0;
    while (authored.includes("PL_CLIENT_FILE_URL_TOKEN_" + markerIndex)) markerIndex++;
    const resourceMarker = "PL_CLIENT_FILE_URL_TOKEN_" + markerIndex;
    const resources = new Map<string, any>();
    const anchorPrefix = "pl-" + await uuid(key) + "-";
    const anchors = new Map<string, string>();
    // TableHead/Body/Foot, Row and Cell carry semantic Attr arrays, not t nodes.
    const nodeAttrs = (node:any):any[] => {
      if(node.t === "Header")return [node.c[1]];
      if(node.t === "Table"){
        const [, , , head, bodies, foot]=node.c;
        const rows=[...head[1],...bodies.flatMap((body:any)=>[...body[2],...body[3]]),...foot[1]];
        return [node.c[0],head[0],...bodies.map((body:any)=>body[0]),foot[0],...rows.flatMap((row:any)=>[row[0],...row[1].map((cell:any)=>cell[0])])];
      }
      return ["Div","Span","CodeBlock","Code","Link","Image","Figure"].includes(node.t)?[node.c[0]]:[];
    };
    const indexAnchors = (value: any) => {
      if (Array.isArray(value)) {
        value.forEach(indexAnchors);
        return;
      }
      if (!value || typeof value !== "object") return;
      for(const attr of nodeAttrs(value)){
        if (attr?.[0]) {
          if (anchors.has(attr[0])) {
            questionFail("Повторная цель в публичном вопросе: " + attr[0], "condition.reference");
          }
          anchors.set(attr[0], anchorPrefix + attr[0]);
        }
      }
      Object.values(value).forEach(indexAnchors);
    };
    indexAnchors(blocks);
    const map = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (["RawBlock", "RawInline", "Cite", "Note"].includes(node.t)) {
        questionFail("Неподдерживаемый узел условия: " + node.t, "condition");
      }
      for(const attr of nodeAttrs(node)){
        if(attr?.[0])attr[0]=anchors.get(attr[0]);
      }
      if (
        ["Div", "Span", "CodeBlock", "Code"].includes(node.t) &&
        node.c[0][1].some((c: string) =>
          ["answer", "answer-spec", "correct", "solution", "grading-notes"]
            .includes(c)
        )
      ) questionFail("Закрытая отметка в публичном условии", "condition");
      if (node.t === "Image" || node.t === "Link") {
        const href = node.c[2][0],
          resource = p.resources.find((r: any) => r.target === href);
        if (node.t === "Link" && href.startsWith("#")) {
          let target: string;
          try {
            target = decodeURIComponent(href.slice(1));
          } catch (cause) {
            questionFail("Неверная fragment ссылка: " + href, "condition.reference", cause);
          }
          const actual = anchors.get(target!);
          if (!actual) {
            questionFail("Цель ссылки отсутствует в публичном вопросе: " + href, "condition.reference");
          }
          node.c[2][0] = "#" + actual;
        } else if (resource) {
          if (
            !safe(resource.target) || resource.owner !== p.owner ||
            resource.visibility !== "public" ||
            typeof resource.data !== "string"
          ) {
            questionFail(
              "Неверный публичный ресурс: " + href,
              "condition.resource",
            );
          }
          resources.set(resource.target, resource);
          node.c[2][0] = resourceMarker + "/" + resource.target;
        } else if (!(node.t === "Link" && /^https?:\/\//.test(href))) {
          questionFail(
            "Ресурс условия отсутствует в публичной поставке: " + href,
            "condition.resource",
          );
        }
      }
      if (node.t === "Link" && !node.c[2][0].startsWith("#")) {
        const attributes = node.c[0][2].filter((pair: string[]) => !["target", "rel"].includes(pair[0]));
        const oldRel = node.c[0][2].find((pair: string[]) => pair[0] === "rel")?.[1] ?? "";
        attributes.push(["target", "_blank"], ["rel", [...new Set([...oldRel.split(/\s+/).filter(Boolean), "noopener", "noreferrer"])].join(" ")]);
        node.c[0][2] = attributes;
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
      } catch (cause) {
        questionFail(
          "Неверная кодировка ресурса: " + r.target,
          "resources.data",
          cause,
        );
      }
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new Uint8Array(bytes!)),
        ),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== r.sha256) {
        questionFail(
          "Контрольная сумма ресурса не совпадает: " + r.target,
          "resources.sha256",
        );
      }
      files.push({
        name: resourceBase + "/" + r.target,
        data: bytes!,
      });
    }
    const authoredHtml = await command(
      ["pandoc", "--from=json", "--to=html5", "--mathml"],
      JSON.stringify({ "pandoc-api-version": p.apiVersion, meta: {}, blocks }),
      questionContext,
    );
    const html = authoredHtml.replaceAll("{{", "&#123;&#123;").replaceAll(
      "}}",
      "&#125;&#125;",
    ).replaceAll(resourceMarker + "/", clientFilesToken + "/");
  return {html, files};
}
function metadata(q: any): string {
  const difficulty: Record<string, string> = {introductory: "Начальный", intermediate: "Средний", advanced: "Высокий"};
  const parts = [q.difficulty ? "Сложность: " + difficulty[q.difficulty] : "", q.time !== undefined ? "Время: " + q.time + " мин" : ""].filter(Boolean);
  return parts.length ? '<p class="course-question-metadata">' + parts.join(' · ') + '</p>\n' : '';
}
export async function exportPrairieLearn(
  p: any,
  context: ProjectContext,
  binding: any,
  output: string,
): Promise<void> {
  const work = Array.isArray(p?.works) ? p.works[0] : undefined;
  const workContext: DiagnosticContext = {
    source: work?.source,
    id: work?.id,
    field: "works",
    hint: "Экспортируйте одну выбранную работу через установленный Core",
  };
  const refuse = (message: string, field: string): never =>
    fail(message, { ...workContext, field });
  if (
    !fields(p, [
      "schema",
      "owner",
      "release",
      "apiVersion",
      "questions",
      "works",
      "resources",
    ]) || p?.schema !== "course-body-package-v2" ||
    !/^([a-z][a-z0-9-]*)$/.test(p.owner) || !Array.isArray(p.questions) ||
    !p.questions.length || !Array.isArray(p.resources) ||
    !Array.isArray(p.apiVersion)
  ) {
    refuse(
      "Требуется актуальный публичный Body-пакет выбранной работы",
      "body-package",
    );
  }
  if (
    !fields(binding, ["questions"]) || !record(binding.questions) ||
    Object.keys(binding.questions).length !== p.questions.length
  ) {
    refuse(
      "Требуется явная привязка PrairieLearn для каждого выбранного вопроса",
      "binding.questions",
    );
  }
  const root = await Deno.realPath(context.projectRoot), out = resolve(output);
  try {
    await Deno.lstat(out);
    fail("Каталог результата уже существует", {
      ...workContext,
      source: out,
      field: "output",
      hint: "Выберите новый каталог поставки",
    });
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  if(!Array.isArray(p.works)||p.works.length!==1)refuse("Требуется одна работа","works");
  if(!fields(work,["owner","id","key","source","kind","title","slots"],["theoryTime","relatedExercise","introduction"])||work.owner!==p.owner||work.key!==p.owner+"/"+work.id||typeof work.id!=="string"||!/^[a-z][a-z0-9-]*$/.test(work.id)||typeof work.source!=="string"||!work.source||typeof work.title!=="string"||!work.title.trim()||!["lab","seminar","practical","test"].includes(work.kind)||work.relatedExercise!==undefined&&(typeof work.relatedExercise!=="string"||!/^exr-[a-z0-9][a-z0-9-]*$/.test(work.relatedExercise))||work.theoryTime!==undefined&&(typeof work.theoryTime!=="number"||!Number.isFinite(work.theoryTime)||work.theoryTime<=0))refuse("Неверные поля работы v2","works");
  try {validateSlots(work.slots,p.owner,work.id,true);} catch(error){refuse("Неверные позиции Body v2: "+String(error),"works.slots");}
  const candidates=work.slots.flatMap((slot:any)=>slot.candidates);
  if(candidates.length!==p.questions.length||p.questions.some((q:any)=>!candidates.includes(q?.key)))refuse("Каталог должен содержать всех кандидатов","works.slots");
  const assignments=Object.fromEntries(work.slots.flatMap((slot:any)=>slot.candidates.map((id:string)=>[id,slot.assignment])));
  const prepared: { name: string; data: Uint8Array }[] = [];
  const text = (name: string, data: string) =>
    prepared.push({ name, data: new TextEncoder().encode(data) });
  const keys = new Set<string>();
  for (const q of p.questions) {
    const questionContext: DiagnosticContext = {
      source: q?.source,
      id: q?.id,
      related: work ? [{ source: work.source, id: work.id }] : [],
      hint: "Проверьте условие, проект и явную привязку этого вопроса",
    };
    const questionFail = (
      message: string,
      field: string,
      cause?: unknown,
    ): never => fail(message, { ...questionContext, field }, cause);
    if (
      !fields(q, [
        "owner",
        "id",
        "key",
        "title",
        "source",
        "visibility",
        "statementVisibility",
        "hasPublicSolution",
        "answerType",
        "condition",
        "publicAnswer",
      ], ["purpose", "difficulty", "time"]) || q.owner !== p.owner ||
      q.key !== p.owner + "/" + q.id ||
      typeof q.title !== "string" || !q.title.trim() ||
      q.difficulty !== undefined && !["introductory", "intermediate", "advanced"].includes(q.difficulty) ||
      q.time !== undefined && (typeof q.time !== "number" || !Number.isFinite(q.time) || q.time <= 0) ||
      !/^exr-[a-z0-9][a-z0-9-]*$/.test(q.id) || keys.has(q.key) ||
      q.visibility !== "public" ||
      !["open", "restricted"].includes(q.statementVisibility) ||
      typeof q.hasPublicSolution !== "boolean" ||
      q.purpose !== undefined &&
        !["demonstration", "discussion", "independent-study", "control"]
          .includes(q.purpose) ||
      q.answerType !== "manual" ||
      !Array.isArray(q.condition) || !Array.isArray(q.publicAnswer)
    ) questionFail("Неверный публичный вопрос", "questions");
    if (
      ["test", "practical"].includes(work.kind) &&
      q.statementVisibility !== "restricted"
    ) {
      questionFail(
        "В контрольной и практической работе требуется закрытое условие",
        "statementVisibility",
      );
    }
    if (
      assignments[q.key].stage === "demonstration" &&
      (q.statementVisibility !== "open" || q.purpose !== "demonstration" ||
        !q.hasPublicSolution)
    ) {
      questionFail(
        "Демонстрация требует открытого условия, роли demonstration и публичного решения",
        "works.assignments." + q.key + ".stage",
      );
    }
    keys.add(q.key);
    const b = binding.questions[q.id];
    if (
      !fields(b, ["topic", "files", "externalGradingOptions"], [
        "submission",
        "singleVariant",
      ]) ||
      b.singleVariant !== undefined && typeof b.singleVariant !== "boolean" ||
      typeof b.topic !== "string" || !b.topic.trim() ||
      !Array.isArray(b.files) || !b.files.length ||
      new Set(b.files).size !== b.files.length || b.files.some((f: unknown) =>
        !safe(f) || /[",<>]/.test(String(f))
      )
    ) {
      questionFail(
        "Требуются topic, принимаемые файлы и внешний проверяющий инструмент",
        "binding.questions." + q.id,
      );
    }
    const submission = b.submission ?? { mode: "upload" };
    if (
      !fields(submission, ["mode"], ["aceMode"]) ||
      !["upload", "editor"].includes(submission.mode) ||
      submission.aceMode !== undefined &&
        (submission.mode !== "editor" ||
          typeof submission.aceMode !== "string" ||
          !/^ace\/mode\/[a-z][a-z0-9_]*$/.test(submission.aceMode))
    ) {
      questionFail(
        "Неверный режим submission: upload либо editor с необязательным aceMode",
        "binding.questions." + q.id + ".submission",
      );
    }
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
    ) {
      questionFail(
        "Неверная привязка внешнего проверяющего инструмента",
        "binding.questions." + q.id + ".externalGradingOptions",
      );
    }
    const project = context.projects[q.id];
    if (
      typeof project !== "string" || !project.startsWith("/") ||
      !safe(project.slice(1))
    ) {
      questionFail(
        "Требуется путь проекта от корня выбранного проекта",
        "project",
      );
    }
    const source = resolve(root, project.slice(1));
    let walk = root;
    for (const part of project.slice(1).split("/")) {
      walk = join(walk, part);
      if ((await Deno.lstat(walk)).isSymlink) {
        questionFail(
          "Символьная ссылка в пути проекта",
          "project",
        );
      }
    }
    if ((await Deno.realPath(source)) !== source) {
      questionFail(
        "Проект выходит за пределы выбранного проекта",
        "project",
      );
    }
    const student = await files(join(source, "student"), {
        ...questionContext,
        field: "project.student",
      }, true),
      tests = await files(join(source, "tests"), {
        ...questionContext,
        field: "project.tests",
      });
    if (!student.length || !tests.length) {
      questionFail(
        "Требуются стартовые файлы student и проверяющие файлы tests",
        "project",
      );
    }
    const base = "questions/" + q.key;
    for (const f of submission.mode === "editor" ? [] : student) {
      prepared.push({
        name: base + "/clientFilesQuestion/" + f.name,
        data: f.data,
      });
    }
    for (const f of tests) {
      prepared.push({ name: base + "/tests/" + f.name, data: f.data });
    }
    const rendered = await renderPublicBody(p, q.condition, q.key, questionContext,
      base + "/clientFilesQuestion", "{{options.client_files_question_url}}");
    prepared.push(...rendered.files);
    const html = rendered.html;
    const escape = (v: string) =>
      v.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll(
        "<",
        "&lt;",
      ).replaceAll(">", "&gt;").replaceAll("{{", "&#123;&#123;").replaceAll(
        "}}",
        "&#125;&#125;",
      );
    let controls: string;
    if (submission.mode === "editor") {
      controls = b.files.map((name: string) => {
        const starter = student.find((file) => file.name === name);
        if (!starter || starter.data.length > 1024 * 1024) {
          questionFail(
            "Требуется UTF-8 starter для каждого editor файла",
            "project.student." + name,
          );
        }
        let source: string;
        try {
          source = new TextDecoder("utf-8", { fatal: true }).decode(
            starter!.data,
          );
          if (source.includes("\0")) throw new Error("NUL in source");
        } catch (cause) {
          questionFail(
            "Editor starter должен быть текстом UTF-8",
            "project.student." + name,
            cause,
          );
        }
        const code = escape(source!).replaceAll("{{", "&#123;&#123;")
          .replaceAll("}}", "&#125;&#125;");
        return '<pl-file-editor file-name="' + escape(name) + '"' +
          (submission.aceMode
            ? ' ace-mode="' + escape(submission.aceMode) + '"'
            : "") +
          ' normalize-to-ascii="false">' + code + "</pl-file-editor>";
      }).join("\n");
    } else {
      const downloads = student.map((f) =>
        '<pl-file-download file-name="' + escape(f.name) +
        '"></pl-file-download>'
      ).join("\n");
      controls = downloads + '\n<pl-file-upload file-names="' +
        escape(b.files.join(",")) + '"></pl-file-upload>';
    }
    text(
      base + "/question.html",
      "<pl-question-panel>\n" + metadata(q) + html + "\n" + controls +
        "\n</pl-question-panel>\n<pl-submission-panel><pl-external-grader-results></pl-external-grader-results></pl-submission-panel>\n",
    );
    text(
      base + "/info.json",
      JSON.stringify(
        {
          uuid: await uuid(q.key),
          type: "v3",
          title: q.title,
          topic: b.topic,
          gradingMethod: "External",
          ...(b.singleVariant !== undefined
            ? { singleVariant: b.singleVariant }
            : {}),
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
    refuse("Файлы поставки имеют совпадающие пути", "output");
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

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
uuid=__metrics.wrapAsync({id:"course-prairielearn.application.export.uuid",kind:"phase"},uuid);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
exportPrairieLearn=__metrics.wrapAsync({id:"course-prairielearn.application.export.exportPrairieLearn",kind:"phase"},exportPrairieLearn);

// @ts-expect-error JS допускает замену function binding; публичная сигнатура сохраняется.
command=__metrics.wrapAsync({id:"course-prairielearn.application.export.command",kind:"command"},command);
