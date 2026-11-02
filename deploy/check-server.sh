#!/usr/bin/env bash
# Проверка настройки автовыкладки Маши на сервере — ТОЛЬКО ЧТЕНИЕ.
# Ничего не меняет и не перезапускает, значения секретов не печатает.
# Запуск под root:  bash deploy/check-server.sh 2>&1 | tee /root/totus-ai-check.txt
# Что делать по каждому ❌ / ⚠️ — в строке «→ …» и в docs/AVTODEPLOY.md.

ROOT="${DEPLOY_ROOT:-/srv/totus/ai}"
LEGACY="${DEPLOY_LEGACY_DIR:-/home/totus_ai_v2}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3011/api/health}"
WEB_URL="${DEPLOY_WEB_URL:-http://127.0.0.1:3012/}"
REMOTE="git@github-totus-ai:tosmedia/totus_ai_v2.git"
export GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=15"

OK=0 WARN=0 BAD=0
ok() { OK=$((OK + 1)); echo "  ✅ $1"; }
warn() { WARN=$((WARN + 1)); echo "  ⚠️  $1"; [ -n "${2:-}" ] && echo "     → $2"; return 0; }
bad() { BAD=$((BAD + 1)); echo "  ❌ $1"; [ -n "${2:-}" ] && echo "     → $2"; return 0; }
h() { printf '\n== %s\n' "$1"; }
names() { grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$1" 2>/dev/null | cut -d= -f1 | sort -u; }

echo "Проверка автовыкладки Маши · $(date '+%F %T') · $(hostname)"

h "1. Папки и общий .env"
for d in "$ROOT" "$ROOT/releases" "$ROOT/shared" "$ROOT/bin"; do
  [ -d "$d" ] && ok "есть $d" || bad "нет $d" "bash $LEGACY/deploy/setup-server.sh"
done
ENV="$ROOT/shared/.env"
if [ -f "$ENV" ]; then
  perm="$(stat -c '%a %U' "$ENV")"
  [ "$perm" = "600 root" ] && ok "shared/.env: права 600, владелец root" || warn "shared/.env: права/владелец «$perm»" "chmod 600 $ENV && chown root $ENV"
  miss="$(comm -23 <(names "$LEGACY/.env") <(names "$ENV") | tr '\n' ' ')"
  [ -z "${miss// /}" ] && ok "в shared/.env есть все переменные из старого $LEGACY/.env" \
    || bad "в shared/.env нет переменных из старого .env: $miss" "добавьте их в $ENV"
  api_env=/home/kedam_API/.env
  jv() { grep -E "^$1=" "$2" 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']$//"; }
  if [ -f "$api_env" ]; then
    if [ -n "$(jv JWT_SECRET "$ENV")" ] && [ "$(jv JWT_SECRET "$ENV")" = "$(jv JWT_SECRET "$api_env")" ]; then
      ok "JWT_SECRET в shared/.env совпадает с totus_API — Маша узнаёт пользователей"
    else
      bad "JWT_SECRET в shared/.env НЕ совпадает с $api_env — «Мои чаты» не загружаются и не сохраняются" "перенесите JWT_SECRET из $api_env в $ENV и: pm2 restart totus-ai-api"
    fi
  fi
  if cmp -s "$LEGACY/.env" "$ENV"; then ok "shared/.env совпадает со старым .env"; else
    warn "shared/.env отличается от $LEGACY/.env" "нормально, если правили shared/.env после настройки; если правили старый — скопируйте: install -m 600 $LEGACY/.env $ENV"
  fi
else
  bad "нет $ENV" "bash $LEGACY/deploy/setup-server.sh"
fi

h "2. Доступ сервера к GitHub (Deploy key, только чтение)"
[ -f /root/.ssh/totus_ai_github_read ] && ok "ключ /root/.ssh/totus_ai_github_read есть" || bad "нет ключа для чтения репозитория" "bash $LEGACY/deploy/setup-server.sh"
grep -q '^Host github-totus-ai$' /root/.ssh/config 2>/dev/null && ok "в /root/.ssh/config есть Host github-totus-ai" || bad "нет Host github-totus-ai в /root/.ssh/config" "bash $LEGACY/deploy/setup-server.sh"
GH_MAIN="$(git ls-remote "$REMOTE" refs/heads/main 2>/dev/null | cut -f1)"
if [ -n "$GH_MAIN" ]; then ok "GitHub принимает ключ, main на GitHub: ${GH_MAIN:0:7}"; else
  bad "GitHub не принимает ключ сервера (или нет связи)" "добавьте /root/.ssh/totus_ai_github_read.pub в GitHub → totus_ai_v2 → Settings → Deploy keys, без «Allow write access»"
fi

h "3. Копия репозитория для выкладки"
if [ -d "$ROOT/repo.git" ]; then
  MIRROR="$(git --git-dir="$ROOT/repo.git" rev-parse refs/heads/main 2>/dev/null)"
  ok "есть $ROOT/repo.git (main в копии: ${MIRROR:0:7})"
  url="$(git --git-dir="$ROOT/repo.git" config --get remote.origin.url)"
  [ "$url" = "$REMOTE" ] && ok "копия берёт код через Deploy key" || bad "у копии другой адрес: $url" "git --git-dir=$ROOT/repo.git remote set-url origin $REMOTE"
  if [ -n "$GH_MAIN" ] && [ "$MIRROR" != "$GH_MAIN" ]; then
    echo "     (копия отстаёт от GitHub — это нормально: каждая выкладка сама её обновляет)"
  fi
else
  bad "нет $ROOT/repo.git" "bash $LEGACY/deploy/setup-server.sh"
fi

h "4. Скрипты выкладки"
for f in deploy.sh deploy-entry.sh; do
  if [ -x "$ROOT/bin/$f" ]; then
    ok "$ROOT/bin/$f есть и запускается"
    if [ -d "$ROOT/repo.git" ]; then
      git --git-dir="$ROOT/repo.git" show "refs/heads/main:deploy/$f" 2>/dev/null | cmp -s - "$ROOT/bin/$f" \
        && ok "$f совпадает с версией в main" \
        || warn "$f отличается от версии в main" "обновится сам после следующей удачной выкладки; сейчас: bash $LEGACY/deploy/setup-server.sh (после git pull)"
    fi
  else
    bad "нет $ROOT/bin/$f" "bash $LEGACY/deploy/setup-server.sh"
  fi
done

h "5. Ключ для GitHub Actions"
AK=/root/.ssh/authorized_keys
line="$(grep 'totus-ai github-actions' "$AK" 2>/dev/null | head -1)"
if [ -n "$line" ]; then
  ok "ключ GitHub Actions есть в authorized_keys"
  case "$line" in
    "command=\"$ROOT/bin/deploy-entry.sh\""*no-pty*no-port-forwarding*) ok "ключ ограничен: только deploy-entry.sh, без шелла и проброса портов" ;;
    *) bad "ключ GitHub Actions НЕ ограничен командой" "удалите строку «totus-ai github-actions» из $AK и запустите setup-server.sh заново" ;;
  esac
  fp="$(grep -o 'ssh-ed25519 [A-Za-z0-9+/=]*' <<<"$line" | ssh-keygen -lf - 2>/dev/null | cut -d' ' -f1-2)"
  [ -n "$fp" ] && echo "     отпечаток ключа Actions: $fp — должен совпасть с отпечатком в шаге «Проверка настроек выкладки» в GitHub Actions"
  [ "$(grep -c 'totus-ai github-actions' "$AK")" = 1 ] || warn "ключей «totus-ai github-actions» несколько" "оставьте одну строку — ту, что в GitHub secret DEPLOY_SSH_KEY"
else
  bad "нет ключа GitHub Actions в authorized_keys" "bash $LEGACY/deploy/setup-server.sh"
fi
[ -f /root/.ssh/totus_ai_actions ] && warn "закрытый ключ Actions ещё лежит на сервере" "после копирования в GitHub: rm /root/.ssh/totus_ai_actions" || ok "закрытого ключа Actions на сервере нет"
if [ -x "$ROOT/bin/deploy-entry.sh" ]; then
  rej=0
  for c in "bash" "rm -rf /" "deploy abc" "status now"; do
    SSH_ORIGINAL_COMMAND="$c" "$ROOT/bin/deploy-entry.sh" >/dev/null 2>&1 && rej=1
  done
  [ "$rej" = 0 ] && ok "вход ключа отклоняет посторонние команды" || bad "вход ключа пропустил постороннюю команду" "сообщите Claude"
fi
echo "     Для GitHub secret DEPLOY_KNOWN_HOSTS (сверьте, что внесено именно это):"
for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
  [ -f "$f" ] && echo "     ${DEPLOY_HOST:-109.73.206.121} $(cut -d' ' -f1,2 "$f")"
done

h "6. Сервер"
SW="$(swapon --show --noheadings 2>/dev/null)"
[ -n "$SW" ] && ok "подкачка есть: $(echo "$SW" | awk '{print $1, $3}' | head -1)" || warn "подкачки нет — сборка Next может не уместиться в памяти" "bash $LEGACY/deploy/setup-server.sh --swap"
avail="$(free -m | awk '/^Mem:/{print $7}')"
[ "${avail:-0}" -ge 1200 ] && ok "свободно памяти: ${avail} МБ" || warn "мало свободной памяти: ${avail} МБ"
free_gb="$(df -BG --output=avail /srv 2>/dev/null | tail -1 | tr -dc 0-9)"
[ "${free_gb:-0}" -ge 5 ] && ok "свободно на диске: ${free_gb} ГБ" || bad "мало места на диске: ${free_gb} ГБ" "нужно хотя бы 5 ГБ (релиз ~1 ГБ, храним 3)"
command -v flock >/dev/null && command -v node >/dev/null && command -v npm >/dev/null && ok "flock, node $(node -v), npm $(npm -v)" || bad "нет flock / node / npm"
command -v pm2 >/dev/null && ok "pm2 $(pm2 -v 2>/dev/null | tail -1)" || bad "нет pm2"

h "7. Старая папка $LEGACY"
if [ -d "$LEGACY/.git" ]; then
  dirty="$(git -C "$LEGACY" status --porcelain | wc -l)"
  [ "$dirty" = 0 ] && ok "в старой папке нет изменённых файлов" || warn "в старой папке изменённых файлов: $dirty" "не мешает автовыкладке; для git pull: git stash push -- package-lock.json packages/ai-assistant/dist"
  [ -f "$LEGACY/deploy/setup-server.sh" ] && ok "в старой папке код с автовыкладкой (git pull сделан)" || warn "в старой папке ещё старый код" "cd $LEGACY && git pull"
fi

h "8. Что сейчас работает"
CUR="$(readlink -f "$ROOT/current" 2>/dev/null)"
API_CWD="$(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const p=JSON.parse(s).find(x=>x.name==="totus-ai-api");console.log(p?p.pm2_env.pm_cwd+" "+p.pm2_env.status:"")}catch{console.log("")}})')"
WEB_CWD="$(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const p=JSON.parse(s).find(x=>x.name==="totus-ai-web");console.log(p?p.pm2_env.pm_cwd+" "+p.pm2_env.status:"")}catch{console.log("")}})')"
echo "     totus-ai-api: ${API_CWD:-не найден}"
echo "     totus-ai-web: ${WEB_CWD:-не найден}"
HEALTH="$(curl -s -m 5 "$HEALTH_URL")"
H_COMMIT="$(HB="$HEALTH" node -e 'try{const h=JSON.parse(process.env.HB);console.log((h.ok===true&&h.llm?.enabled&&h.levelTravel?.enabled&&h.db?.configured?"ok":"bad")+" "+(h.commit||"-")+" "+(h.build||"-").replace(/ /g,"_"))}catch{console.log("down - -")}')"
read -r h_state h_commit h_build <<<"$H_COMMIT"
[ "$h_state" = ok ] && ok "Маша отвечает: модель, Level.Travel и база подключены (build ${h_build//_/ })" || bad "Маша не отвечает как надо: $HEALTH_URL" "pm2 logs totus-ai-api --lines 50"
web="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$WEB_URL")"
[ "$web" = 200 ] && ok "ai.totus.club (3012) отвечает" || bad "ai.totus.club (3012) отвечает $web"
if [ -n "$CUR" ]; then
  REV="$(cat "$CUR/REVISION" 2>/dev/null)"
  ok "current → $CUR (коммит ${REV:0:7})"
  case "$API_CWD" in "$CUR "*) ok "totus-ai-api работает из текущего релиза" ;; *) bad "totus-ai-api работает не из текущего релиза" "/srv/totus/ai/bin/deploy.sh deploy $REV" ;; esac
  case "$WEB_CWD" in "$CUR "*) ok "totus-ai-web работает из текущего релиза" ;; *) bad "totus-ai-web работает не из текущего релиза" "/srv/totus/ai/bin/deploy.sh deploy $REV" ;; esac
  [ "$h_commit" = "$REV" ] && ok "/api/health отвечает коммитом текущего релиза" || bad "/api/health отвечает коммитом «$h_commit», а в релизе ${REV:0:7}"
  [ -n "$GH_MAIN" ] && { [ "$REV" = "$GH_MAIN" ] && ok "на проде последний main" || warn "на проде ${REV:0:7}, а в main ${GH_MAIN:0:7}" "если автовыкладка включена — посмотрите Actions; вручную: /srv/totus/ai/bin/deploy.sh deploy $GH_MAIN"; }
else
  warn "первой выкладки ещё не было — Маша работает из $LEGACY" "docs/AVTODEPLOY.md, шаг 3: /srv/totus/ai/bin/deploy.sh deploy ${GH_MAIN:-<коммит main>}"
fi
pm2 jlist 2>/dev/null | grep -q '"pm_cwd"' && { systemctl is-enabled pm2-root >/dev/null 2>&1 && ok "PM2 стартует сам после перезагрузки сервера" || warn "pm2-root не включён в автозапуск" "pm2 startup && pm2 save"; }

h "9. Журнал выкладок"
if [ -f "$ROOT/deploy.log" ]; then tail -n 8 "$ROOT/deploy.log" | sed 's/^/     /'; else echo "     журнала ещё нет — выкладок не было"; fi
[ -f "$ROOT/shared/deploy.env" ] && grep -Eq '^TG_BOT_TOKEN=.+' "$ROOT/shared/deploy.env" && grep -Eq '^TG_CHAT_ID=.+' "$ROOT/shared/deploy.env" \
  && ok "сообщения в Telegram настроены" || echo "     Telegram не настроен (по желанию: $ROOT/shared/deploy.env)"

printf '\nИтого: ✅ %s · ⚠️ %s · ❌ %s\n' "$OK" "$WARN" "$BAD"
echo "В GitHub (этот скрипт не видит) проверьте: Settings → Deploy keys — «totus-ai server», только чтение;"
echo "Secrets and variables → Actions: secrets DEPLOY_SSH_KEY и DEPLOY_KNOWN_HOSTS; variables DEPLOY_HOST и DEPLOY_ENABLED=true (после первой выкладки)."
echo "Ничего не изменено."
