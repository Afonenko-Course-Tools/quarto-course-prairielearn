#!/usr/bin/env bash
# Проверяется реальный no-replace rename каталогов, включая отказ без перезаписи.
set -euo pipefail
mv_command=${1:-mv}
probe_root=$(mktemp -d "${TMPDIR:-/tmp}/course-mv-probe.XXXXXXXX")
trap 'rm -rf -- "${probe_root}"' EXIT
mkdir "${probe_root}/source" "${probe_root}/existing"
printf 'source\n' >"${probe_root}/source/owner"
printf 'existing\n' >"${probe_root}/existing/owner"
"${mv_command}" --no-copy --update=none-fail -T -- "${probe_root}/source" "${probe_root}/fresh"
fresh_owner=$(cat "${probe_root}/fresh/owner")
test "${fresh_owner}" = source
if "${mv_command}" --no-copy --update=none-fail -T -- "${probe_root}/fresh" "${probe_root}/existing" 2>"${probe_root}/refusal"; then
  printf 'mv не отказал при занятом destination\n' >&2
  exit 1
fi
fresh_owner=$(cat "${probe_root}/fresh/owner")
test "${fresh_owner}" = source
existing_owner=$(cat "${probe_root}/existing/owner")
test "${existing_owner}" = existing
test -s "${probe_root}/refusal"
"${mv_command}" --version | head -1
