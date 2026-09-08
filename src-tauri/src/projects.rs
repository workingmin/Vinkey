use crate::{
    database::{self, DatabaseState},
    Workspace,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    id: String,
    name: String,
    path_label: String,
}

fn open(db: &DatabaseState) -> Result<Connection, String> {
    let connection = database::open_state(db)?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    Ok(connection)
}

pub fn init(db: &DatabaseState, previous: Option<Workspace>) -> Result<(), String> {
    let mut connection = open(db)?;
    connection.execute_batch("CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, root TEXT NOT NULL UNIQUE, name TEXT NOT NULL, opened_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_selection (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), active_id TEXT);")
        .map_err(|e| e.to_string())?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let initialized: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM project_selection)",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !initialized {
        if let Some(workspace) = previous {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO projects VALUES (?1, ?2, ?3, ?4)",
                    params![
                        workspace.id,
                        workspace.root.to_string_lossy(),
                        workspace.name,
                        now_ms()
                    ],
                )
                .map_err(|e| e.to_string())?;
            transaction
                .execute(
                    "INSERT INTO project_selection VALUES (1, ?1)",
                    [workspace.id],
                )
                .map_err(|e| e.to_string())?;
        } else {
            transaction
                .execute("INSERT INTO project_selection VALUES (1, NULL)", [])
                .map_err(|e| e.to_string())?;
        }
    }
    transaction.commit().map_err(|e| e.to_string())
}

pub fn register(db: &DatabaseState, workspace: &Workspace) -> Result<(), String> {
    let mut connection = open(db)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    transaction
        .execute(
            "INSERT INTO projects VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, opened_at=excluded.opened_at",
            params![
                workspace.id,
                workspace.root.to_string_lossy(),
                workspace.name,
                now_ms()
            ],
        )
        .map_err(|e| e.to_string())?;
    transaction
        .execute(
            "UPDATE project_selection SET active_id = ?1 WHERE singleton = 1",
            [&workspace.id],
        )
        .map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())
}

pub fn resolve(db: &DatabaseState, id: &str) -> Result<Workspace, String> {
    open(db)?
        .query_row(
            "SELECT id, name, root FROM projects WHERE id = ?1",
            [id],
            |row| {
                Ok(Workspace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    root: PathBuf::from(row.get::<_, String>(2)?),
                })
            },
        )
        .map_err(|_| "项目记录不存在，请刷新项目列表".into())
}

pub fn active(db: &DatabaseState) -> Option<Workspace> {
    let id: Option<String> = open(db)
        .ok()?
        .query_row(
            "SELECT active_id FROM project_selection WHERE singleton = 1",
            [],
            |r| r.get(0),
        )
        .ok()?;
    resolve(db, &id?).ok()
}

#[tauri::command]
pub fn list_projects(db: State<'_, DatabaseState>) -> Result<Vec<ProjectSummary>, String> {
    let connection = open(&db)?;
    let mut statement = connection
        .prepare("SELECT id, name, root FROM projects ORDER BY opened_at DESC, id")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(ProjectSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                path_label: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn activate_project(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, crate::WorkspaceState>,
    runtime: State<'_, crate::runtime_log::RuntimeLogState>,
    db: State<'_, DatabaseState>,
) -> Result<crate::WorkspaceSnapshot, String> {
    let workspace = resolve(&db, &id)?;
    crate::authorize_workspace(
        workspace.root.to_string_lossy().into_owned(),
        app,
        state,
        runtime,
    )
}

#[tauri::command]
pub fn delete_project(
    id: String,
    confirmation: String,
    db: State<'_, DatabaseState>,
    state: State<'_, crate::WorkspaceState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|_| "工作区状态不可用")?;
    crate::ensure_workspace_idle(&app)?;
    delete_record(&db, &id, &confirmation)?;
    if current.as_ref().is_some_and(|w| w.id == id) {
        *current = None;
    }
    Ok(())
}

fn delete_record(db: &DatabaseState, id: &str, confirmation: &str) -> Result<(), String> {
    let workspace = resolve(db, id)?;
    if confirmation != workspace.name {
        return Err("项目名称不匹配".into());
    }
    // Initialize only the application-owned database. Deletion never imports or touches project files.
    database::open_managed_conversations(db, &workspace, false)?;
    let mut connection = open(db)?;
    connection
        .execute(
            "ATTACH DATABASE ?1 AS project_records",
            [database::managed_conversation_path(db, id)
                .to_string_lossy()
                .as_ref()],
        )
        .map_err(|e| e.to_string())?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let stored_name: Option<String> = transaction
        .query_row("SELECT name FROM projects WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|e| e.to_string())?;
    if stored_name.as_deref() != Some(confirmation) {
        return Err("项目记录已变化，请重新确认".into());
    }
    transaction
        .execute("DELETE FROM project_records.messages", [])
        .map_err(|e| e.to_string())?;
    transaction
        .execute("DELETE FROM project_records.conversations", [])
        .map_err(|e| e.to_string())?;
    transaction
        .execute("DELETE FROM projects WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    transaction
        .execute(
            "UPDATE project_selection SET active_id = NULL WHERE active_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::BTreeMap, fs, path::Path};

    fn files(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
        let mut result = BTreeMap::new();
        for entry in fs::read_dir(root).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                result.extend(files(&path));
            } else {
                result.insert(path.clone(), fs::read(path).unwrap());
            }
        }
        result
    }

    #[test]
    fn project_deletion_only_removes_application_records_and_never_reimports_history() {
        let directory = tempfile::tempdir().unwrap();
        let db = DatabaseState(directory.path().join("app.sqlite3"));
        database::init(&db.0).unwrap();
        init(&db, None).unwrap();
        let project = Workspace {
            id: "a".into(),
            name: "Project A".into(),
            root: directory.path().join("project"),
        };
        fs::create_dir_all(project.root.join(".vinkey")).unwrap();
        fs::write(project.root.join("chapter.md"), b"original content").unwrap();
        let old = project.root.join(".vinkey/conversations.sqlite3");
        database::init(&old).unwrap();
        {
            let connection = Connection::open(&old).unwrap();
            connection.execute_batch("PRAGMA journal_mode=DELETE;
                INSERT INTO conversations VALUES ('c', 'Old conversation', 1, 2);
                INSERT INTO messages (id, conversation_id, role, content, created_at, completed_at) VALUES ('m', 'c', 'assistant', 'Preserved', 1, 2);").unwrap();
        }
        let before = files(&project.root);
        register(&db, &project).unwrap();
        let records = database::open_managed_conversations(&db, &project, true).unwrap();
        assert_eq!(
            records
                .query_row("SELECT content FROM messages", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "Preserved"
        );
        drop(records);
        assert_eq!(files(&project.root), before);
        assert!(delete_record(&db, "a", "wrong name").is_err());
        assert!(resolve(&db, "a").is_ok());
        delete_record(&db, "a", "Project A").unwrap();
        assert!(resolve(&db, "a").is_err());
        assert!(active(&db).is_none());
        assert_eq!(files(&project.root), before);
        init(&db, Some(project.clone())).unwrap();
        assert!(active(&db).is_none());
        register(&db, &project).unwrap();
        let records = database::open_managed_conversations(&db, &project, true).unwrap();
        assert_eq!(
            records
                .query_row("SELECT COUNT(*) FROM conversations", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            records
                .query_row("SELECT COUNT(*) FROM messages", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(files(&project.root), before);
    }

    #[test]
    fn missing_directory_can_be_removed_without_affecting_another_project() {
        let directory = tempfile::tempdir().unwrap();
        let db = DatabaseState(directory.path().join("app.sqlite3"));
        database::init(&db.0).unwrap();
        init(&db, None).unwrap();
        let first = Workspace {
            id: "a".into(),
            name: "Missing".into(),
            root: directory.path().join("missing"),
        };
        let second = Workspace {
            id: "b".into(),
            name: "Other".into(),
            root: directory.path().join("other"),
        };
        register(&db, &first).unwrap();
        register(&db, &first).unwrap();
        register(&db, &second).unwrap();
        let records = database::open_managed_conversations(&db, &second, false).unwrap();
        records
            .execute(
                "INSERT INTO conversations VALUES ('c', 'Other session', 1, 1)",
                [],
            )
            .unwrap();
        delete_record(&db, "a", "Missing").unwrap();
        assert!(!first.root.exists());
        assert!(!second.root.exists());
        assert_eq!(active(&db).unwrap().id, "b");
        assert_eq!(
            open(&db)
                .unwrap()
                .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            records
                .query_row("SELECT COUNT(*) FROM conversations", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
