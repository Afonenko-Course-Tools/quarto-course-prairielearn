# Java and Gradle demonstration group

This folder is the whole reproducible course, with root course identity, bank,
control sources, two works, starter, reference and private checks. Install
Core and PrairieLearn in `bank` using concrete published versions, then run
`quarto run build.ts`. For local candidates run `CORE=/absolute/path/to/quarto-course bash tools/check-java.sh`
from the producer repository root.

```sh
cd bank
quarto add Afonenko-Course-Tools/quarto-course@v3.0.0 --no-prompt
quarto add Afonenko-Course-Tools/quarto-course-prairielearn@v2.1.0 --no-prompt
cd ..
quarto run build.ts
```

The group pins these releases. Requires Quarto, CUE,
Java and Gradle. No Maven/JUnit download: the Gradle JavaCompile/JavaExec tasks
run six actual assertions. `binding.json` is explicit PrairieLearn configuration.
The container image/entrypoint must be verified on the target PL installation;
local Gradle execution does not establish live container/server compatibility.
Each selected delivery uses only its question binding. Export no assessment
activity and do not translate the pass rule into a generic grading formula.

The ready artifact is published separately in immutable release `demo-20261007`
from the same merged revision. `BUILD.json` records the exact commit and dependencies.
