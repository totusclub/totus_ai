#!/usr/bin/env bash
# Разовая настройка сервера для автовыкладки Милы — docs/AVTODEPLOY.md, шаг 2.
# Запуск под root из старой папки:  cd /home/totus_ai_v2 && bash deploy/setup-server.sh
# Можно запускать повторно: уже сделанное пропускается.
# Работающую Милу НЕ трогает: PM2 переключается только первой выкладкой (шаг 3).
#   --swap   заодно создать файл подкачки 2 ГБ, если подкачки нет (сборка Next
#            занимает 1–1,5 ГБ, а памяти на сервере 3,8 ГБ без подкачки)
set -euo pipefail

ROOT=/srv/totus/ai
LEGACY=/home/totus_ai_v2
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
HOST_IP="${DEPLOY_HOST:-109.73.206.121}"
READ_KEY=/root/.ssh/totus_ai_github_read
ACTIONS_KEY=/root/.ssh/totus_ai_actions
step() { printf '\n== %s\n' "$1"; }

[ "$(id -u)" = 0 ] || { echo "Запустите под root"; exit 1; }

step "1. Папки $ROOT"
mkdir -p "$ROOT/releases" "$ROOT/shared" "$ROOT/bin"
chmod 700 "$ROOT/shared"
echo "ok"

step "2. Общий .env"
if [ -f "$ROOT/shared/.env" ]; then
  echo "уже есть $ROOT/shared/.env — не трогаю"
else
  install -m 600 "$LEGACY/.env" "$ROOT/shared/.env"
  echo "скопирован из $LEGACY/.env → $ROOT/shared/.env"
fi
[ -f "$ROOT/shared/deploy.env" ] || {
  printf '# Сообщения о выкладке в Telegram (по желанию)\nTG_BOT_TOKEN=\nTG_CHAT_ID=\n' >"$ROOT/shared/deploy.env"
  chmod 600 "$ROOT/shared/deploy.env"
}

step "3. Скрипты выкладки → $ROOT/bin"
install -m 755 "$HERE/deploy.sh" "$ROOT/bin/deploy.sh"
install -m 755 "$HERE/deploy-entry.sh" "$ROOT/bin/deploy-entry.sh"
echo "ok"

step "4. Ключ сервера для чтения репозитория (Deploy key, только чтение)"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f "$READ_KEY" ] || ssh-keygen -q -t ed25519 -N '' -C "totus-ai server read" -f "$READ_KEY"
if ! grep -q '^Host github-totus-ai$' /root/.ssh/config 2>/dev/null; then
  printf '\nHost github-totus-ai\n  HostName github.com\n  User git\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$READ_KEY" >>/root/.ssh/config
  chmod 600 /root/.ssh/config
fi
grep -q '^github.com ' /root/.ssh/known_hosts 2>/dev/null || ssh-keyscan -t ed25519 github.com >>/root/.ssh/known_hosts 2>/dev/null
if ! git ls-remote git@github-totus-ai:tosmedia/totus_ai_v2.git refs/heads/main >/dev/null 2>&1; then
  echo
  echo "GitHub пока не принимает ключ. Добавьте его:"
  echo "  GitHub → tosmedia/totus_ai_v2 → Settings → Deploy keys → Add deploy key"
  echo "  Title: totus-ai server   ·   «Allow write access» — НЕ отмечать"
  echo "  Key:"
  cat "$READ_KEY.pub"
  echo
  echo "Затем запустите этот скрипт ещё раз."
  exit 0
fi
echo "GitHub принимает ключ"

step "5. Копия репозитория $ROOT/repo.git"
if [ -d "$ROOT/repo.git" ]; then
  git --git-dir="$ROOT/repo.git" fetch -q origin '+refs/heads/main:refs/heads/main'
else
  git clone -q --mirror git@github-totus-ai:tosmedia/totus_ai_v2.git "$ROOT/repo.git"
fi
echo "main: $(git --git-dir="$ROOT/repo.git" rev-parse refs/heads/main)"

step "6. Ключ для GitHub Actions (умеет только deploy / rollback / status)"
ENTRY="command=\"$ROOT/bin/deploy-entry.sh\",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc"
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
if grep -q 'totus-ai github-actions' /root/.ssh/authorized_keys; then
  echo "ключ уже добавлен (чтобы выпустить новый — удалите строку «totus-ai github-actions» из /root/.ssh/authorized_keys и запустите ещё раз)"
else
  rm -f "$ACTIONS_KEY" "$ACTIONS_KEY.pub"
  ssh-keygen -q -t ed25519 -N '' -C "totus-ai github-actions" -f "$ACTIONS_KEY"
  echo "$ENTRY $(cat "$ACTIONS_KEY.pub")" >>/root/.ssh/authorized_keys
  echo
  echo "Добавьте в GitHub → tosmedia/totus_ai_v2 → Settings → Secrets and variables → Actions:"
  echo
  echo "Secret DEPLOY_SSH_KEY (всё, включая строки BEGIN/END):"
  cat "$ACTIONS_KEY"
  echo
  echo "Secret DEPLOY_KNOWN_HOSTS:"
  for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
    [ -f "$f" ] && echo "$HOST_IP $(cut -d' ' -f1,2 "$f")"
  done
  echo
  echo "Variable DEPLOY_HOST: $HOST_IP"
  echo "Variable DEPLOY_ENABLED: true   (только после удачной первой выкладки, шаг 3)"
  echo
  read -r -p "Скопировали DEPLOY_SSH_KEY в GitHub? Закрытый ключ будет удалён с сервера [y/N] " ok
  if [ "${ok:-}" = y ] || [ "${ok:-}" = Y ]; then
    rm -f "$ACTIONS_KEY"
    echo "закрытый ключ удалён с сервера (на сервере остался только открытый)"
  else
    echo "закрытый ключ оставлен в $ACTIONS_KEY — удалите его после копирования: rm $ACTIONS_KEY"
  fi
fi

step "7. Подкачка"
if [ "${1:-}" = "--swap" ]; then
  if swapon --show | grep -q .; then
    echo "подкачка уже есть"
  else
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
    echo "создан /swapfile 2 ГБ"
  fi
else
  swapon --show | grep -q . && echo "подкачка есть" || echo "подкачки нет (можно добавить: bash deploy/setup-server.sh --swap)"
fi

step "Готово"
echo "Мила по-прежнему работает из $LEGACY. Следующий шаг — первая выкладка (docs/AVTODEPLOY.md, шаг 3):"
echo "  $ROOT/bin/deploy.sh deploy $(git --git-dir="$ROOT/repo.git" rev-parse refs/heads/main)"
