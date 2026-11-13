import type { PublicBodyPackage } from "course-core/public.ts";
import type { CourseExportPlan } from "./course-export-plan.ts";
import type { OwnedExportOutput } from "./export-output.ts";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { renderPublicBody } from "./public-body-render.ts";
import { canonical } from "./source-selection.ts";
import { qualifiedSlots } from "./slots.ts";
export class CourseOverviews {
  private readonly menuBodies = new Map<string, PublicBodyPackage>();
  constructor(
    private readonly plan: CourseExportPlan,
    private readonly output: OwnedExportOutput,
  ) {}
  async render(work: CourseExportPlan["works"][number], p: PublicBodyPackage) {
    const { input, unitMenus } = this.plan,
      stage = this.output.stage;
    const contexts = [{ work, body: p, menu: false }];
    for (const menu of unitMenus.get(work.id) ?? []) {
      let body = this.menuBodies.get(menu.id);
      if (!body) {
        body = await input.body(menu.id);
        this.menuBodies.set(menu.id, body);
      }
      contexts.push({
        work: menu,
        body,
        menu: true,
      });
    }
    const overviewParts: string[] = [];
    for (const context of contexts) {
      const publicWork = context.body.works?.[0];
      if (
        !publicWork ||
        publicWork.key !== input.courseId + "/" + context.work.id ||
        context.body.owner !== input.courseId ||
        context.body.schema !== "course-body-package-v2" ||
        !Array.isArray(context.body.resources) ||
        (context.menu &&
          (publicWork.source !== context.work.source ||
            !Array.isArray(publicWork.introduction))) ||
        (publicWork.introduction !== undefined &&
          !Array.isArray(publicWork.introduction))
      ) {
        throw new Error(
          "PL публичное введение не соответствует работе: " + context.work.id,
        );
      }
      if (
        (context.menu || unitMenus.has(context.work.id)) &&
        canonical(publicWork.slots) !==
          canonical(qualifiedSlots(input.courseId, context.work))
      ) {
        throw Error(
          "PL публичный состав не соответствует source unit/menu: " +
            context.work.id,
        );
      }
      // Only the independent public projection; never raw menu.body/full AST.
      const rendered = await renderPublicBody(
        context.body,
        publicWork.introduction ?? [],
        publicWork.key,
        {
          source: publicWork.source,
          id: context.work.id,
          field: "introduction",
        },
        "clientFilesCourse",
        "{{ client_files_course }}",
        {
          preserveBibliography: input.nativeBody,
          auxiliary: input.nativeAuxiliary,
        },
      );
      overviewParts.push(rendered.html);
      for (const file of rendered.files) {
        const target = join(stage, file.name);
        await Deno.mkdir(dirname(target), { recursive: true });
        try {
          if (!isDeepStrictEqual(await Deno.readFile(target), file.data)) {
            throw new Error(
              "PL конфликт публичного ресурса обзора: " + file.name,
            );
          }
        } catch (e) {
          if (!(e instanceof Deno.errors.NotFound)) throw e;
          await Deno.writeFile(target, file.data);
        }
      }
    }
    return { html: overviewParts.join("\n") };
  }
}
