#!/usr/bin/env bash
# Проверка deploy/deploy.sh и deploy/deploy-entry.sh на настоящем git, без сервера:
# PM2 — подставной (запоминает, из какой папки запущен процесс), /api/health —
# маленький сервер, который отвечает коммитом из папки запущенного процесса.
# Запуск: bash scripts/check-deploy.sh   (входит в npm run check)
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
HEALTH_PID=""
cleanup() { [ -n "$HEALTH_PID" ] && kill "$HEALTH_PID" 2>/dev/null; rm -rf "$T"; }
trap cleanup EXIT

passed=0
ok() { passed=$((passed + 1)); echo "  ✓ $1"; }
die() { echo "  ✗ $1" >&2; exit 1; }
echo "check-deploy"

export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export GIT_CONFIG_GLOBAL=/dev/null

# --- приложение-образец: как totus_ai_v2, только крошечное ---
W="$T/work"
mkdir -p "$W/server" "$W/src" "$W/deploy"
cat >"$W/package.json" <<'JSON'
{"name":"fx","version":"1.0.0","private":true,"scripts":{
  "postinstall":"mkdir -p node_modules && date +%s%N > node_modules/.installed",
  "build":"mkdir -p .next && cat REVISION > .next/BUILT_FROM"}}
JSON
printf '{"name":"fx","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"fx","version":"1.0.0","hasInstallScript":true}}}\n' >"$W/package-lock.json"
printf 'A=\n' >"$W/.env.example"
echo v1 >"$W/server/app.txt"
echo v1 >"$W/src/page.txt"
cp "$SRC/deploy/deploy.sh" "$SRC/deploy/deploy-entry.sh" "$SRC/deploy/ecosystem.config.cjs" "$W/deploy/"
git -C "$W" init -q -b main
git -C "$W" add -A && git -C "$W" commit -qm v1
git clone -q --bare "$W" "$T/origin.git"
git -C "$W" remote add origin "$T/origin.git"
commit() { # $1 файл, $2 текст → sha
  echo "$2" >"$W/$1"
  git -C "$W" add -A && git -C "$W" commit -qm "$2"
  git -C "$W" push -q origin main
  git -C "$W" rev-parse HEAD
}

# --- «сервер» ---
ROOT="$T/srv"
mkdir -p "$ROOT/shared" "$ROOT/bin" "$T/legacy" "$T/fakebin"
printf 'A=1\n' >"$ROOT/shared/.env"
git clone -q --mirror "$T/origin.git" "$ROOT/repo.git"
install -m 755 "$SRC/deploy/deploy.sh" "$SRC/deploy/deploy-entry.sh" "$ROOT/bin/"

STATE="$T/pm2.state"
: >"$STATE"
cat >"$T/fakebin/pm2" <<EOF
#!/usr/bin/env bash
case "\$1" in
  delete) sed -i "/^\$2 /d" "$STATE"; exit 0 ;;
  start) echo "\$4 \$(pwd -P)" >>"$STATE" ;;
  -v) echo 7.0.1 ;;
  jlist) node -e 'const fs=require("fs");const m=new Map();for(const l of fs.readFileSync(process.argv[1],"utf8").split("\\n")){const i=l.indexOf(" ");if(i>0)m.set(l.slice(0,i),l.slice(i+1))}console.log(JSON.stringify([...m].map(([name,cwd])=>({name,pm2_env:{pm_cwd:cwd,status:"online"}}))))' "$STATE" ;;
esac
exit 0
EOF
chmod +x "$T/fakebin/pm2"

PORT_FILE="$T/port"
node -e '
  const http = require("node:http"), fs = require("node:fs"), path = require("node:path")
  const [state, portFile] = process.argv.slice(1)
  const dirOf = (name) => {
    const line = fs.readFileSync(state, "utf8").trim().split("\n").reverse().find((l) => l.startsWith(name + " "))
    return line ? line.slice(name.length + 1) : null
  }
  const srv = http.createServer((req, res) => {
    const dir = dirOf(req.url.startsWith("/web") ? "totus-ai-web" : "totus-ai-api")
    const web = req.url.startsWith("/web")
    if (!dir) { res.statusCode = 502; return res.end("down") }
    if (web) {
      if (fs.existsSync(path.join(dir, "BROKEN_WEB"))) { res.statusCode = 502; return res.end("down") }
      return res.end("ok")
    }
    let commit = null
    try { commit = fs.readFileSync(path.join(dir, "REVISION"), "utf8").trim() } catch {}
    // BROKEN: процесс отвечает, но это не новая версия (как если бы поднялась старая).
    if (fs.existsSync(path.join(dir, "BROKEN"))) commit = "0".repeat(40)
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ ok: true, commit, llm: { enabled: true }, levelTravel: { enabled: true }, db: { configured: true } }))
  })
  srv.listen(0, "127.0.0.1", () => fs.writeFileSync(portFile, String(srv.address().port)))
' "$STATE" "$PORT_FILE" &
HEALTH_PID=$!
for _ in $(seq 50); do [ -s "$PORT_FILE" ] && break; sleep 0.1; done
PORT="$(cat "$PORT_FILE")"

export DEPLOY_ROOT="$ROOT" PM2_BIN="$T/fakebin/pm2" DEPLOY_LEGACY_DIR="$T/legacy" \
  DEPLOY_HEALTH_URL="http://127.0.0.1:$PORT/api/health" DEPLOY_WEB_URL="http://127.0.0.1:$PORT/web" \
  DEPLOY_HEALTH_TIMEOUT=6 DEPLOY_KEEP=3 DEPLOY_JWT_SOURCE="$T/no-api.env"
D="$ROOT/bin/deploy.sh"
run() { "$D" "$@" >"$T/out" 2>&1; }
cur() { cat "$(readlink -f "$ROOT/current")/REVISION"; }
api_dir() { grep '^totus-ai-api ' "$STATE" | tail -1 | cut -d' ' -f2-; }

# 1. Первая выкладка: сборка, npm ci, PM2 из папки релиза.
S1="$(git -C "$W" rev-parse HEAD)"
run deploy "$S1" || { cat "$T/out"; die "первая выкладка"; }
[ "$(cur)" = "$S1" ] || die "current → первый коммит"
[ "$(api_dir)" = "$(readlink -f "$ROOT/current")" ] || die "API запущен из папки релиза"
grep -q '^totus-ai-web ' "$STATE" || die "сайт Маши тоже запущен"
[ "$(cat "$ROOT/current/.next/BUILT_FROM")" = "$S1" ] || die "сборка из этого коммита"
[ -L "$ROOT/current/.env" ] || die ".env — ссылка на shared"
ok "первая выкладка: релиз собран, PM2 запущен из него, .env общий"

# 2. Изменился только server/ — без сборки и без npm ci.
INST="$(cat "$ROOT/current/node_modules/.installed")"
S2="$(commit server/app.txt v2)"
run deploy "$S2" || { cat "$T/out"; die "выкладка серверной правки"; }
[ "$(cur)" = "$S2" ] || die "current → v2"
[ "$(cat "$ROOT/current/.next/BUILT_FROM")" = "$S1" ] || die "сборка не запускалась (взята прошлая)"
[ "$(cat "$ROOT/current/node_modules/.installed")" = "$INST" ] || die "зависимости взяты из прошлого релиза"
grep -q 'сборка не нужна' "$T/out" || die "в логе сказано, что сборка не нужна"
ok "правка сервера: без сборки, зависимости из прошлого релиза"

# 3. Изменился src/ — сборка.
S3="$(commit src/page.txt v3)"
run deploy "$S3" || { cat "$T/out"; die "выкладка правки сайта"; }
[ "$(cat "$ROOT/current/.next/BUILT_FROM")" = "$S3" ] || die "сборка из нового коммита"
ok "правка сайта Маши: сборка запускается"

# 4. Новая версия не поднимается — откат на прошлую, выход с ошибкой.
echo x >"$W/BROKEN"
S4="$(commit server/app.txt v4-broken)"
if run deploy "$S4"; then die "сломанная выкладка должна завершиться ошибкой"; fi
[ "$(cur)" = "$S3" ] || die "после отката current → v3"
[ "$(cat "$(api_dir)/REVISION")" = "$S3" ] || die "API снова из v3"
ls -d "$ROOT"/releases/*-"${S4:0:7}".failed >/dev/null || die "сломанный релиз помечен .failed"
grep -q 'вернула' "$T/out" || die "в логе сказано про откат"
git -C "$W" rm -q BROKEN && git -C "$W" commit -qm unbreak && git -C "$W" push -q origin main
ok "API не поднялся — сама вернулась на прошлую версию"

# 4б. API жив, а сайт Маши (ai.totus.club) не отвечает — тоже откат.
echo x >"$W/BROKEN_WEB"
S4B="$(commit src/page.txt v4-web-broken)"
if run deploy "$S4B"; then die "выкладка с неработающим сайтом должна завершиться ошибкой"; fi
[ "$(cur)" = "$S3" ] || die "после отката сайта current → v3"
git -C "$W" rm -q BROKEN_WEB && git -C "$W" commit -qm unbreak-web && git -C "$W" push -q origin main
ok "сайт Маши не поднялся — тоже откат"

# 5. Коммит не из main — отказ.
git -C "$W" checkout -q -b feature && S5="$(echo f >"$W/server/f.txt" && git -C "$W" add -A && git -C "$W" commit -qm f && git -C "$W" rev-parse HEAD)"
git -C "$W" push -q origin feature && git -C "$W" checkout -q main
git --git-dir="$ROOT/repo.git" fetch -q origin '+refs/heads/*:refs/heads/*'
if run deploy "$S5"; then die "коммит не из main выкладываться не должен"; fi
grep -q 'не из ветки main' "$T/out" || die "причина: не из main"
[ "$(cur)" = "$S3" ] || die "прод не тронут"
ok "коммит не из main — отказ, прод не тронут"

# 6. Новая переменная в .env.example, которой нет на сервере — стоп до переключения.
printf 'A=\nNEW_KEY=\n' >"$W/.env.example"
git -C "$W" add -A && git -C "$W" commit -qm env && git -C "$W" push -q origin main
S6="$(git -C "$W" rev-parse HEAD)"
if run deploy "$S6"; then die "без переменной выкладка должна остановиться"; fi
grep -q 'NEW_KEY' "$T/out" || die "названа недостающая переменная"
[ "$(cur)" = "$S3" ] || die "прод не тронут"
printf 'A=1\nNEW_KEY=2\n' >"$ROOT/shared/.env"
run deploy "$S6" || { cat "$T/out"; die "после добавления переменной выкладка проходит"; }
[ "$(cur)" = "$S6" ] || die "current → коммит с переменной"
ok "новая переменная: стоп с понятной причиной, после добавления — выкладка"

# 6б. JWT_SECRET не совпадает с totus_API — стоп до переключения, Маша не тронута.
printf 'JWT_SECRET=api-secret\n' >"$T/api.env"
printf 'A=1\nNEW_KEY=2\nJWT_SECRET=old-secret\n' >"$ROOT/shared/.env"
S6B="$(commit server/app.txt v6b)"
if DEPLOY_JWT_SOURCE="$T/api.env" run deploy "$S6B"; then die "при разных JWT_SECRET выкладка должна остановиться"; fi
grep -q 'JWT_SECRET' "$T/out" || die "причина: JWT_SECRET"
grep -q 'api-secret\|old-secret' "$T/out" && die "значения ключа не печатаются"
[ "$(cur)" = "$S6" ] || die "прод не тронут"
printf 'A=1\nNEW_KEY=2\nJWT_SECRET=api-secret\n' >"$ROOT/shared/.env"
DEPLOY_JWT_SOURCE="$T/api.env" run deploy "$S6B" || { cat "$T/out"; die "с одинаковым ключом выкладка проходит"; }
S6_PREV="$S6"
S6="$S6B"
ok "JWT_SECRET не как у totus_API — стоп до переключения, значения не печатаются"

# 7. Повтор и старый коммит из очереди — ничего не делаем.
run deploy "$S6" && grep -q 'уже на проде' "$T/out" || die "повтор того же коммита"
run deploy "$S2" && grep -q 'более новая версия' "$T/out" || die "старый коммит не ставится поверх нового"
[ "$(cur)" = "$S6" ] || die "прод не тронут"
ok "тот же или более старый коммит — пропуск"

# 8. Ручной откат.
run rollback || { cat "$T/out"; die "откат"; }
[ "$(cur)" = "$S6_PREV" ] || die "rollback → прошлый удачный релиз"
run status && grep -q "$S6_PREV" "$T/out" || die "status показывает коммит"
ok "rollback и status"

# 9. Храним не больше KEEP удачных релизов и один неудачный.
for i in 7 8 9; do run deploy "$(commit server/app.txt "v$i")" || die "выкладка v$i"; done
good="$(find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d ! -name '*.failed' | wc -l)"
bad="$(find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d -name '*.failed' | wc -l)"
[ "$good" -le 3 ] && [ "$bad" -le 1 ] || die "релизов: удачных $good, неудачных $bad"
ok "старые релизы чистятся (удачных ≤ 3, неудачных ≤ 1)"

# 9б. Проверка сервера (deploy/check-server.sh) видит рабочую выкладку.
PATH="$T/fakebin:$PATH" DEPLOY_LEGACY_DIR="$W" bash "$SRC/deploy/check-server.sh" >"$T/out" 2>&1 || true
for want in "totus-ai-api работает из текущего релиза" "totus-ai-web работает из текущего релиза" \
  "/api/health отвечает коммитом текущего релиза" "Маша отвечает: модель, Level.Travel и база подключены" "Ничего не изменено"; do
  grep -qF "$want" "$T/out" || { cat "$T/out"; die "check-server: нет «$want»"; }
done
grep -q "работает не из текущего релиза" "$T/out" && die "check-server: ложная ошибка про релиз"
ok "check-server.sh видит, что Маша работает из текущего релиза и отвечает его коммитом"

# 10. Первая выкладка, которая не поднялась, — возврат на старую папку.
ROOT2="$T/srv2"
mkdir -p "$ROOT2/shared" && printf 'A=1\nNEW_KEY=2\n' >"$ROOT2/shared/.env"
git clone -q --mirror "$T/origin.git" "$ROOT2/repo.git"
echo x >"$W/BROKEN"
SB="$(commit server/app.txt broken-first)"
rm -f "$W/BROKEN" && git -C "$W" add -A && git -C "$W" commit -qm unbreak2 && git -C "$W" push -q origin main
echo "legacy" >"$T/legacy/REVISION"
if DEPLOY_ROOT="$ROOT2" "$D" deploy "$SB" >"$T/out" 2>&1; then die "сломанная первая выкладка должна завершиться ошибкой"; fi
[ "$(api_dir)" = "$(cd "$T/legacy" && pwd -P)" ] || die "Маша снова из старой папки"
[ ! -e "$ROOT2/current" ] || die "current убран"
ok "первая выкладка не поднялась — Маша снова работает из старой папки"

# 11. Ключ из GitHub Actions умеет только deploy <sha>, rollback, status.
E="$ROOT/bin/deploy-entry.sh"
for bad in "bash" "rm -rf /" "deploy abc" "deploy $S6 ; id" "status now" "" "deploy"; do
  if SSH_ORIGINAL_COMMAND="$bad" "$E" >/dev/null 2>&1; then die "вход пропустил: «$bad»"; fi
done
SSH_ORIGINAL_COMMAND="status" "$E" >"$T/out" 2>&1 && grep -q 'Сейчас на проде' "$T/out" || die "status через вход"
ok "вход для ключа: только deploy <sha>, rollback, status"

echo "check-deploy: $passed passed"
