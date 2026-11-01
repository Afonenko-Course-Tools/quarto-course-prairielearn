/** Только lowering уже проверенного private Core declaration.answer. YAML/AST здесь не разбираются. */
export function renderNativeAnswer(answer: any) {
  const escape = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("{{", "&#123;&#123;").replaceAll(
        "}}",
        "&#125;&#125;",
      );
  const text = (name: string, label: string) =>
    `<label>${
      escape(label)
    }</label><pl-string-input answers-name="${name}" allow-blank="true"></pl-string-input>`;
  const manual = (name: string, label: string) =>
    `<p>${
      escape(label)
    }</p><pl-rich-text-editor file-name="${name}.html" placeholder="Введите ответ"></pl-rich-text-editor>`;
  let controls: string;
  switch (answer.type) {
    case "manual":
      controls = manual("answer", "Ответ");
      break;
    case "numeric":
      controls = text("answer", "Числовой ответ");
      break;
    case "single-choice":
      controls = text("answer", `Номер варианта от 1 до ${answer.count}`);
      break;
    case "multipart":
      controls = answer.parts.map((part: any) =>
        part.type === "manual"
          ? manual(part.name, part.label)
          : text(part.name, part.label)
      ).join("\n");
      break;
    case "matching":
      controls = "<p>Для каждого условия введите соответствующий вариант: " +
        answer.options.map(escape).join("; ") + ".</p>\n" +
        answer.prompts.map((prompt: string, i: number) =>
          text("match-" + i, prompt)
        ).join("\n");
      break;
    default:
      throw Error("PL.ANSWER_UNQUALIFIED: canonical Core answer required");
  }
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(answer))));
  const server = `import base64,json,math\nANSWER=json.loads(base64.b64decode(${
    JSON.stringify(encoded)
  }))\n\ndef leaves():\n    kind=ANSWER['type']\n    if kind=='numeric': return [('answer','numeric',ANSWER['key'])]\n    if kind=='single-choice': return [('answer','choice',ANSWER['correct']+1)]\n    if kind=='multipart': return [(p['name'],'numeric',p['key']) for p in ANSWER['parts'] if p['type']=='numeric']\n    if kind=='matching': return [('match-'+str(i),'matching',ANSWER['key']['pairs'][p]) for i,p in enumerate(ANSWER['prompts'])]\n    return []\n\ndef generate(data):\n    data.setdefault('correct_answers',{}).update({name:str(key['value'] if kind=='numeric' else key) for name,kind,key in leaves()})\n\ndef grade(data):\n    scores={}\n    submitted=data.get('submitted_answers',{})\n    for name,kind,key in leaves():\n        value=submitted.get(name)\n        passed=False\n        if kind=='matching': passed=isinstance(value,str) and value==key\n        elif isinstance(value,(str,int,float)) and not isinstance(value,bool):\n            try:\n                number=float(value)\n                passed=math.isfinite(number) and (abs(number-key['value'])<=key['tolerance']['absolute'] if kind=='numeric' else number==key)\n            except (ValueError,TypeError,OverflowError): pass\n        scores[name]={'score':int(passed),'weight':1}\n    data['partial_scores']=scores\n    data['score']=sum(x['score'] for x in scores.values())/len(scores) if scores else 0\n`;
  return { controls, server };
}
