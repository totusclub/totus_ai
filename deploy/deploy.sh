#!/usr/bin/env bash
# Выкладка Милы (totus_ai_v2) на сервер — docs/AVTODEPLOY.md.
#
#   deploy.sh deploy <полный sha>   выложить коммит из main
#   deploy.sh rollback              вернуть прошлый удачный релиз
#   deploy.sh status                что сейчас на проде
#
# Запускается из GitHub Actions по SSH (через deploy-entry.sh — ключ умеет только
# эти три команды) или вручную на сервере. Каждый релиз — отдельная папка:
# новая версия ставится и собирается рядом с работающей, переключение — секунды.
# После переключения ждём, пока /api/health ответит новым коммитом; не дождались —
# сами возвращаемся на прошлый релиз.
set -Eeuo pipefail

ROOT="${DEPLOY_ROOT:-/srv/totus/ai}"
BRANCH="${DEPLOY_BRANCH:-main}"
PM2="${PM2_BIN:-pm2}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3011/api/health}"
WEB_URL="${DEPLOY_WEB_URL:-http://127.0.0.1:3012/}"
HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-90}"
KEEP="${DEPLOY_KEEP:-3}"
# Папка, из которой Мила работала до автовыкладки: к ней возвращаемся, если
# самая первая выкладка не поднялась.
LEGACY="${DEPLOY_LEGACY_DIR:-/home/totus_ai_v2}"
APPS=(totus-ai-api totus-ai-web)

REPO="$ROOT/repo.git"
RELEASES="$ROOT/releases"
SHARED="$ROOT/shared"
CURRENT="$ROOT/current"
LOG="$ROOT/deploy.log"
SHORT=""

# Telegram (по желанию): TG_BOT_TOKEN и TG_CHAT_ID в shared/deploy.env.
TG_BOT_TOKEN=""
TG_CHAT_ID=""
# shellcheck disable=SC1091
[ -f "$SHARED/deploy.env" ] && . "$SHARED/deploy.env"

log() {
  local line
  line="[$(date '+%F %T')] $*"
  echo "$line"
  echo "$line" >>"$LOG" 2>/dev/null || true
}

notify() {
  [ -n "$TG_BOT_TOKEN" ] && [ -n "$TG_CHAT_ID" ] || return 0
  curl -s -m 10 -o /dev/null "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT_ID}" --data-urlencode "text=$1" || true
}

fail() {
  log "ОШИБКА: $*"
  notify "❌ Мила: выкладка ${SHORT} не удалась — $*"
  exit 1
}

# Хвост журнала — чтобы причина была видна прямо в логе GitHub Actions.
log_tail() {
  echo "----- последние строки $LOG -----"
  tail -n 40 "$LOG" 2>/dev/null || true
}

# Неожиданная ошибка в любой строке — тоже сообщение, а не тишина.
trap 'log "ОШИБКА: строка $LINENO, команда: $BASH_COMMAND"; notify "❌ Мила: выкладка ${SHORT} прервалась (строка $LINENO)"' ERR

current_release() { [ -L "$CURRENT" ] && readlink -f "$CURRENT" || true; }
revision_of() { cat "$1/REVISION" 2>/dev/null || true; }
env_names() { grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$1" 2>/dev/null | cut -d= -f1 | sort -u; }

switch_to() {
  ln -sfn "$1" "$ROOT/current.new"
  mv -T "$ROOT/current.new" "$CURRENT"
}

# Процессы всегда стартуют из папки релиза (cwd в deploy/ecosystem.config.cjs),
# поэтому обе части Милы работают из одной версии.
pm2_start_release() {
  local rel="$1" app
  for app in "${APPS[@]}"; do "$PM2" delete "$app" >/dev/null 2>&1 || true; done
  for app in "${APPS[@]}"; do
    # Ошибку старта не делаем фатальной: её поймает проверка здоровья и откатит.
    (cd "$rel" && "$PM2" start deploy/ecosystem.config.cjs --only "$app") >>"$LOG" 2>&1 || log "pm2 start $app вернул ошибку"
  done
  "$PM2" save >/dev/null 2>&1 || true
}

# Как было до автовыкладки: npm-скрипты из старой папки.
pm2_start_legacy() {
  local app
  for app in "${APPS[@]}"; do "$PM2" delete "$app" >/dev/null 2>&1 || true; done
  (cd "$LEGACY" && "$PM2" start npm --name totus-ai-api -- run server && "$PM2" start npm --name totus-ai-web -- run start:web) >>"$LOG" 2>&1 || log "pm2 start (старая папка) вернул ошибку"
  "$PM2" save >/dev/null 2>&1 || true
}

# Мила жива: ok, нужный коммит (если задан), модель, Level.Travel и база подключены.
health_ok() {
  local body
  body="$(curl -s -m 5 "$HEALTH_URL" || true)"
  [ -n "$body" ] || return 1
  HEALTH_BODY="$body" node -e '
    const want = process.argv[1]
    let h
    try { h = JSON.parse(process.env.HEALTH_BODY) } catch { process.exit(1) }
    const ok = h.ok === true && h.llm?.enabled === true && h.levelTravel?.enabled === true && h.db?.configured === true
    process.exit(ok && (!want || h.commit === want) ? 0 : 1)
  ' "${1:-}"
}

wait_health() {
  local want="${1:-}" waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    health_ok "$want" && return 0
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

wait_web() {
  local waited=0 code
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$WEB_URL" || true)"
    [ "$code" = 200 ] && return 0
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

# Оставляем KEEP последних удачных релизов (и текущий), неудачные — последний один.
prune() {
  local cur rel n=0
  cur="$(current_release)"
  while IFS= read -r rel; do
    [ "$rel" = "$cur" ] && continue
    n=$((n + 1))
    [ "$n" -ge "$KEEP" ] && rm -rf "$rel"
  done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '*.failed' -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
  n=0
  while IFS= read -r rel; do
    n=$((n + 1))
    [ "$n" -gt 1 ] && rm -rf "$rel"
  done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -name '*.failed' -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
  return 0
}

# Скрипт выкладки обновляет сам себя только после удачной выкладки.
self_update() {
  local rel="$1" f
  for f in deploy.sh deploy-entry.sh; do
    if [ -f "$rel/deploy/$f" ] && ! cmp -s "$rel/deploy/$f" "$ROOT/bin/$f"; then
      install -m 755 "$rel/deploy/$f" "$ROOT/bin/$f.new" && mv -f "$ROOT/bin/$f.new" "$ROOT/bin/$f"
      log "обновлён $ROOT/bin/$f"
    fi
  done
}

lock() {
  exec 9>"$ROOT/deploy.lock"
  flock -w 1800 9 || fail "другая выкладка идёт больше 30 минут"
}

cmd_deploy() {
  local sha="${1:-}" prev prev_sha rel missing need_web changed started
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "нужен полный номер коммита (40 символов)"
  SHORT="${sha:0:7}"
  started=$SECONDS
  lock
  log "Выкладка $SHORT: начало"

  git --git-dir="$REPO" fetch -q origin "+refs/heads/$BRANCH:refs/heads/$BRANCH" || fail "не удалось получить код с GitHub"
  git --git-dir="$REPO" cat-file -e "$sha^{commit}" 2>/dev/null || fail "коммита $SHORT нет в репозитории"
  # Даже с ключом выкладки на прод попадает только код, уже слитый в main.
  git --git-dir="$REPO" merge-base --is-ancestor "$sha" "refs/heads/$BRANCH" || fail "коммит $SHORT не из ветки $BRANCH — выкладываем только слитый код"

  prev="$(current_release)"
  prev_sha="$([ -n "$prev" ] && revision_of "$prev" || true)"
  if [ "$prev_sha" = "$sha" ]; then
    log "Выкладка $SHORT: уже на проде"
    exit 0
  fi
  # Очередь: если пока ждали, выложили более новый коммит — старый не ставим.
  if [ -n "$prev_sha" ] && git --git-dir="$REPO" merge-base --is-ancestor "$sha" "$prev_sha" 2>/dev/null; then
    log "Выкладка $SHORT: на проде уже более новая версия ${prev_sha:0:7}, пропускаю"
    exit 0
  fi

  rel="$RELEASES/$(date +%Y%m%d-%H%M%S)-$SHORT"
  mkdir -p "$rel"
  git --git-dir="$REPO" archive "$sha" | tar -x -C "$rel"
  echo "$sha" >"$rel/REVISION"
  ln -sfn "$SHARED/.env" "$rel/.env"

  # Новая переменная в .env.example, которой нет на сервере, — стоп до переключения.
  missing="$(comm -23 <(env_names "$rel/.env.example") <(env_names "$SHARED/.env") | tr '\n' ' ')"
  if [ -n "${missing// /}" ]; then
    rm -rf "$rel"
    fail "в $SHARED/.env нет переменных: ${missing% } — добавьте их и запустите выкладку ещё раз (Мила не тронута)"
  fi

  if [ -n "$prev" ] && [ -d "$prev/node_modules" ] && cmp -s "$prev/package-lock.json" "$rel/package-lock.json"; then
    cp -a "$prev/node_modules" "$rel/"
    log "зависимости — из прошлого релиза (package-lock.json не менялся)"
  else
    log "npm ci…"
    (cd "$rel" && npm ci --no-audit --no-fund) >>"$LOG" 2>&1 || { log_tail; rm -rf "$rel"; fail "npm ci не прошёл (подробности в $LOG)"; }
  fi

  # Сборка ai.totus.club нужна, только если менялось что-то кроме сервера,
  # проверок и документов (промпт, правила, база знаний — без сборки).
  need_web=1
  if [ -n "$prev_sha" ] && [ -d "$prev/.next" ]; then
    changed="$(git --git-dir="$REPO" diff --name-only "$prev_sha" "$sha")"
    if ! grep -Ev '^(server/|scripts/|docs/|deploy/|\.github/)|^[^/]+\.md$' <<<"$changed" | grep -q .; then
      need_web=0
    fi
  fi
  if [ "$need_web" = 1 ]; then
    log "сборка (npm run build)…"
    (cd "$rel" && npm run build) >>"$LOG" 2>&1 || { log_tail; rm -rf "$rel"; fail "сборка не прошла (подробности в $LOG)"; }
  else
    # Прошлая сборка без её кэша (кэш нужен только для следующей сборки).
    tar -C "$prev" --exclude=.next/cache -cf - .next | tar -C "$rel" -xf -
    log "сборка не нужна — изменились только сервер, проверки или документы"
  fi

  switch_to "$rel"
  pm2_start_release "$rel"
  if wait_health "$sha" && wait_web; then
    prune
    self_update "$rel"
    log "Выкладка $SHORT: готово за $((SECONDS - started)) с"
    notify "✅ Мила: выложен $SHORT за $((SECONDS - started)) с"
    return 0
  fi

  # Не поднялась — назад.
  log "Выкладка $SHORT: Мила не ответила новым коммитом за ${HEALTH_TIMEOUT} с — откат"
  log_tail
  mv "$rel" "$rel.failed"
  if [ -n "$prev" ]; then
    switch_to "$prev"
    pm2_start_release "$prev"
    if wait_health "$prev_sha"; then
      notify "↩️ Мила: $SHORT не поднялась, вернула ${prev_sha:0:7}. Лог: $LOG"
      fail "новая версия не поднялась, вернула ${prev_sha:0:7}"
    fi
  else
    rm -f "$CURRENT"
    pm2_start_legacy
    if wait_health ""; then
      notify "↩️ Мила: первая выкладка $SHORT не поднялась, вернула работу из $LEGACY. Лог: $LOG"
      fail "первая выкладка не поднялась, Мила снова работает из $LEGACY"
    fi
  fi
  notify "🔥 Мила: $SHORT не поднялась и откат не помог — нужна ручная помощь. Лог: $LOG"
  fail "откат не помог — нужна ручная помощь"
}

cmd_rollback() {
  local cur cur_sha target target_sha
  lock
  cur="$(current_release)"
  [ -n "$cur" ] || fail "нет текущего релиза"
  cur_sha="$(revision_of "$cur")"
  target="$(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '*.failed' ! -path "$cur" -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-)"
  [ -n "$target" ] || fail "нет прошлого релиза для отката"
  target_sha="$(revision_of "$target")"
  SHORT="${target_sha:0:7}"
  log "Откат: ${cur_sha:0:7} → $SHORT"
  switch_to "$target"
  pm2_start_release "$target"
  if wait_health "$target_sha" && wait_web; then
    # Откаченный релиз больше не «следующий» для отката.
    mv "$cur" "$cur.failed"
    prune
    log "Откат на $SHORT: готово"
    notify "↩️ Мила: откат на $SHORT выполнен вручную"
    return 0
  fi
  switch_to "$cur"
  pm2_start_release "$cur"
  fail "прошлый релиз $SHORT не поднялся, вернула ${cur_sha:0:7}"
}

cmd_status() {
  local cur rel
  cur="$(current_release)"
  echo "Сейчас на проде: ${cur:-нет релиза (Мила работает из $LEGACY)}"
  [ -n "$cur" ] && echo "Коммит: $(revision_of "$cur")"
  echo "Релизы:"
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' 2>/dev/null | sort -rn | cut -d' ' -f2- | sed 's/^/  /'
  echo "Здоровье: $(curl -s -m 5 "$HEALTH_URL" | head -c 400)"
  echo
  echo "Последние записи журнала:"
  tail -n 15 "$LOG" 2>/dev/null | sed 's/^/  /' || true
}

mkdir -p "$RELEASES"
case "${1:-}" in
  deploy) cmd_deploy "${2:-}" ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  *)
    echo "Использование: $0 deploy <sha> | rollback | status" >&2
    exit 2
    ;;
esac
