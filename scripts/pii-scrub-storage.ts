/**
 * One-off clean-up of data stored BEFORE the personal-data guard:
 *   - chat history in MySQL (table ai_chats: title + messages);
 *   - the dialogue journal (~/.totus-chat-logs/chat-*.jsonl or TOTUS_LOG_DIR).
 * Personal data is replaced with «[скрыто: …]». No backups are written: a
 * backup would keep the same personal data in the open.
 *
 * Run on the server from /home/totus_ai_v2 (uses the same .env):
 *   npx tsx scripts/pii-scrub-storage.ts            — dry run, counts only
 *   npx tsx scripts/pii-scrub-storage.ts --apply    — write the masked data
 */
import 'dotenv/config'
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { scrubLogLine, scrubStoredChat } from '../server/pii/storage.ts'

const apply = process.argv.includes('--apply')

async function scrubDb() {
  const { getPool, isDbConfigured } = await import('../server/db.ts')
  if (!isDbConfigured()) {
    console.log('MySQL: не настроен (DB_HOST/DB_USER/DB_NAME) — пропуск')
    return
  }
  const db = getPool()!
  let lastId = ''
  let rows = 0
  let changed = 0
  for (;;) {
    const [batch] = (await db.query(
      `SELECT id, title, messages_json FROM ai_chats WHERE id > :lastId ORDER BY id LIMIT 200`,
      { lastId },
    )) as unknown as [Array<{ id: string; title: string; messages_json: string }>]
    if (!batch.length) break
    for (const row of batch) {
      rows++
      lastId = row.id
      const r = scrubStoredChat(row)
      if (!r.changed) continue
      changed++
      if (apply) {
        await db.query(`UPDATE ai_chats SET title = :title, messages_json = CAST(:messages AS JSON) WHERE id = :id`, {
          id: row.id,
          title: r.title.slice(0, 255),
          messages: r.messagesJson,
        })
      }
    }
  }
  console.log(`MySQL ai_chats: чатов ${rows}, с личными данными ${changed}${apply ? ' — замаскировано' : ' (dry run)'}`)
  await db.end?.()
}

function scrubLogs() {
  const dir = process.env.TOTUS_LOG_DIR?.trim() || path.join(homedir(), '.totus-chat-logs')
  if (!existsSync(dir)) {
    console.log(`Журнал: папки ${dir} нет — пропуск`)
    return
  }
  let files = 0
  let lines = 0
  let changed = 0
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    files++
    const file = path.join(dir, f)
    const out: string[] = []
    let fileChanged = false
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      lines++
      const r = scrubLogLine(line)
      if (r.changed) {
        changed++
        fileChanged = true
      }
      out.push(r.line)
    }
    if (apply && fileChanged) {
      const tmp = `${file}.tmp`
      writeFileSync(tmp, out.join('\n'), 'utf8')
      renameSync(tmp, file)
    }
  }
  console.log(`Журнал ${dir}: файлов ${files}, строк ${lines}, с личными данными ${changed}${apply ? ' — замаскировано' : ' (dry run)'}`)
}

scrubLogs()
await scrubDb()
if (!apply) console.log('Это пробный запуск. Для записи: npx tsx scripts/pii-scrub-storage.ts --apply')
