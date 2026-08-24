import mysql from 'mysql2/promise'

let pool: mysql.Pool | null = null
let schemaReady: Promise<void> | null = null

export function isDbConfigured(): boolean {
  return Boolean(
    process.env.DB_HOST &&
      process.env.DB_USER &&
      process.env.DB_NAME,
  )
}

export function getPool(): mysql.Pool | null {
  if (!isDbConfigured()) return null
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
    })
  }
  return pool
}

export async function ensureChatSchema(): Promise<boolean> {
  const db = getPool()
  if (!db) return false
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS ai_chats (
          id VARCHAR(64) NOT NULL,
          user_id INT NOT NULL,
          title VARCHAR(255) NOT NULL DEFAULT 'Новый чат',
          messages_json JSON NOT NULL,
          updated_at BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_ai_chats_user_updated (user_id, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      await db.query(`
        CREATE TABLE IF NOT EXISTS ai_chat_meta (
          user_id INT NOT NULL,
          active_chat_id VARCHAR(64) NULL,
          PRIMARY KEY (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
    })().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  await schemaReady
  return true
}

export function dbStatus() {
  return {
    configured: isDbConfigured(),
    host: process.env.DB_HOST || null,
    database: process.env.DB_NAME || null,
  }
}
