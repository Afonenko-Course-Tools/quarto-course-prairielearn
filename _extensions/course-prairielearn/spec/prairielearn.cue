package course

import "list"

// BEGIN GENERATED VOCABULARY
// Источник: contract.json; изменить: quarto run tools/sync-contract.ts.
#PrairieLearnTarget: "prairielearn"
#PrairieLearnGrading: "external"
#PrairieLearnAssignmentMode: "assessment-id"
#PrairieLearnLabel: string & =~"^[a-z][a-z0-9-]*$"
// END GENERATED VOCABULARY

#PrairieLearnQuestionPoints: (number & >=0) | [...number & >=0]
#PrairieLearnQuestionGrading: {
 "auto-points"?: number & >=0
 "manual-points"?: number & >0
 "question-points"?: #PrairieLearnQuestionPoints
 "question-max-points"?: (number & >=0) | null
 attempts?: int & >=1
 "advance-score-perc"?: number & >=0 & <=100
}
#PrairieLearnScoringPolicy: {
 "auto-points"?: number & >=0
 "manual-points"?: number & >0
 "question-points"?: #PrairieLearnQuestionPoints
 "question-max-points"?: (number & >=0) | null
 "slot-overrides"?: {[string & =~"^(exr|alt)-[a-z0-9-]+$"]: #PrairieLearnQuestionGrading}
 "max-points"?: (number & >=0) | null
 "grade-rate-minutes"?: number & >=0
 "advance-score-perc"?: number & >=0 & <=100
 "allow-multiple-instances"?: bool
}

#PrairieLearnSubmission: {mode: "editor", "ace-mode"?: string & =~"^ace/mode/[a-z][a-z0-9_]*$"} | {mode: "upload"}
#PrairieLearnGradingMethod: {method:"manual"|"mixed"}
#PrairieLearnExercise: {grading: #PrairieLearnGrading | #PrairieLearnGradingMethod, topic?: string & !="", submission?: #PrairieLearnSubmission, "single-variant"?: bool}
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
 #PrairieLearnScoringPolicy
	attempts: int & >=1
	pass: {"at-least": int & >=1}
	assignment: {"student-label": #PrairieLearnLabel} | {mode: #PrairieLearnAssignmentMode}
}

#Assessment: {
	slots: [...{id:string,candidates:[...string],assignment:{requirement:string,...},...}]
	extensions: prairielearn?: #PrairieLearnAssessment & {
		pass: "at-least": <=len(slots)
	}
}

#Course: {
	exercises: [..._]
	assessments: [..._]
	PL001_externalAssessmentMembers: {
		for a in assessments if a.extensions.prairielearn != _|_ {
			for slot in a.slots { for id in slot.candidates {
				"\(a.id)/\(id)": list.Contains([for e in exercises if e.target != _|_ if e.target == #PrairieLearnTarget {e.id}], id) & true
			}}
		}
	}
}

#PrairieLearnDeclarations: {
 delivery: {
  book: string & !=""
  course: {name: string & !="", title: string & !="", timezone: string & !="", topics: [...{name: string & !="", color: string & !="", description: string & !=""}]}
  instances: {[string]: {title: string & !="", "self-enrollment": bool, publishing: {"start-date": string & !="", "end-date": string & !=""}, works: [...string & =~"^sec-[a-z0-9-]+$"]}}
 }
 "question-defaults": {topic: string & !="", submission: #PrairieLearnSubmission, "single-variant"?: bool,grading?:#PrairieLearnGradingMethod}
 "assessment-defaults"?: {#PrairieLearnScoringPolicy
attempts?: int & >=1, pass?: {"at-least": int & >=1}, assignment?: {"student-label": #PrairieLearnLabel} | {mode: #PrairieLearnAssignmentMode}}
}
