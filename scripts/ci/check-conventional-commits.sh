#!/usr/bin/env bash
set -euo pipefail

event_name="${GITHUB_EVENT_NAME:-}"
head_sha="${GITHUB_SHA:-}"
base_sha=""

if [[ -z "${head_sha}" ]]; then
  echo "::error::GITHUB_SHA is required"
  exit 1
fi

if [[ "${event_name}" == "pull_request" ]]; then
  base_sha="${GITHUB_BASE_SHA:-}"
else
  base_sha="${GITHUB_BEFORE_SHA:-}"
fi

if [[ -n "${base_sha}" ]] && [[ "${base_sha}" != "0000000000000000000000000000000000000000" ]]; then
  commit_range="${base_sha}..${head_sha}"
else
  commit_range="${head_sha}^..${head_sha}"
fi

if ! git rev-list "${commit_range}" >/dev/null 2>&1; then
  echo "::error::Unable to evaluate commit range ${commit_range}"
  exit 1
fi

conventional_regex='^(revert: )?(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\([[:alnum:]_.\/-]+\))?(!)?: .+'
failed=0

while IFS=$'\t' read -r sha subject; do
  if [[ -z "${sha}" ]]; then
    continue
  fi

  # GitHub pull_request workflows validate a synthetic merge commit.
  # It is not part of project history and should not be linted.
  if [[ "${subject}" =~ ^Merge[[:space:]] ]]; then
    continue
  fi

  if [[ "${subject}" =~ ${conventional_regex} ]]; then
    continue
  fi

  echo "::error title=Invalid commit subject::${sha} -> \"${subject}\""
  failed=1
done < <(git log --format=$'%H\t%s' "${commit_range}")

if (( failed )); then
  cat <<'EOF'
Commit subjects must follow Conventional Commits:
  <type>(optional-scope): <summary>
Examples:
  fix: resolve websocket reconnect race
  refactor(session): split orchestration boundaries
EOF
  exit 1
fi

echo "Conventional commit subject check passed for ${commit_range}."
