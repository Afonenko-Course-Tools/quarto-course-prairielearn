package course

#PrairieLearnExercise: {grading: "external"}
#Exercise: {
	target: string
	if target == "prairielearn" {
		project: string & =~"^/[^.]"
		extensions: prairielearn: #PrairieLearnExercise
	}
}
