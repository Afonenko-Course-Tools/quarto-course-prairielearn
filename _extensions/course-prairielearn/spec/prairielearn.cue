package course

import "list"

#PrairieLearnExercise: {grading: "external"}
#Exercise: {
	target: string
	if target == "prairielearn" {
		project: string & =~"^/[^.]"
		extensions: prairielearn: #PrairieLearnExercise
	}
}

// Canonical payload after merging opted-in defaults and resolving assignment.
// Source assignment.mode is normalized to student-label by assessment.lua.
#PrairieLearnAssessment: {
	attempts: int & >=1
	pass: {"at-least": int & >=1}
	assignment: {"student-label": string & =~"^[a-z][a-z0-9-]*$"}
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
				"\(a.id)/\(id)": list.Contains([for e in exercises if e.target == "prairielearn" {e.id}], id) & true
			}
		}
	}
}
