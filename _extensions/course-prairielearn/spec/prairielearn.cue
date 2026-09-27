package course

import "list"

// BEGIN GENERATED VOCABULARY
// Источник: contract.json; изменить: quarto run tools/sync-contract.ts.
#PrairieLearnTarget: "prairielearn"
#PrairieLearnGrading: "external"
#PrairieLearnLabel: string & =~"^[a-z][a-z0-9-]*$"
// END GENERATED VOCABULARY

#PrairieLearnExercise: {grading: #PrairieLearnGrading}
#Exercise: {
	target: string
	if target == #PrairieLearnTarget {
		project: string & =~"^/[^.]"
		extensions: prairielearn: #PrairieLearnExercise
	}
}

// Нормализованные данные после объединения явно подключённых настроек.
// Модуль assessment.lua преобразует assignment.mode в student-label.
#PrairieLearnAssessment: {
	attempts: int & >=1
	pass: {"at-least": int & >=1}
	assignment: {"student-label": #PrairieLearnLabel}
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
				"\(a.id)/\(id)": list.Contains([for e in exercises if e.target == #PrairieLearnTarget {e.id}], id) & true
			}
		}
	}
}
