use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::State;

#[derive(Clone)]
pub struct DatabaseState(pub PathBuf);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    id: String,
    title: String,
    updated_at: u64,
    message_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredConversation {
    id: String,
    title: String,
    updated_at: u64,
    messages: Vec<StoredMessage>,
}

pub fn open(state: &State<'_, DatabaseState>) -> Result<Connection, String> {
    Connection::open(&state.0).map_err(|error| format!("无法打开本地数据库：{error}"))
}

pub fn init(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let connection = Connection::open(path)?;
    connection.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
    init_conversation_schema(&connection)?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS model_profiles (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL,
           kind TEXT NOT NULL CHECK(kind IN ('ollama', 'openai-compatible')),
           base_url TEXT NOT NULL,
           model TEXT NOT NULL,
           context_window INTEGER NOT NULL,
           has_api_key INTEGER NOT NULL DEFAULT 0,
           updated_at INTEGER NOT NULL
         );",
    )?;
    Ok(())
}

fn init_conversation_schema(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS conversations (
           id TEXT PRIMARY KEY,
           title TEXT NOT NULL,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS messages (
           id TEXT PRIMARY KEY,
           conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
           role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
           content TEXT NOT NULL,
           created_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS messages_conversation_id ON messages(conversation_id, created_at);
         "
    )
}

fn project_database_path(root: &Path) -> PathBuf {
    root.join(".vinkey").join("conversations.sqlite3")
}

pub fn open_project(state: &State<'_, crate::WorkspaceState>) -> Result<Connection, String> {
    let workspace = crate::lock_workspace(state)?;
    let directory = workspace.root.join(".vinkey");
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建项目数据目录：{error}"))?;
    let connection = Connection::open(project_database_path(&workspace.root))
        .map_err(|error| format!("无法打开项目会话数据库：{error}"))?;
    init_conversation_schema(&connection)
        .map_err(|error| format!("无法初始化项目会话数据库：{error}"))?;
    Ok(connection)
}

fn migrate_legacy_conversations(
    legacy: &DatabaseState,
    project: &mut Connection,
) -> Result<(), String> {
    let marker = legacy
        .0
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(".legacy-conversations-migrated");
    if marker.exists() {
        return Ok(());
    }
    let legacy_connection =
        Connection::open(&legacy.0).map_err(|error| format!("无法读取旧会话数据库：{error}"))?;
    let legacy_count = legacy_connection
        .query_row("SELECT COUNT(*) FROM conversations", [], |row| {
            row.get::<_, i64>(0)
        })
        .unwrap_or(0);
    if legacy_count > 0 {
        let legacy_path = legacy.0.to_string_lossy().into_owned();
        project
            .execute("ATTACH DATABASE ?1 AS legacy", [legacy_path.as_str()])
            .map_err(|error| format!("无法迁移旧会话：{error}"))?;
        let result = project
            .execute_batch(
                "INSERT OR IGNORE INTO conversations(id, title, created_at, updated_at)
                   SELECT id, title, created_at, updated_at FROM legacy.conversations;
                 INSERT OR IGNORE INTO messages(id, conversation_id, role, content, created_at)
                   SELECT id, conversation_id, role, content, created_at FROM legacy.messages;",
            )
            .map_err(|error| format!("无法迁移旧会话：{error}"));
        let detach_result = project.execute_batch("DETACH DATABASE legacy");
        result?;
        detach_result.map_err(|error| format!("无法完成旧会话迁移：{error}"))?;
    }
    fs::write(marker, b"migrated\n").map_err(|error| format!("无法记录会话迁移状态：{error}"))
}

fn open_project_for_commands(
    state: &State<'_, crate::WorkspaceState>,
    legacy: &State<'_, DatabaseState>,
) -> Result<Connection, String> {
    let mut connection = open_project(state)?;
    migrate_legacy_conversations(legacy, &mut connection)?;
    Ok(connection)
}

#[tauri::command]
pub fn list_conversations(
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<Vec<ConversationSummary>, String> {
    let connection = open_project_for_commands(&state, &legacy)?;
    let mut statement = connection
        .prepare(
            "SELECT c.id, c.title, c.updated_at, COUNT(m.id)
         FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
         GROUP BY c.id ORDER BY c.updated_at DESC",
        )
        .map_err(|error| format!("无法读取会话：{error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(ConversationSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                updated_at: row.get::<_, i64>(2)? as u64,
                message_count: row.get::<_, i64>(3)? as u64,
            })
        })
        .map_err(|error| format!("无法读取会话：{error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取会话：{error}"))
}

#[tauri::command]
pub fn load_conversation(
    id: String,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<StoredConversation, String> {
    let connection = open_project_for_commands(&state, &legacy)?;
    let (title, updated_at): (String, i64) = connection
        .query_row(
            "SELECT title, updated_at FROM conversations WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "找不到该会话".to_string())?;
    let mut statement = connection.prepare(
        "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ?1 ORDER BY created_at, rowid"
    ).map_err(|error| format!("无法读取消息：{error}"))?;
    let rows = statement
        .query_map([&id], |row| {
            Ok(StoredMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get::<_, i64>(3)? as u64,
            })
        })
        .map_err(|error| format!("无法读取消息：{error}"))?;
    let messages = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取消息：{error}"))?;
    Ok(StoredConversation {
        id,
        title,
        updated_at: updated_at as u64,
        messages,
    })
}

#[tauri::command]
pub fn save_conversation_message(
    conversation_id: String,
    title: String,
    message: StoredMessage,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<(), String> {
    if !matches!(message.role.as_str(), "user" | "assistant" | "system") {
        return Err("无效消息角色".into());
    }
    let mut connection = open_project_for_commands(&state, &legacy)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("无法保存会话：{error}"))?;
    transaction
        .execute(
            "INSERT INTO conversations(id, title, created_at, updated_at) VALUES(?1, ?2, ?3, ?3)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at",
            params![conversation_id, title, message.created_at as i64],
        )
        .map_err(|error| format!("无法保存会话：{error}"))?;
    transaction.execute(
        "INSERT OR REPLACE INTO messages(id, conversation_id, role, content, created_at) VALUES(?1, ?2, ?3, ?4, ?5)",
        params![message.id, conversation_id, message.role, message.content, message.created_at as i64],
    ).map_err(|error| format!("无法保存消息：{error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("无法提交会话：{error}"))
}

#[tauri::command]
pub fn delete_conversation(
    id: String,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<(), String> {
    open_project_for_commands(&state, &legacy)?
        .execute("DELETE FROM conversations WHERE id = ?1", [id])
        .map_err(|error| format!("无法删除会话：{error}"))?;
    Ok(())
}
