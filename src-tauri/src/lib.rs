use rusqlite::Connection;
use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    io::Write,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

#[derive(Default)]
struct WorkspaceState(Mutex<Option<Workspace>>);

#[derive(Clone)]
struct Workspace {
    id: String,
    name: String,
    root: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSnapshot {
    id: String,
    name: String,
    path_label: String,
    entries: Vec<WorkspaceEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceEntry {
    name: String,
    path: String,
    kind: &'static str,
    children: Vec<WorkspaceEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentSnapshot {
    path: String,
    name: String,
    content: String,
    kind: &'static str,
    modified_ms: u64,
    line_ending: &'static str,
    has_bom: bool,
}

fn lock_workspace(state: &State<'_, WorkspaceState>) -> Result<Workspace, String> {
    state
        .0
        .lock()
        .map_err(|_| "工作区状态不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先选择工作目录".to_string())
}

fn validate_relative(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("路径不能为空".into());
    }
    let value = Path::new(path);
    if value.is_absolute() {
        return Err("只允许工作区内的相对路径".into());
    }
    let mut clean = PathBuf::new();
    for component in value.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            _ => return Err("路径包含不允许的片段".into()),
        }
    }
    Ok(clean)
}

fn ensure_document_extension(path: &Path) -> Result<&'static str, String> {
    match path.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("md") | Some("markdown") => Ok("markdown"),
        Some("txt") => Ok("text"),
        _ => Err("首版仅支持 Markdown 和 TXT 文档".into()),
    }
}

fn resolve_existing(workspace: &Workspace, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let clean = validate_relative(relative)?;
    let target = workspace.root.join(&clean);
    let canonical = target.canonicalize().map_err(|error| format!("无法访问路径：{error}"))?;
    if !canonical.starts_with(&workspace.root) {
        return Err("路径超出已授权工作区".into());
    }
    Ok((clean, canonical))
}

fn resolve_for_create(workspace: &Workspace, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let clean = validate_relative(relative)?;
    let target = workspace.root.join(&clean);
    let mut existing = target.parent().ok_or_else(|| "无效路径".to_string())?;
    while !existing.exists() {
        existing = existing.parent().ok_or_else(|| "无效路径".to_string())?;
    }
    let canonical_parent = existing.canonicalize().map_err(|error| format!("无法检查路径：{error}"))?;
    if !canonical_parent.starts_with(&workspace.root) {
        return Err("路径超出已授权工作区".into());
    }
    Ok((clean, target))
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn relative_label(path: &Path) -> String {
    path.components().map(|part| part.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/")
}

fn list_entries(root: &Path, directory: &Path) -> Result<Vec<WorkspaceEntry>, String> {
    let mut entries = Vec::new();
    for item in fs::read_dir(directory).map_err(|error| format!("无法读取工作区：{error}"))? {
        let item = item.map_err(|error| format!("无法读取目录项：{error}"))?;
        let file_type = item.file_type().map_err(|error| format!("无法识别目录项：{error}"))?;
        if file_type.is_symlink() {
            continue;
        }
        let path = item.path();
        let relative = path.strip_prefix(root).map_err(|_| "目录越界".to_string())?;
        let name = item.file_name().to_string_lossy().into_owned();
        if file_type.is_dir() {
            entries.push(WorkspaceEntry {
                name,
                path: relative_label(relative),
                kind: "directory",
                children: list_entries(root, &path)?,
            });
        } else if file_type.is_file() && ensure_document_extension(&path).is_ok() {
            entries.push(WorkspaceEntry {
                name,
                path: relative_label(relative),
                kind: "file",
                children: Vec::new(),
            });
        }
    }
    entries.sort_by(|left, right| {
        (left.kind != "directory", left.name.to_lowercase())
            .cmp(&(right.kind != "directory", right.name.to_lowercase()))
    });
    Ok(entries)
}

fn workspace_snapshot(workspace: &Workspace) -> Result<WorkspaceSnapshot, String> {
    Ok(WorkspaceSnapshot {
        id: workspace.id.clone(),
        name: workspace.name.clone(),
        path_label: workspace.root.to_string_lossy().into_owned(),
        entries: list_entries(&workspace.root, &workspace.root)?,
    })
}

fn read_document_at(workspace: &Workspace, relative: &str) -> Result<DocumentSnapshot, String> {
    let (clean, target) = resolve_existing(workspace, relative)?;
    let kind = ensure_document_extension(&target)?;
    if !target.is_file() {
        return Err("目标不是文档".into());
    }
    let bytes = fs::read(&target).map_err(|error| format!("无法读取文档：{error}"))?;
    let has_bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    let body = if has_bom { &bytes[3..] } else { &bytes };
    let raw = String::from_utf8(body.to_vec()).map_err(|_| "文档不是有效的 UTF-8 文本".to_string())?;
    let line_ending = if raw.contains("\r\n") { "crlf" } else { "lf" };
    let content = raw.replace("\r\n", "\n").replace('\r', "\n");
    let metadata = fs::metadata(&target).map_err(|error| format!("无法读取文档信息：{error}"))?;
    Ok(DocumentSnapshot {
        path: relative_label(&clean),
        name: clean.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        content,
        kind,
        modified_ms: modified_ms(&metadata),
        line_ending,
        has_bom,
    })
}

#[tauri::command]
fn authorize_workspace(root: String, state: State<'_, WorkspaceState>) -> Result<WorkspaceSnapshot, String> {
    let canonical = PathBuf::from(root).canonicalize().map_err(|error| format!("无法打开目录：{error}"))?;
    if !canonical.is_dir() {
        return Err("选择的路径不是目录".into());
    }
    let mut hasher = DefaultHasher::new();
    canonical.hash(&mut hasher);
    let workspace = Workspace {
        id: format!("{:016x}", hasher.finish()),
        name: canonical.file_name().unwrap_or(canonical.as_os_str()).to_string_lossy().into_owned(),
        root: canonical,
    };
    let snapshot = workspace_snapshot(&workspace)?;
    *state.0.lock().map_err(|_| "工作区状态不可用".to_string())? = Some(workspace);
    Ok(snapshot)
}

#[tauri::command]
fn get_workspace(state: State<'_, WorkspaceState>) -> Result<WorkspaceSnapshot, String> {
    workspace_snapshot(&lock_workspace(&state)?)
}

#[tauri::command]
fn read_document(path: String, state: State<'_, WorkspaceState>) -> Result<DocumentSnapshot, String> {
    read_document_at(&lock_workspace(&state)?, &path)
}

#[tauri::command]
fn save_document(
    path: String,
    content: String,
    expected_modified_ms: u64,
    line_ending: String,
    has_bom: bool,
    state: State<'_, WorkspaceState>,
) -> Result<DocumentSnapshot, String> {
    let workspace = lock_workspace(&state)?;
    let (_, target) = resolve_existing(&workspace, &path)?;
    ensure_document_extension(&target)?;
    let current = fs::metadata(&target).map_err(|error| format!("无法检查文档：{error}"))?;
    if modified_ms(&current) != expected_modified_ms {
        return Err("文档已被其他程序修改，请重新加载后再保存".into());
    }
    if line_ending != "lf" && line_ending != "crlf" {
        return Err("不支持的换行格式".into());
    }
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let encoded = if line_ending == "crlf" { normalized.replace('\n', "\r\n") } else { normalized };
    let parent = target.parent().ok_or_else(|| "无效文档路径".to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|error| format!("无法创建临时文件：{error}"))?;
    if has_bom {
        temporary.write_all(&[0xef, 0xbb, 0xbf]).map_err(|error| format!("无法写入文档：{error}"))?;
    }
    temporary.write_all(encoded.as_bytes()).map_err(|error| format!("无法写入文档：{error}"))?;
    temporary.as_file().sync_all().map_err(|error| format!("无法同步文档：{error}"))?;
    temporary.persist(&target).map_err(|error| format!("无法替换文档：{}", error.error))?;
    read_document_at(&workspace, &path)
}

#[tauri::command]
fn create_document(path: String, state: State<'_, WorkspaceState>) -> Result<DocumentSnapshot, String> {
    let workspace = lock_workspace(&state)?;
    let (_, target) = resolve_for_create(&workspace, &path)?;
    ensure_document_extension(&target)?;
    if target.exists() {
        return Err("同名文件已存在".into());
    }
    let parent = target.parent().ok_or_else(|| "无效文档路径".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建上级目录：{error}"))?;
    fs::OpenOptions::new().write(true).create_new(true).open(&target)
        .map_err(|error| format!("无法创建文档：{error}"))?;
    read_document_at(&workspace, &path)
}

#[tauri::command]
fn create_directory(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let workspace = lock_workspace(&state)?;
    let (_, target) = resolve_for_create(&workspace, &path)?;
    if target.exists() {
        return Err("同名路径已存在".into());
    }
    fs::create_dir_all(target).map_err(|error| format!("无法创建文件夹：{error}"))
}

fn init_database(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let connection = Connection::open(path)?;
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
         CREATE INDEX IF NOT EXISTS messages_conversation_id ON messages(conversation_id, created_at);"
    )?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WorkspaceState::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            init_database(&data_dir.join("vinkey.sqlite3"))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            authorize_workspace,
            get_workspace,
            read_document,
            save_document,
            create_document,
            create_directory,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Vinkey");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_absolute_and_parent_paths() {
        assert!(validate_relative("../secret.md").is_err());
        assert!(validate_relative("notes/../../secret.md").is_err());
        assert!(validate_relative("/tmp/secret.md").is_err());
    }

    #[test]
    fn accepts_supported_relative_documents() {
        assert_eq!(ensure_document_extension(Path::new("chapters/one.MD")).unwrap(), "markdown");
        assert_eq!(ensure_document_extension(Path::new("notes.txt")).unwrap(), "text");
        assert!(ensure_document_extension(Path::new("image.png")).is_err());
    }
}
