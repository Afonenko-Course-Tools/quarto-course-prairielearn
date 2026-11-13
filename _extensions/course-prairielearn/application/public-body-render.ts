import type {
  BodyResource,
  MaterializableCondition,
  PublicBodyPackage,
} from "course-core/public.ts";
import type { NativeAuxiliary } from "./native-auxiliary.ts";
import type { DiagnosticContext } from "./diagnostics.ts";
import { fail, fields, record, safe } from "./export-files.ts";
import { uuid } from "./export-identity.ts";
import { canonical } from "./source-selection.ts";
import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
async function commandImplementation(
  args: string[],
  input: string,
  context: DiagnosticContext,
  auxiliary?: NativeAuxiliary,
): Promise<string> {
  const tool =
    (auxiliary ? auxiliary.environment.QUARTO : Deno.env.get("QUARTO")) ||
    "quarto";
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
  // Native composition сохраняет собственный frozen env и pre/post fences.
  // Ordinary ABI identity не требует разрешения на чтение полного env.
  const ordinaryEnvironment = () => {
    const baseEnv = {};
    const env = __metrics.childEnv(baseEnv);
    return env === baseEnv
      ? { env }
      : {
          env: __metrics.childEnv(Deno.env.toObject()),
          clearEnv: true,
        };
  };
  const environment = auxiliary
    ? { env: await auxiliary.before(), clearEnv: true }
    : undefined;
  let child: Deno.ChildProcess;
  try {
    child = new Deno.Command(tool, {
      args,
      ...(environment ?? ordinaryEnvironment()),
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
  await auxiliary?.after();
  if (!result.success) throw external(result, result);
  if (writingFailure) throw external(writingFailure, result);
  return new TextDecoder().decode(result.stdout);
}
export async function renderPublicBody(
  p: Pick<PublicBodyPackage, "owner" | "apiVersion" | "resources">,
  nodes: MaterializableCondition["body"],
  key: string,
  questionContext: DiagnosticContext,
  resourceBase: string,
  clientFilesToken: string,
  options: {
    preserveBibliography?: boolean | undefined;
    auxiliary?: NativeAuxiliary | undefined;
  } = {},
): Promise<{ html: string; files: { name: string; data: Uint8Array }[] }> {
  const questionFail = (
    message: string,
    field: string,
    cause?: unknown,
  ): never => fail(message, { ...questionContext, field }, cause);
  const files: { name: string; data: Uint8Array }[] = [];
  const authored = JSON.stringify(nodes);
  let markerIndex = 0;
  while (authored.includes("PL_CLIENT_FILE_URL_TOKEN_" + markerIndex)) {
    markerIndex++;
  }
  const resourceMarker = "PL_CLIENT_FILE_URL_TOKEN_" + markerIndex;
  const resources = new Map<string, BodyResource>();
  const declaredResources = new Map<string, BodyResource>();
  for (const resource of p.resources) {
    const previous = declaredResources.get(resource.target);
    if (previous && canonical(previous) !== canonical(resource)) {
      questionFail(
        "Неоднозначный публичный ресурс: " + resource.target,
        "condition.resource",
      );
    }
    declaredResources.set(resource.target, resource);
  }
  const anchorPrefix = "pl-" + (await uuid(key)) + "-";
  const anchors = new Map<string, string>();
  // TableHead/Body/Foot, Row and Cell carry semantic Attr arrays, not t nodes.
  const list = (value: unknown): unknown[] => {
    if (!Array.isArray(value)) {
      return questionFail("Неверный массив native AST", "condition");
    }
    return value;
  };
  const attr = (value: unknown): unknown[] => {
    const parts = list(value);
    if (
      parts.length !== 3 ||
      typeof parts[0] !== "string" ||
      !list(parts[1]).every((v) => typeof v === "string") ||
      !list(parts[2]).every(
        (v) =>
          Array.isArray(v) &&
          v.length === 2 &&
          v.every((x: unknown) => typeof x === "string"),
      )
    )
      return questionFail("Неверный Attr native AST", "condition");
    return parts;
  };
  const nodeAttrs = (node: unknown): unknown[][] => {
    if (!record(node) || typeof node.t !== "string") return [];
    if (node.t === "Header") return [attr(list(node.c)[1])];
    if (node.t === "Table") {
      const c = list(node.c),
        head = list(c[3]),
        bodies = list(c[4]).map(list),
        foot = list(c[5]);
      const rows = [
        ...list(head[1]),
        ...bodies.flatMap((body) => [...list(body[2]), ...list(body[3])]),
        ...list(foot[1]),
      ].map(list);
      return [
        attr(c[0]),
        attr(head[0]),
        ...bodies.map((body) => attr(body[0])),
        attr(foot[0]),
        ...rows.flatMap((row) => [
          attr(row[0]),
          ...list(row[1]).map((cell) => attr(list(cell)[0])),
        ]),
      ];
    }
    return [
      "Div",
      "Span",
      "CodeBlock",
      "Code",
      "Link",
      "Image",
      "Figure",
    ].includes(node.t)
      ? [attr(list(node.c)[0])]
      : [];
  };
  const bibliographyTargets = new Set<string>();
  const collectBibliographyTargets = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collectBibliographyTargets);
      return;
    }
    if (!record(value)) return;
    for (const attr of nodeAttrs(value)) {
      if (typeof attr[0] === "string" && attr[0]) {
        bibliographyTargets.add(attr[0]);
      }
    }
    Object.values(value).forEach(collectBibliographyTargets);
  };
  const projectBibliography = (value: unknown, links = false): unknown => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => {
        const next = projectBibliography(item, links);
        return next === undefined ? [] : [next];
      });
    }
    if (!record(value)) return value;
    if (
      !links &&
      (value.t === "Cite" ||
        (value.t === "Div" &&
          (attr(list(value.c)[0])[0] === "refs" ||
            list(attr(list(value.c)[0])[1]).some(
              (c) =>
                typeof c === "string" &&
                ["references", "csl-bib-body"].includes(c),
            ))))
    ) {
      collectBibliographyTargets(value);
      return undefined;
    }
    if (
      links &&
      value.t === "Link" &&
      typeof list(list(value.c)[2])[0] === "string"
    ) {
      let target = "";
      try {
        const href = list(list(value.c)[2])[0];
        target =
          typeof href === "string" && href.startsWith("#")
            ? decodeURIComponent(href.slice(1))
            : "";
      } catch {
        target = "";
      }
      if (bibliographyTargets.has(target)) return undefined;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        projectBibliography(item, links),
      ]),
    );
  };
  // A copy; bibliography links are removed only for targets removed above.
  const blocks = options.preserveBibliography
    ? structuredClone(nodes)
    : projectBibliography(projectBibliography(nodes), true);
  const indexAnchors = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(indexAnchors);
      return;
    }
    if (!record(value)) return;
    for (const attr of nodeAttrs(value)) {
      if (typeof attr[0] === "string" && attr[0]) {
        if (anchors.has(attr[0])) {
          questionFail(
            "Повторная цель в публичном вопросе: " + attr[0],
            "condition.reference",
          );
        }
        anchors.set(attr[0], anchorPrefix + attr[0]);
      }
    }
    Object.values(value).forEach(indexAnchors);
  };
  indexAnchors(blocks);
  const mapReference = (node: Record<string, unknown>): void => {
    const targetPair = list(list(node.c)[2]);
    const href = targetPair[0];
    if (typeof href !== "string") {
      return questionFail("Неверная ссылка native AST", "condition.reference");
    }
    const split = href.search(/[?#]/),
      path = split < 0 ? href : href.slice(0, split),
      suffix = split < 0 ? "" : href.slice(split);
    const resource = declaredResources.get(path);
    if (node.t === "Link" && href.startsWith("#")) {
      let target = "";
      try {
        target = decodeURIComponent(href.slice(1));
      } catch (cause) {
        questionFail(
          "Неверная fragment ссылка: " + href,
          "condition.reference",
          cause,
        );
      }
      const actual = anchors.get(target);
      if (!actual) {
        questionFail(
          "Цель ссылки отсутствует в публичном вопросе: " + href,
          "condition.reference",
        );
      }
      targetPair[0] = "#" + actual;
    } else if (resource) {
      if (
        !safe(resource.target) ||
        /[?#]/.test(resource.target) ||
        resource.owner !== p.owner ||
        resource.visibility !== "public" ||
        typeof resource.data !== "string"
      ) {
        questionFail(
          "Неверный публичный ресурс: " + href,
          "condition.resource",
        );
      }
      resources.set(resource.target, resource);
      targetPair[0] = resourceMarker + "/" + resource.target + suffix;
    } else if (!(node.t === "Link" && /^https?:\/\//.test(href))) {
      questionFail(
        "Ресурс условия отсутствует в публичной поставке: " + href,
        "condition.resource",
      );
    }
  };
  const map = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(map);
      return;
    }
    if (!record(node)) return;
    if (typeof node.t !== "string") {
      Object.values(node).forEach(map);
      return;
    }
    if (
      ["RawBlock", "RawInline", "Note"].includes(node.t) ||
      (node.t === "Cite" &&
        (!options.preserveBibliography ||
          !Array.isArray(node.c) ||
          node.c.length !== 2 ||
          !Array.isArray(node.c[0]) ||
          !Array.isArray(node.c[1])))
    ) {
      questionFail("Неподдерживаемый узел условия: " + node.t, "condition");
    }
    for (const attr of nodeAttrs(node)) {
      if (typeof attr[0] === "string" && attr[0]) {
        const mapped = anchors.get(attr[0]);
        if (!mapped) {
          return questionFail("Отсутствует индекс Attr", "condition.reference");
        }
        attr[0] = mapped;
      }
    }
    if (
      ["Div", "Span", "CodeBlock", "Code"].includes(node.t) &&
      list(attr(list(node.c)[0])[1]).some(
        (c) =>
          typeof c === "string" &&
          [
            "answer",
            "answer-spec",
            "correct",
            "solution",
            "grading-notes",
          ].includes(c),
      )
    )
      questionFail("Закрытая отметка в публичном условии", "condition");
    if (node.t === "Image" || node.t === "Link") mapReference(node);
    if (node.t === "Link") {
      const href = list(list(node.c)[2])[0];
      if (typeof href !== "string") {
        return questionFail(
          "Неверная ссылка native AST",
          "condition.reference",
        );
      }
      if (!href.startsWith("#")) {
        const attributes = attr(list(node.c)[0]),
          pairs = list(attributes[2]).map(list);
        const filtered = pairs.filter(
          (pair) => pair[0] !== "target" && pair[0] !== "rel",
        );
        const oldRel = pairs.find((pair) => pair[0] === "rel")?.[1];
        filtered.push(
          ["target", "_blank"],
          [
            "rel",
            [
              ...new Set([
                ...(typeof oldRel === "string"
                  ? oldRel.split(/\s+/).filter(Boolean)
                  : []),
                "noopener",
                "noreferrer",
              ]),
            ].join(" "),
          ],
        );
        attributes[2] = filtered;
      }
    }
    Object.values(node).forEach((value) => {
      if (Array.isArray(value)) value.forEach(map);
      else map(value);
    });
  };
  list(blocks).forEach(map);
  for (const r of resources.values()) {
    let bytes = new Uint8Array();
    try {
      bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
    } catch (cause) {
      questionFail(
        "Неверная кодировка ресурса: " + r.target,
        "resources.data",
        cause,
      );
    }
    files.push({
      name: resourceBase + "/" + r.target,
      data: bytes,
    });
  }
  const authoredHtml = await command(
    ["pandoc", "--from=json", "--to=html5", "--mathml"],
    JSON.stringify({ "pandoc-api-version": p.apiVersion, meta: {}, blocks }),
    questionContext,
    options.auxiliary,
  );
  const html = authoredHtml
    .replaceAll("{{", "&#123;&#123;")
    .replaceAll("}}", "&#125;&#125;")
    .replaceAll(resourceMarker + "/", clientFilesToken + "/");
  return { html, files };
}
const command = __metrics.wrapAsync(
  {
    id: "course-prairielearn.application.export.command",
    kind: "command",
  },
  commandImplementation,
);
