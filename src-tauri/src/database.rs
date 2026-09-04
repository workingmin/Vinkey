use crate::runtime_log::RuntimeLogState;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{Instant, SystemTime, UNIX_EPOCH},
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
    pub completed_at: Option<u64>,
    pub activity_log: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredConversation {
    id: String,
    title: String,
    updated_at: u64,
    messages: Vec<StoredMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemoryItem {
    id: String,
    kind: String,
    title: String,
    content: String,
    source_paths: Vec<String>,
    confidence: String,
    status: String,
    created_at: u64,
    updated_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemoryCandidate {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub source_paths: Vec<String>,
    pub confidence: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRecord {
    pub id: String,
    pub work_id: String,
    pub canonical_name: String,
    pub aliases: Vec<String>,
    pub description: String,
    pub confidence: String,
    pub status: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterInput {
    pub id: String,
    pub work_id: String,
    pub canonical_name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub description: String,
    pub confidence: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterMentionInput {
    pub id: String,
    pub work_id: String,
    pub character_id: String,
    pub source_id: String,
    pub chapter_id: Option<String>,
    pub scene_id: Option<String>,
    pub start_char: u64,
    pub end_char: u64,
    pub line_start: u64,
    pub line_end: u64,
    pub quote: Option<String>,
    pub source_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipInput {
    pub id: String,
    pub work_id: String,
    pub source_character_id: String,
    pub target_character_id: String,
    pub relation_type: String,
    pub directed: bool,
    pub confidence: Option<String>,
    pub status: Option<String>,
    pub first_seen_at: Option<u64>,
    pub last_seen_at: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipEvidenceInput {
    pub id: String,
    pub relationship_id: String,
    pub source_id: String,
    pub chapter_id: Option<String>,
    pub scene_id: Option<String>,
    pub start_char: u64,
    pub end_char: u64,
    pub line_start: u64,
    pub line_end: u64,
    pub quote: Option<String>,
    pub source_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterNeighbor {
    pub relationship_id: String,
    pub character_id: String,
    pub relation_type: String,
    pub directed: bool,
    pub confidence: String,
    pub status: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn validate_graph_id(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.len() > 160
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':' | '.')
        })
    {
        return Err(format!("{label} 无效"));
    }
    Ok(())
}

fn validate_graph_text(value: &str, label: &str, max_chars: usize) -> Result<(), String> {
    if value.trim().is_empty() || value.chars().count() > max_chars {
        return Err(format!("{label} 无效或超过 {max_chars} 字限制"));
    }
    Ok(())
}

fn validate_graph_state(confidence: &str, status: &str) -> Result<(), String> {
    if !matches!(confidence, "low" | "medium" | "high") {
        return Err("人物关系置信度无效".into());
    }
    if !matches!(status, "proposed" | "confirmed" | "rejected") {
        return Err("人物关系状态无效".into());
    }
    Ok(())
}

fn refresh_character_search(connection: &Connection, work_id: &str) -> Result<(), rusqlite::Error> {
    connection.execute("DELETE FROM character_search WHERE work_id = ?1", [work_id])?;
    let mut statement = connection.prepare(
        "SELECT c.id, c.work_id, c.canonical_name, COALESCE(group_concat(a.alias, ' '), ''), c.description
         FROM characters c LEFT JOIN character_aliases a ON a.character_id = c.id
         WHERE c.work_id = ?1 GROUP BY c.id",
    )?;
    let rows = statement.query_map([work_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    let records = rows.collect::<Result<Vec<_>, _>>()?;
    drop(statement);
    for (id, work, name, aliases, description) in records {
        connection.execute(
            "INSERT INTO character_search(character_id, work_id, name, aliases, description) VALUES(?1, ?2, ?3, ?4, ?5)",
            params![id, work, name, aliases, description],
        )?;
    }
    Ok(())
}

fn character_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CharacterRecord> {
    let aliases_json: String = row.get(3)?;
    Ok(CharacterRecord {
        id: row.get(0)?,
        work_id: row.get(1)?,
        canonical_name: row.get(2)?,
        aliases: serde_json::from_str(&aliases_json).unwrap_or_default(),
        description: row.get(4)?,
        confidence: row.get(5)?,
        status: row.get(6)?,
        created_at: row.get::<_, i64>(7)? as u64,
        updated_at: row.get::<_, i64>(8)? as u64,
    })
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
           created_at INTEGER NOT NULL,
           completed_at INTEGER,
           activity_log TEXT
         );
         CREATE INDEX IF NOT EXISTS messages_conversation_id ON messages(conversation_id, created_at);
         CREATE TABLE IF NOT EXISTS project_memory (
           id TEXT PRIMARY KEY,
           kind TEXT NOT NULL CHECK(kind IN ('summary', 'fact', 'character', 'timeline', 'foreshadowing', 'decision')),
           title TEXT NOT NULL,
           content TEXT NOT NULL,
           source_paths TEXT NOT NULL DEFAULT '[]',
           confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
           status TEXT NOT NULL CHECK(status IN ('proposed', 'confirmed', 'rejected')),
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS project_memory_status_updated ON project_memory(status, updated_at DESC);
         CREATE TABLE IF NOT EXISTS characters (
           id TEXT PRIMARY KEY,
           work_id TEXT NOT NULL,
           canonical_name TEXT NOT NULL,
           description TEXT NOT NULL DEFAULT '',
           confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
           status TEXT NOT NULL CHECK(status IN ('proposed', 'confirmed', 'rejected')),
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL,
           UNIQUE(work_id, canonical_name)
         );
         CREATE INDEX IF NOT EXISTS characters_work_name ON characters(work_id, canonical_name);
         CREATE TABLE IF NOT EXISTS character_aliases (
           character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
           alias TEXT NOT NULL,
           PRIMARY KEY(character_id, alias)
         );
         CREATE INDEX IF NOT EXISTS character_aliases_alias ON character_aliases(alias);
         CREATE VIRTUAL TABLE IF NOT EXISTS character_search USING fts5(
           character_id UNINDEXED,
           work_id UNINDEXED,
           name,
           aliases,
           description
         );
         CREATE TABLE IF NOT EXISTS character_mentions (
           id TEXT PRIMARY KEY,
           work_id TEXT NOT NULL,
           character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
           source_id TEXT NOT NULL,
           chapter_id TEXT,
           scene_id TEXT,
           start_char INTEGER NOT NULL,
           end_char INTEGER NOT NULL,
           line_start INTEGER NOT NULL,
           line_end INTEGER NOT NULL,
           quote TEXT,
           source_fingerprint TEXT,
           UNIQUE(character_id, source_id, start_char, end_char)
         );
         CREATE INDEX IF NOT EXISTS character_mentions_work_location ON character_mentions(work_id, source_id, start_char);
         CREATE INDEX IF NOT EXISTS character_mentions_character_chapter ON character_mentions(character_id, chapter_id);
         CREATE TABLE IF NOT EXISTS relationships (
           id TEXT PRIMARY KEY,
           work_id TEXT NOT NULL,
           source_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
           target_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
           relation_type TEXT NOT NULL,
           directed INTEGER NOT NULL CHECK(directed IN (0, 1)),
           confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
           status TEXT NOT NULL CHECK(status IN ('proposed', 'confirmed', 'rejected')),
           first_seen_at INTEGER,
           last_seen_at INTEGER,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL,
           UNIQUE(work_id, source_character_id, target_character_id, relation_type, directed)
         );
         CREATE INDEX IF NOT EXISTS relationships_work_source ON relationships(work_id, source_character_id, status, relation_type);
         CREATE INDEX IF NOT EXISTS relationships_work_target ON relationships(work_id, target_character_id, status, relation_type);
         CREATE TABLE IF NOT EXISTS relationship_evidence (
           id TEXT PRIMARY KEY,
           relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
           source_id TEXT NOT NULL,
           chapter_id TEXT,
           scene_id TEXT,
           start_char INTEGER NOT NULL,
           end_char INTEGER NOT NULL,
           line_start INTEGER NOT NULL,
           line_end INTEGER NOT NULL,
           quote TEXT,
           source_fingerprint TEXT,
           UNIQUE(relationship_id, source_id, start_char, end_char)
         );
         CREATE INDEX IF NOT EXISTS relationship_evidence_relationship ON relationship_evidence(relationship_id, chapter_id);
         CREATE INDEX IF NOT EXISTS relationship_evidence_source ON relationship_evidence(source_id, start_char);
         "
    )?;
    for statement in [
        "ALTER TABLE messages ADD COLUMN completed_at INTEGER",
        "ALTER TABLE messages ADD COLUMN activity_log TEXT",
    ] {
        let _ = connection.execute(statement, []);
    }
    Ok(())
}

fn validate_memory_id(id: &str) -> Result<(), String> {
    if id.trim().is_empty()
        || id.len() > 120
        || !id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err("项目记忆 ID 无效".into());
    }
    Ok(())
}

fn validate_memory_candidate(candidate: &ProjectMemoryCandidate) -> Result<(), String> {
    validate_memory_id(&candidate.id)?;
    if !matches!(
        candidate.kind.as_str(),
        "summary" | "fact" | "character" | "timeline" | "foreshadowing" | "decision"
    ) {
        return Err("项目记忆类型无效".into());
    }
    if candidate.title.trim().is_empty() || candidate.title.chars().count() > 160 {
        return Err("项目记忆标题无效".into());
    }
    if candidate.content.trim().is_empty() || candidate.content.chars().count() > 20_000 {
        return Err("项目记忆内容无效或超过 20000 字限制".into());
    }
    if let Some(confidence) = candidate.confidence.as_deref() {
        if !matches!(confidence, "low" | "medium" | "high") {
            return Err("项目记忆置信度无效".into());
        }
    }
    if candidate.source_paths.len() > 50
        || candidate
            .source_paths
            .iter()
            .any(|path| path.len() > 500 || path.contains('\0'))
    {
        return Err("项目记忆来源路径无效".into());
    }
    Ok(())
}

fn memory_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectMemoryItem> {
    let source_paths = row
        .get::<_, String>(4)
        .ok()
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default();
    Ok(ProjectMemoryItem {
        id: row.get(0)?,
        kind: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        source_paths,
        confidence: row.get(5)?,
        status: row.get(6)?,
        created_at: row.get::<_, i64>(7)? as u64,
        updated_at: row.get::<_, i64>(8)? as u64,
    })
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

fn load_characters(connection: &Connection, work_id: &str) -> Result<Vec<CharacterRecord>, String> {
    let mut statement = connection
        .prepare(
            "SELECT c.id, c.work_id, c.canonical_name,
                    COALESCE((SELECT json_group_array(alias) FROM character_aliases WHERE character_id = c.id), '[]'),
                    c.description, c.confidence, c.status, c.created_at, c.updated_at
             FROM characters c WHERE c.work_id = ?1 ORDER BY c.canonical_name",
        )
        .map_err(|error| format!("无法读取人物：{error}"))?;
    statement
        .query_map([work_id], character_from_row)
        .map_err(|error| format!("无法读取人物：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取人物：{error}"))
}

#[tauri::command]
pub fn upsert_characters(
    characters: Vec<CharacterInput>,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<Vec<CharacterRecord>, String> {
    if characters.is_empty() || characters.len() > 10_000 {
        return Err("人物批次必须在 1 到 10000 条之间".into());
    }
    let mut work_ids = HashSet::new();
    for character in &characters {
        validate_graph_id(&character.id, "人物 ID")?;
        validate_graph_id(&character.work_id, "作品 ID")?;
        validate_graph_text(&character.canonical_name, "人物名称", 160)?;
        if character.description.chars().count() > 20_000 {
            return Err("人物描述超过 20000 字限制".into());
        }
        let confidence = character.confidence.as_deref().unwrap_or("medium");
        let status = character.status.as_deref().unwrap_or("proposed");
        validate_graph_state(confidence, status)?;
        if character.aliases.len() > 100
            || character
                .aliases
                .iter()
                .any(|alias| alias.trim().is_empty() || alias.chars().count() > 160)
        {
            return Err("人物别名无效".into());
        }
        work_ids.insert(character.work_id.clone());
    }
    let mut connection = open_project_for_commands(&state, &legacy)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("无法创建人物事务：{error}"))?;
    let timestamp = now_ms() as i64;
    for character in &characters {
        let confidence = character.confidence.as_deref().unwrap_or("medium");
        let status = character.status.as_deref().unwrap_or("proposed");
        transaction
            .execute(
                "INSERT INTO characters(id, work_id, canonical_name, description, confidence, status, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
                 ON CONFLICT(id) DO UPDATE SET work_id=excluded.work_id, canonical_name=excluded.canonical_name,
                   description=excluded.description, confidence=excluded.confidence, status=excluded.status, updated_at=excluded.updated_at",
                params![
                    character.id,
                    character.work_id,
                    character.canonical_name.trim(),
                    character.description.trim(),
                    confidence,
                    status,
                    timestamp,
                ],
            )
            .map_err(|error| format!("无法保存人物：{error}"))?;
        transaction
            .execute(
                "DELETE FROM character_aliases WHERE character_id = ?1",
                [&character.id],
            )
            .map_err(|error| format!("无法更新人物别名：{error}"))?;
        for alias in character
            .aliases
            .iter()
            .map(|alias| alias.trim())
            .filter(|alias| *alias != character.canonical_name.trim())
        {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO character_aliases(character_id, alias) VALUES(?1, ?2)",
                    params![character.id, alias],
                )
                .map_err(|error| format!("无法保存人物别名：{error}"))?;
        }
    }
    transaction
        .commit()
        .map_err(|error| format!("无法提交人物：{error}"))?;
    for work_id in &work_ids {
        refresh_character_search(&connection, work_id)
            .map_err(|error| format!("无法更新人物搜索索引：{error}"))?;
    }
    let work_id = characters[0].work_id.clone();
    load_characters(&connection, &work_id)
}

#[tauri::command]
pub fn search_characters(
    work_id: String,
    query: String,
    max_results: usize,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<Vec<CharacterRecord>, String> {
    validate_graph_id(&work_id, "作品 ID")?;
    let connection = open_project_for_commands(&state, &legacy)?;
    let query = query.trim();
    let limit = max_results.clamp(1, 200);
    if query.is_empty() {
        let mut characters = load_characters(&connection, &work_id)?;
        characters.truncate(limit);
        return Ok(characters);
    }
    let match_query = format!("\"{}\"*", query.replace('"', "\"\""));
    let like = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let mut statement = connection
        .prepare(
            "SELECT c.id, c.work_id, c.canonical_name,
                    COALESCE((SELECT json_group_array(alias) FROM character_aliases WHERE character_id = c.id), '[]'),
                    c.description, c.confidence, c.status, c.created_at, c.updated_at
             FROM characters c JOIN character_search ON character_search.character_id = c.id
             WHERE c.work_id = ?1 AND (character_search MATCH ?2 OR c.canonical_name LIKE ?3 ESCAPE '\\'
                    OR EXISTS (SELECT 1 FROM character_aliases a WHERE a.character_id = c.id AND a.alias LIKE ?3 ESCAPE '\\'))
             ORDER BY c.canonical_name LIMIT ?4",
        )
        .map_err(|error| format!("无法搜索人物：{error}"))?;
    statement
        .query_map(
            params![work_id, match_query, like, limit as i64],
            character_from_row,
        )
        .map_err(|error| format!("无法搜索人物：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法搜索人物：{error}"))
}

#[tauri::command]
pub fn upsert_character_mentions(
    mentions: Vec<CharacterMentionInput>,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<usize, String> {
    if mentions.is_empty() || mentions.len() > 100_000 {
        return Err("人物出场批次必须在 1 到 100000 条之间".into());
    }
    for mention in &mentions {
        validate_graph_id(&mention.id, "人物出场 ID")?;
        validate_graph_id(&mention.work_id, "作品 ID")?;
        validate_graph_id(&mention.character_id, "人物 ID")?;
        validate_graph_text(&mention.source_id, "来源 ID", 500)?;
        if mention.start_char >= mention.end_char
            || mention.line_start == 0
            || mention.line_end < mention.line_start
        {
            return Err("人物出场位置无效".into());
        }
        if mention
            .quote
            .as_deref()
            .map(|quote| quote.chars().count() > 2_000)
            .unwrap_or(false)
        {
            return Err("人物出场证据超过 2000 字限制".into());
        }
    }
    let mut connection = open_project_for_commands(&state, &legacy)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("无法创建人物出场事务：{error}"))?;
    for mention in &mentions {
        transaction.execute(
            "INSERT INTO character_mentions(id, work_id, character_id, source_id, chapter_id, scene_id, start_char, end_char, line_start, line_end, quote, source_fingerprint)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(id) DO UPDATE SET work_id=excluded.work_id, character_id=excluded.character_id, source_id=excluded.source_id,
               chapter_id=excluded.chapter_id, scene_id=excluded.scene_id, start_char=excluded.start_char, end_char=excluded.end_char,
               line_start=excluded.line_start, line_end=excluded.line_end, quote=excluded.quote, source_fingerprint=excluded.source_fingerprint",
            params![mention.id, mention.work_id, mention.character_id, mention.source_id, mention.chapter_id, mention.scene_id, mention.start_char as i64, mention.end_char as i64, mention.line_start as i64, mention.line_end as i64, mention.quote, mention.source_fingerprint],
        ).map_err(|error| format!("无法保存人物出场：{error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("无法提交人物出场：{error}"))?;
    Ok(mentions.len())
}

#[tauri::command]
pub fn invalidate_character_source(
    source_id: String,
    source_fingerprint: String,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<usize, String> {
    validate_graph_text(&source_id, "来源 ID", 500)?;
    validate_graph_text(&source_fingerprint, "来源指纹", 200)?;
    let mut connection = open_project_for_commands(&state, &legacy)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("无法创建来源失效事务：{error}"))?;
    let mention_count: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM character_mentions WHERE source_id = ?1 AND (source_fingerprint IS NULL OR source_fingerprint <> ?2)",
            params![source_id, source_fingerprint],
            |row| row.get(0),
        )
        .map_err(|error| format!("无法统计过期人物出场：{error}"))?;
    let evidence_count: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM relationship_evidence WHERE source_id = ?1 AND (source_fingerprint IS NULL OR source_fingerprint <> ?2)",
            params![source_id, source_fingerprint],
            |row| row.get(0),
        )
        .map_err(|error| format!("无法统计过期关系证据：{error}"))?;
    transaction
        .execute(
            "DELETE FROM character_mentions WHERE source_id = ?1 AND (source_fingerprint IS NULL OR source_fingerprint <> ?2)",
            params![source_id, source_fingerprint],
        )
        .map_err(|error| format!("无法删除过期人物出场：{error}"))?;
    transaction
        .execute(
            "DELETE FROM relationship_evidence WHERE source_id = ?1 AND (source_fingerprint IS NULL OR source_fingerprint <> ?2)",
            params![source_id, source_fingerprint],
        )
        .map_err(|error| format!("无法删除过期关系证据：{error}"))?;
    transaction
        .execute(
            "UPDATE relationships SET status = 'proposed', updated_at = ?1
             WHERE status = 'confirmed' AND NOT EXISTS
               (SELECT 1 FROM relationship_evidence e WHERE e.relationship_id = relationships.id)",
            [now_ms() as i64],
        )
        .map_err(|error| format!("无法标记失效人物关系：{error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("无法提交来源失效：{error}"))?;
    Ok((mention_count + evidence_count) as usize)
}

#[tauri::command]
pub fn upsert_character_relationships(
    relationships: Vec<RelationshipInput>,
    evidence: Vec<RelationshipEvidenceInput>,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<usize, String> {
    if relationships.is_empty() || relationships.len() > 100_000 || evidence.len() > 200_000 {
        return Err("人物关系批次或证据数量超过限制".into());
    }
    let mut connection = open_project_for_commands(&state, &legacy)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("无法创建人物关系事务：{error}"))?;
    for relationship in &relationships {
        validate_graph_id(&relationship.id, "人物关系 ID")?;
        validate_graph_id(&relationship.work_id, "作品 ID")?;
        validate_graph_id(&relationship.source_character_id, "关系源人物 ID")?;
        validate_graph_id(&relationship.target_character_id, "关系目标人物 ID")?;
        validate_graph_text(&relationship.relation_type, "关系类型", 80)?;
        if relationship.source_character_id == relationship.target_character_id {
            return Err("人物关系不能连接人物自身".into());
        }
        let confidence = relationship.confidence.as_deref().unwrap_or("medium");
        let status = relationship.status.as_deref().unwrap_or("proposed");
        validate_graph_state(confidence, status)?;
        let (source, target) = if relationship.directed
            || relationship.source_character_id < relationship.target_character_id
        {
            (
                &relationship.source_character_id,
                &relationship.target_character_id,
            )
        } else {
            (
                &relationship.target_character_id,
                &relationship.source_character_id,
            )
        };
        transaction.execute(
            "INSERT INTO relationships(id, work_id, source_character_id, target_character_id, relation_type, directed, confidence, status, first_seen_at, last_seen_at, created_at, updated_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
             ON CONFLICT(work_id, source_character_id, target_character_id, relation_type, directed) DO UPDATE SET
               confidence=excluded.confidence, status=excluded.status, first_seen_at=excluded.first_seen_at,
               last_seen_at=excluded.last_seen_at, updated_at=excluded.updated_at",
            params![relationship.id, relationship.work_id, source, target, relationship.relation_type.trim(), relationship.directed as i64, confidence, status, relationship.first_seen_at.map(|value| value as i64), relationship.last_seen_at.map(|value| value as i64), now_ms() as i64],
        ).map_err(|error| format!("无法保存人物关系：{error}"))?;
    }
    for item in &evidence {
        validate_graph_id(&item.id, "关系证据 ID")?;
        validate_graph_id(&item.relationship_id, "人物关系 ID")?;
        validate_graph_text(&item.source_id, "来源 ID", 500)?;
        if item.start_char >= item.end_char
            || item.line_start == 0
            || item.line_end < item.line_start
        {
            return Err("关系证据位置无效".into());
        }
        transaction.execute(
            "INSERT INTO relationship_evidence(id, relationship_id, source_id, chapter_id, scene_id, start_char, end_char, line_start, line_end, quote, source_fingerprint)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET relationship_id=excluded.relationship_id, source_id=excluded.source_id,
               chapter_id=excluded.chapter_id, scene_id=excluded.scene_id, start_char=excluded.start_char, end_char=excluded.end_char,
               line_start=excluded.line_start, line_end=excluded.line_end, quote=excluded.quote, source_fingerprint=excluded.source_fingerprint",
            params![item.id, item.relationship_id, item.source_id, item.chapter_id, item.scene_id, item.start_char as i64, item.end_char as i64, item.line_start as i64, item.line_end as i64, item.quote, item.source_fingerprint],
        ).map_err(|error| format!("无法保存关系证据：{error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("无法提交人物关系：{error}"))?;
    Ok(relationships.len())
}

fn graph_nodes_and_edges(
    connection: &Connection,
    work_id: &str,
) -> Result<(Vec<String>, Vec<(String, String)>), String> {
    let mut nodes_statement = connection
        .prepare("SELECT id FROM characters WHERE work_id = ?1 AND status = 'confirmed'")
        .map_err(|error| format!("无法读取人物节点：{error}"))?;
    let nodes = nodes_statement
        .query_map([work_id], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取人物节点：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取人物节点：{error}"))?;
    let mut edges_statement = connection
        .prepare(
            "SELECT r.source_character_id, r.target_character_id
             FROM relationships r
             JOIN characters source ON source.id = r.source_character_id AND source.status = 'confirmed'
             JOIN characters target ON target.id = r.target_character_id AND target.status = 'confirmed'
             WHERE r.work_id = ?1 AND r.status = 'confirmed'",
        )
        .map_err(|error| format!("无法读取人物关系：{error}"))?;
    let edges = edges_statement
        .query_map([work_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|error| format!("无法读取人物关系：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取人物关系：{error}"))?;
    Ok((nodes, edges))
}

#[tauri::command]
pub fn character_graph_stats(
    work_id: String,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<crate::character_graph::CharacterGraphStats, String> {
    validate_graph_id(&work_id, "作品 ID")?;
    let connection = open_project_for_commands(&state, &legacy)?;
    let (nodes, edges) = graph_nodes_and_edges(&connection, &work_id)?;
    Ok(crate::character_graph::summarize(nodes, edges))
}

#[tauri::command]
pub fn list_character_neighbors(
    work_id: String,
    character_id: String,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<Vec<CharacterNeighbor>, String> {
    validate_graph_id(&work_id, "作品 ID")?;
    validate_graph_id(&character_id, "人物 ID")?;
    let connection = open_project_for_commands(&state, &legacy)?;
    let mut statement = connection
        .prepare(
            "SELECT r.id,
                    CASE WHEN r.source_character_id = ?2 THEN r.target_character_id ELSE r.source_character_id END,
                    r.relation_type, r.directed, r.confidence, r.status
             FROM relationships r
             WHERE r.work_id = ?1 AND r.status = 'confirmed'
               AND (r.source_character_id = ?2 OR r.target_character_id = ?2)
             ORDER BY r.relation_type, 2",
        )
        .map_err(|error| format!("无法读取人物邻居：{error}"))?;
    statement
        .query_map(params![work_id, character_id], |row| {
            Ok(CharacterNeighbor {
                relationship_id: row.get(0)?,
                character_id: row.get(1)?,
                relation_type: row.get(2)?,
                directed: row.get::<_, i64>(3)? != 0,
                confidence: row.get(4)?,
                status: row.get(5)?,
            })
        })
        .map_err(|error| format!("无法读取人物邻居：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取人物邻居：{error}"))
}

#[tauri::command]
pub fn character_graph_benchmark(
    work_id: String,
    iterations: usize,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<crate::character_graph::CharacterGraphBenchmark, String> {
    validate_graph_id(&work_id, "作品 ID")?;
    let connection = open_project_for_commands(&state, &legacy)?;
    let started = Instant::now();
    let (nodes, edges) = graph_nodes_and_edges(&connection, &work_id)?;
    let load_micros = started.elapsed().as_micros() as u64;
    let mut benchmark = crate::character_graph::benchmark(nodes, edges, iterations);
    benchmark.load_micros = load_micros;
    Ok(benchmark)
}

#[tauri::command]
pub fn character_graph_path(
    work_id: String,
    source_character_id: String,
    target_character_id: String,
    max_hops: usize,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<Option<Vec<String>>, String> {
    validate_graph_id(&work_id, "作品 ID")?;
    validate_graph_id(&source_character_id, "关系源人物 ID")?;
    validate_graph_id(&target_character_id, "关系目标人物 ID")?;
    let connection = open_project_for_commands(&state, &legacy)?;
    let (_, edges) = graph_nodes_and_edges(&connection, &work_id)?;
    Ok(crate::character_graph::shortest_path(
        &source_character_id,
        &target_character_id,
        max_hops.clamp(1, 8),
        edges,
    ))
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
        "SELECT id, role, content, created_at, completed_at, activity_log FROM messages WHERE conversation_id = ?1 ORDER BY created_at, rowid"
    ).map_err(|error| format!("无法读取消息：{error}"))?;
    let rows = statement
        .query_map([&id], |row| {
            Ok(StoredMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get::<_, i64>(3)? as u64,
                completed_at: row.get::<_, Option<i64>>(4)?.map(|value| value as u64),
                activity_log: row
                    .get::<_, Option<String>>(5)?
                    .and_then(|value| serde_json::from_str(&value).ok()),
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
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = ?4",
            params![
                conversation_id,
                title,
                message.created_at as i64,
                message.completed_at.unwrap_or(message.created_at) as i64,
            ],
        )
        .map_err(|error| format!("无法保存会话：{error}"))?;
    transaction.execute(
        "INSERT OR REPLACE INTO messages(id, conversation_id, role, content, created_at, completed_at, activity_log) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![message.id, conversation_id, message.role, message.content, message.created_at as i64, message.completed_at.map(|value| value as i64), message.activity_log.map(|value| value.to_string())],
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

#[tauri::command]
pub fn list_project_memory(
    status: Option<String>,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<Vec<ProjectMemoryItem>, String> {
    let connection = open_project_for_commands(&state, &legacy)?;
    let status = status.unwrap_or_else(|| "confirmed".to_string());
    if !matches!(
        status.as_str(),
        "proposed" | "confirmed" | "rejected" | "all"
    ) {
        return Err("项目记忆状态无效".into());
    }
    let mut statement = if status == "all" {
        connection
            .prepare("SELECT id, kind, title, content, source_paths, confidence, status, created_at, updated_at FROM project_memory ORDER BY updated_at DESC")
            .map_err(|error| format!("无法读取项目记忆：{error}"))?
    } else {
        connection
            .prepare("SELECT id, kind, title, content, source_paths, confidence, status, created_at, updated_at FROM project_memory WHERE status = ?1 ORDER BY updated_at DESC")
            .map_err(|error| format!("无法读取项目记忆：{error}"))?
    };
    let rows = if status == "all" {
        statement.query_map([], memory_from_row)
    } else {
        statement.query_map([status], memory_from_row)
    }
    .map_err(|error| format!("无法读取项目记忆：{error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取项目记忆：{error}"))
}

#[tauri::command]
pub fn search_project_memory(
    query: String,
    max_results: usize,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
) -> Result<Vec<ProjectMemoryItem>, String> {
    let connection = open_project_for_commands(&state, &legacy)?;
    let query = query.trim();
    let limit = max_results.clamp(1, 100);
    let pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let mut statement = connection
        .prepare("SELECT id, kind, title, content, source_paths, confidence, status, created_at, updated_at FROM project_memory WHERE status = 'confirmed' AND (?1 = '%%' OR title LIKE ?1 ESCAPE '\\' OR content LIKE ?1 ESCAPE '\\') ORDER BY updated_at DESC LIMIT ?2")
        .map_err(|error| format!("无法搜索项目记忆：{error}"))?;
    let rows = statement
        .query_map(
            params![
                if query.is_empty() {
                    "%%".to_string()
                } else {
                    pattern
                },
                limit as i64
            ],
            memory_from_row,
        )
        .map_err(|error| format!("无法搜索项目记忆：{error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法搜索项目记忆：{error}"))
}

#[tauri::command]
pub fn propose_project_memory(
    candidates: Vec<ProjectMemoryCandidate>,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<Vec<ProjectMemoryItem>, String> {
    if candidates.is_empty() || candidates.len() > 20 {
        return Err("项目记忆提案数量必须在 1 到 20 条之间".into());
    }
    for candidate in &candidates {
        validate_memory_candidate(candidate)?;
    }
    let mut connection = open_project_for_commands(&state, &legacy)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("无法创建项目记忆提案：{error}"))?;
    let timestamp = now_ms();
    for candidate in &candidates {
        let sources = serde_json::to_string(&candidate.source_paths)
            .map_err(|error| format!("项目记忆来源无效：{error}"))?;
        transaction
            .execute(
                "INSERT INTO project_memory(id, kind, title, content, source_paths, confidence, status, created_at, updated_at) VALUES(?1, ?2, ?3, ?4, ?5, ?6, 'proposed', ?7, ?7) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, content=excluded.content, source_paths=excluded.source_paths, confidence=excluded.confidence, status='proposed', updated_at=excluded.updated_at",
                params![candidate.id, candidate.kind, candidate.title.trim(), candidate.content.trim(), sources, candidate.confidence.as_deref().unwrap_or("medium"), timestamp as i64],
            )
            .map_err(|error| format!("无法保存项目记忆提案：{error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("无法提交项目记忆提案：{error}"))?;
    runtime.info(
        "project_memory.proposed",
        serde_json::json!({ "count": candidates.len() })
            .as_object()
            .cloned()
            .unwrap_or_default(),
    );
    list_project_memory(Some("proposed".to_string()), state, legacy)
}

fn update_project_memory_status(
    ids: Vec<String>,
    status: &str,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<Vec<ProjectMemoryItem>, String> {
    if ids.is_empty() || ids.len() > 100 || !matches!(status, "confirmed" | "rejected") {
        return Err("项目记忆状态更新请求无效".into());
    }
    for id in &ids {
        validate_memory_id(id)?;
    }
    let mut connection = open_project_for_commands(&state, &legacy)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("无法更新项目记忆：{error}"))?;
    for id in &ids {
        transaction
            .execute("UPDATE project_memory SET status = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'proposed'", params![status, now_ms() as i64, id])
            .map_err(|error| format!("无法更新项目记忆：{error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("无法提交项目记忆状态：{error}"))?;
    runtime.info(
        if status == "confirmed" {
            "project_memory.confirmed"
        } else {
            "project_memory.rejected"
        },
        serde_json::json!({ "count": ids.len() })
            .as_object()
            .cloned()
            .unwrap_or_default(),
    );
    list_project_memory(Some(status.to_string()), state, legacy)
}

#[tauri::command]
pub fn confirm_project_memory(
    ids: Vec<String>,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<Vec<ProjectMemoryItem>, String> {
    update_project_memory_status(ids, "confirmed", state, legacy, runtime)
}

#[tauri::command]
pub fn reject_project_memory(
    ids: Vec<String>,
    state: State<'_, crate::WorkspaceState>,
    legacy: State<'_, DatabaseState>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<Vec<ProjectMemoryItem>, String> {
    update_project_memory_status(ids, "rejected", state, legacy, runtime)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate() -> ProjectMemoryCandidate {
        ProjectMemoryCandidate {
            id: "memory-test".into(),
            kind: "summary".into(),
            title: "项目摘要".into(),
            content: "林晚回到雾港寻找父亲留下的信。".into(),
            source_paths: vec!["章节/第一章.md".into()],
            confidence: Some("medium".into()),
        }
    }

    #[test]
    fn validates_memory_candidate_contract() {
        assert!(validate_memory_candidate(&candidate()).is_ok());
        let mut invalid = candidate();
        invalid.kind = "unknown".into();
        assert!(validate_memory_candidate(&invalid).is_err());
    }

    #[test]
    fn rejects_oversized_memory_content() {
        let mut value = candidate();
        value.content = "x".repeat(20_001);
        assert!(validate_memory_candidate(&value).is_err());
    }

    #[test]
    fn initializes_character_schema_and_search_index() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("graph.sqlite3");
        init(&path).expect("database schema");
        let connection = Connection::open(path).expect("database connection");
        connection
            .execute(
                "INSERT INTO characters(id, work_id, canonical_name, description, confidence, status, created_at, updated_at)
                 VALUES('c1', 'work', 'Lin Wan', 'editor', 'high', 'confirmed', 1, 1)",
                [],
            )
            .expect("character");
        connection
            .execute(
                "INSERT INTO character_aliases(character_id, alias) VALUES('c1', 'LW')",
                [],
            )
            .expect("alias");
        refresh_character_search(&connection, "work").expect("search index");
        let indexed: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM character_search WHERE character_search MATCH 'Lin*'",
                [],
                |row| row.get(0),
            )
            .expect("fts query");
        assert_eq!(indexed, 1);
    }
}
