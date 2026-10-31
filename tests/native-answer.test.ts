import { exportCourse } from "../_extensions/course-prairielearn/application/export-course.ts";
import { exportPrairieLearn } from "../_extensions/course-prairielearn/application/export.ts";
import { infoQuestion } from "../_extensions/course-prairielearn/application/native-validators.js";
const forms = [{ type: "manual", submission: "text" }, {
  type: "numeric",
  key: { value: 734129, tolerance: { absolute: 0.1 } },
}, {
  type: "multipart",
  parts: [{
    type: "numeric",
    name: "first",
    label: "Часть 1",
    key: { value: 7, tolerance: { absolute: 0 } },
  }, {
    type: "manual",
    name: "reason",
    label: "Объяснение",
    submission: "text",
  }, {
    type: "numeric",
    name: "second",
    label: "Часть 2",
    key: { value: 9, tolerance: { absolute: 0 } },
  }],
}, {
  type: "matching",
  prompts: ["Кошка", "Собака"],
  options: ["Мяу", "Гав"],
  key: { pairs: { "Кошка": "Мяу", "Собака": "Гав" } },
}, { type: "single-choice", count: 3, correct: 1 }];
for (const answer of forms) {
  Deno.test(
    "native canonical " + answer.type +
      " exports private grading and finite equal leaves",
    async () => {
      const root = await Deno.makeTempDir({ prefix: "pl-answer-" });
      try {
        const id = "exr-answer",
          key = "fixture/" + id,
          manual = answer.type === "manual",
          pkg = {
            schema: "course-body-package-v2",
            owner: "fixture",
            release: "native",
            apiVersion: [1, 23, 1],
            questions: [{
              owner: "fixture",
              id,
              key,
              title: "Форма ответа",
              source: "bank.qmd",
              visibility: "public",
              statementVisibility: "open",
              hasPublicSolution: false,
              answerType: answer.type,
              condition: [{ t: "Para", c: [{ t: "Str", c: "Условие" }] }],
              publicAnswer: [],
            }],
            works: [{
              owner: "fixture",
              id: "sec-work",
              key: "fixture/sec-work",
              source: "work.qmd",
              kind: "lab",
              title: "Работа",
              slots: [{
                id: "fixture/sec-work/" + id,
                selection: "fixed",
                candidates: [key],
                assignment: { requirement: "required", workMode: "individual" },
              }],
            }],
            resources: [],
          };
        const prepared = await exportPrairieLearn(pkg, {
          projectRoot: root,
          projects: {},
          nativeAnswers: { [id]: answer },
          deferPublish: true,
        }, {
          questions: {
            [id]: {
              topic: "Java",
              ...(manual ? { grading: { method: "manual" } } : {}),
              submission: { mode: "upload" },
              files: [],
            },
          },
        }, root + "/out");
        try {
          await Deno.lstat(root + "/out");
          throw Error("native question output escaped before final fence");
        } catch (error) {
          if (!(error instanceof Deno.errors.NotFound)) throw error;
        }
        await prepared!.publish();
        const policy = manual
          ? { "auto-points": 0, "manual-points": 20 }
          : answer.type === "multipart"
          ? { "auto-points": 80, "manual-points": 20 }
          : { "question-points": 1 };
        const work = {
          id: "sec-work",
          source: "work.qmd",
          kind: "lab",
          title: "Работа",
          slots: [{
            id,
            selection: "fixed",
            candidates: [id],
            assignment: { requirement: "required", workMode: "individual" },
          }],
          extensions: {
            prairielearn: {
              attempts: 3,
              pass: { "at-least": 1 },
              assignment: { "student-label": "test" },
              ...policy,
            },
          },
        };
        const method = manual
          ? "manual"
          : answer.type === "multipart"
          ? "mixed"
          : "external";
        const config = {
          delivery: {
            book: "tasks",
            course: {
              name: "FIXTURE",
              title: "Проверка",
              timezone: "Europe/Minsk",
              topics: [{ name: "Java", color: "blue2", description: "Java" }],
            },
            instances: {
              test: {
                title: "Проверка",
                "self-enrollment": false,
                publishing: {
                  "start-date": "1970-01-01T00:00:00Z",
                  "end-date": "9999-12-31T00:00:00Z",
                },
                works: ["sec-work"],
              },
            },
          },
          "question-defaults": {
            topic: "Java",
            submission: { mode: "upload" },
          },
        };
        await exportCourse({
          courseId: "fixture",
          projectRoot: root,
          content: {
            assessments: [work],
            exercises: [{
              id,
              target: "prairielearn",
              extensions: {
                prairielearn: {
                  grading: method === "external" ? "external" : { method },
                },
              },
            }],
            projects: [],
          },
          checks: {
            schemaVersion: 1,
            courseId: "fixture",
            bookRoot: "tasks",
            sourceSnapshotHash: "a".repeat(64),
            inventoryHash: "b".repeat(64),
            projects: [],
          },
          registry: { schemaVersion: 1, profiles: {} },
          config,
          instance: "test",
          output: root + "/course",
          checksOutput: root + "/private-checks.json",
          body: async () => pkg,
          nativeAnswers: { [id]: answer },
        });
        const courseInfo = JSON.parse(
          await Deno.readTextFile(
            root + "/course/questions/" + key + "/info.json",
          ),
        );
        if (
          courseInfo.gradingMethod !== (manual ? "Manual" : "Internal")
        ) throw Error("course exporter lost native form");
        const base = root + "/out/questions/" + key,
          info = JSON.parse(await Deno.readTextFile(base + "/info.json")),
          html = await Deno.readTextFile(base + "/question.html");
        if (
          !infoQuestion(info) ||
          info.gradingMethod !== (manual ? "Manual" : "Internal") ||
          info.externalGradingOptions
        ) throw Error("native answer requires fake external runtime");
        if (
          html.includes("734129") || html.includes('correct="true"') ||
          html.includes("pl-file-upload")
        ) throw Error("answer key/upload leaked to UI");
        const run = await new Deno.Command("python3", {
          args: [
            "-I",
            "-B",
            "-c",
            `import importlib.util,json,sys,math\nspec=importlib.util.spec_from_file_location('question',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\na=json.loads(sys.argv[2]);d={'params':{},'correct_answers':{},'submitted_answers':{},'partial_scores':{},'score':0,'feedback':{},'format_errors':{}};m.generate(d)\nif a['type']=='manual': assert not d['correct_answers'];sys.exit(0)\nanswers={'numeric':{'answer':'734129.05'},'multipart':{'first':'7','second':'0'},'matching':{'match-0':'Мяу','match-1':'ошибка'},'single-choice':{'answer':'2'}}[a['type']];d['submitted_answers']=answers;m.grade(d);expected=0.5 if a['type'] in ('multipart','matching') else 1\nassert d['score']==expected,(d,expected)\nassert len(d['partial_scores'])==(2 if a['type'] in ('multipart','matching') else 1)\nfor bad in ('NaN','Infinity','',None,True,{},[]):\n d['submitted_answers']={k:bad for k in answers};m.grade(d);assert math.isfinite(d['score']) and d['score']==0,d\n`,
            base + "/server.py",
            JSON.stringify(answer),
          ],
          stdout: "piped",
          stderr: "piped",
        }).output();
        if (!run.success) throw Error(new TextDecoder().decode(run.stderr));
      } finally {
        await Deno.remove(root, { recursive: true });
      }
    },
  );
}
