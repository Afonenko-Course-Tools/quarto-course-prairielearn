#!/bin/sh
set -eu
mkdir -p /grade/results
export GRADLE_USER_HOME=/tmp/gradle-user
if gradle --offline --no-daemon --project-dir /grade/tests -Psolution=/grade/student test > /grade/results/gradle.log 2>&1; then
    printf '%s\n' '{"score":1,"succeeded":true,"gradable":true,"message":"All boundary checks passed"}' > /grade/results/results.json
else
    printf '%s\n' '{"score":0,"succeeded":true,"gradable":true,"message":"Compilation or boundary checks failed"}' > /grade/results/results.json
fi
