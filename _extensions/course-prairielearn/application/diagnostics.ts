export interface DiagnosticContext {
  source?: string;
  id?: string;
  field?: string;
  related?: { source?: string; id?: string; field?: string }[];
  hint?: string;
}
export function diagnostic(
  code: string,
  message: string,
  context: DiagnosticContext = {},
  cause?: unknown,
): Error & { code: string } {
  const lines = [`${code}: course-prairielearn: ${message}`];
  for (const key of ["source", "id", "field"] as const) {
    if (context[key]) lines.push(`  ${key}: ${context[key]}`);
  }
  for (const related of context.related || []) {
    const facts = (["source", "id", "field"] as const)
      .filter((key) => related[key]).map((key) => `${key}: ${related[key]}`);
    lines.push(`  связано: ${facts.join(", ")}`);
  }
  if (context.hint) lines.push(`  подсказка: ${context.hint}`);
  const error = Object.assign(new Error(lines.join("\n"), { cause }), { code });
  error.name = "ExtensionDiagnostic";
  return error;
}
