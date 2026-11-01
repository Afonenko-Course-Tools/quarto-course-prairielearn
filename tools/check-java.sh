#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
: "${GRADLE_USER_HOME:?Задайте постоянный Gradle cache}"
stage=$(mktemp -d "${TMPDIR:-/tmp}/pl-java-contract.XXXXXXXX")
trap 'rm -rf "$stage"' EXIT
cp -R "$repo/examples/java-gradle/bank/projects/clamp/." "$stage/"
cd "$stage/tests"
gradle --offline -Psolution=../reference test
if gradle --offline -Psolution=../student test; then
  echo 'Незавершённый starter неожиданно прошёл checks' >&2; exit 1
fi
printf '%s\n' 'PASS настоящее Java/Gradle: reference PASS, starter ожидаемо FAILED'
