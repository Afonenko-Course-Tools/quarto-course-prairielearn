package course

import "list"

// BEGIN GENERATED VOCABULARY
// Источник: contract.json; изменить: quarto run tools/sync-contract.ts.
#PrairieLearnTarget: "prairielearn"
#PrairieLearnGrading: "external"
#PrairieLearnAssignmentMode: "assessment-id"
#PrairieLearnLabel: string & =~"^[a-z][a-z0-9-]*$"
// END GENERATED VOCABULARY

#PrairieLearnExercise: {grading: #PrairieLearnGrading}
#Exercise: {
	target?: string
	if target != _|_ if target == #PrairieLearnTarget {
		project: string & =~"^/[^.]"
		extensions: prairielearn: #PrairieLearnExercise
	}
}

// Нормализованные данные после объединения явно подключённых настроек.
// При доступном course.id assessment.lua разрешает mode; nested native bank
// сохраняет текущий режим до явного экспорта из корня.
#PrairieLearnAssessment: {
	attempts: int & >=1
	pass: {"at-least": int & >=1}
	assignment: {"student-label": #PrairieLearnLabel} | {mode: #PrairieLearnAssignmentMode}
}

#Assessment: {
	items: [...string]
	extensions: prairielearn?: #PrairieLearnAssessment & {
		pass: "at-least": <=len(items)
	}
}

#Course: {
	exercises: [..._]
	assessments: [..._]
	PL001_externalAssessmentMembers: {
		for a in assessments if a.extensions.prairielearn != _|_ {
			for id in a.items {
				"\(a.id)/\(id)": list.Contains([for e in exercises if e.target != _|_ if e.target == #PrairieLearnTarget {e.id}], id) & true
			}
		}
	}
}
