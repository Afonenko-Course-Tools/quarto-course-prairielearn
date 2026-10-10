Unreleased exporter **4.0.0**, compatible with unreleased Core **5.0.0**.
Use whole local repositories or immutable candidate archives until publication.

The complete delivery is generated from the bank, without bindings or a native shell.
Install compatible Core and PrairieLearn extensions with `quarto add` inside `tasks`.
From this directory run:

```sh
quarto run tasks/_extensions/course-prairielearn/entrypoints/export-course.ts . native --instance pilot --checks-output checks.json --runtime-registry /path/to/platform/runtime-profiles.json
```

A production runtime registry must contain an actual published digest. For private local testing only, `--candidate-image sha256:ACTUAL_LOCAL_IMAGE_ID` selects an already built image explicitly; that delivery is marked candidate and must not be published. References remain in the private checks inventory and are absent from native delivery.

The pilot declares an explicit test publication interval (1970–9999). Teaching
instances must supply their own `publishing.start-date` and `end-date` timestamps
with offsets. Missing/invalid dates reject export; instance availability and
assigned assessment labels both govern ordinary Student access.
