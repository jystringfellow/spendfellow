#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: pnpm db:migrate:linked

Preview and apply pending migrations to the Supabase project linked to this
checkout. The command requires an interactive terminal and typed confirmation
before it changes the linked database.
EOF
}

if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  usage >&2
  exit 64
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/.." && pwd)"
cd "${repository_root}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is required but was not found." >&2
  exit 1
fi

if [[ ! -s supabase/.temp/project-ref ]]; then
  cat >&2 <<'EOF'
Error: this checkout is not linked to a hosted Supabase project.
Link the private deployment checkout first:

  pnpm supabase link --project-ref YOUR_PROJECT_REF
EOF
  exit 1
fi

echo "Linked migration state before preview:"
pnpm supabase migration list --linked

echo
echo "Previewing pending migrations; no database changes are made in this step:"
pnpm db:push:dry-run

echo
echo "WARNING: the next step applies the migrations above to the linked Supabase database."
if [[ ! -t 0 ]]; then
  echo "Error: refusing to apply migrations without an interactive terminal." >&2
  exit 1
fi

read -r -p 'Type APPLY to continue: ' confirmation
if [[ ${confirmation} != "APPLY" ]]; then
  echo "Migration cancelled; the linked database was not changed."
  exit 0
fi

pnpm db:push

echo
echo "Linked migration state after apply:"
pnpm supabase migration list --linked
