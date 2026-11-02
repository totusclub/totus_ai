-- AI chat history (Totus Маша) — run once on your MySQL (same DB as kedam is fine).
-- Tables are created automatically on API boot if DB_* env is set; this file is for manual ops.

CREATE TABLE IF NOT EXISTS ai_chats (
  id VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'Новый чат',
  messages_json JSON NOT NULL,
  updated_at BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_chats_user_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_chat_meta (
  user_id INT NOT NULL,
  active_chat_id VARCHAR(64) NULL,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
