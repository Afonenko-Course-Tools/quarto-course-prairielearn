import tseslint from 'typescript-eslint';
export const scope = ['_extensions/course-prairielearn/'];
export const structuralScope = ['_extensions/course-prairielearn/application/course-artifacts.ts', '_extensions/course-prairielearn/application/course-overview.ts', '_extensions/course-prairielearn/application/native-request-candidate.ts', '_extensions/course-prairielearn/application/export-files.ts', '_extensions/course-prairielearn/application/export-types.ts', '_extensions/course-prairielearn/application/export-identity.ts', '_extensions/course-prairielearn/application/export-output.ts', '_extensions/course-prairielearn/application/public-body-render.ts', '_extensions/course-prairielearn/application/selected-export-plan.ts', '_extensions/course-prairielearn/application/question-artifacts.ts', '_extensions/course-prairielearn/application/course-identity.ts', '_extensions/course-prairielearn/application/course-export-plan.ts', '_extensions/course-prairielearn/application/course-question-input.ts', '_extensions/course-prairielearn/application/export.ts', '_extensions/course-prairielearn/application/export-course.ts', '_extensions/course-prairielearn/application/publication.ts'];
export default [{
  files: scope.map(prefix => prefix + '**/*.ts'),
  ignores: ['**/vendor/**', '**/node_modules/**', '**/generated/**', '**/_generated/**'],
  languageOptions: { parser: tseslint.parser },
  plugins: { '@typescript-eslint': tseslint.plugin },
  linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false }],
    '@typescript-eslint/no-unsafe-type-assertion': 'error',
    '@typescript-eslint/switch-exhaustiveness-check': 'error',
  },
}, { files: structuralScope, rules: { complexity: ['error', 30], 'max-depth': ['error', 5], 'max-params': ['error', 5] } },
// Существующий публичный ABI renderPublicBody имеет семь аргументов.
{ files: ['_extensions/course-prairielearn/application/public-body-render.ts'], rules: { 'max-params': ['error', 7] } },
];
