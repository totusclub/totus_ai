#!/usr/bin/env bash
# Вход для ключа выкладки из GitHub Actions (command="…/deploy-entry.sh" в
# /root/.ssh/authorized_keys). С этим ключом можно только три команды —
# никакого шелла, проброса портов и т.п. Всё остальное отклоняется.
set -euo pipefail
BIN="$(dirname "$(readlink -f "$0")")"
read -r cmd arg extra <<<"${SSH_ORIGINAL_COMMAND:-}" || true
if [ -n "${extra:-}" ]; then
  echo "Разрешены только: deploy <sha>, rollback, status" >&2
  exit 2
fi
case "${cmd:-}" in
  deploy)
    [[ "${arg:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy: нужен полный номер коммита" >&2; exit 2; }
    exec "$BIN/deploy.sh" deploy "$arg"
    ;;
  rollback | status)
    [ -z "${arg:-}" ] || { echo "$cmd: без аргументов" >&2; exit 2; }
    exec "$BIN/deploy.sh" "$cmd"
    ;;
  *)
    echo "Разрешены только: deploy <sha>, rollback, status" >&2
    exit 2
    ;;
esac
