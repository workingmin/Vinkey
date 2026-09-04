use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    io::Write,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};

mod character_graph;
mod database;
mod long_text;
mod models;
mod runtime_log;
mod search;

#[derive(Default)]
pub(crate) struct WorkspaceState(Mutex<Option<Workspace>>);

#[derive(Clone)]
pub(crate) struct Workspace {
    id: String,
    name: String,
    pub(crate) root: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSnapshot {
    id: String,
    name: String,
    path_label: String,
    entries: Vec<WorkspaceEntry>,
}

#[derive(Deserialize, Serialize)]
struct WorkspacePreference {
    root: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceEntry {
    name: String,
    path: String,
    kind: &'static str,
    children: Vec<WorkspaceEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    document_kind: Option<&'static str>,
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
    mime_type: Option<String>,
    size_bytes: u64,
}

pub(crate) fn lock_workspace(state: &State<'_, WorkspaceState>) -> Result<Workspace, String> {
    state
        .0
        .lock()
        .map_err(|_| "工作区状态不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先选择工作目录".to_string())
}

fn log_fields(values: impl IntoIterator<Item = (&'static str, Value)>) -> Map<String, Value> {
    values
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect()
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

pub(crate) fn ensure_document_extension(path: &Path) -> Result<&'static str, String> {
    let kind = classify_file(path);
    if matches!(kind, "image" | "pdf" | "audio" | "video" | "binary") {
        return Err("该文件是预览或二进制文件，不能作为文本编辑文档".into());
    }
    Ok(kind)
}

fn classify_file(path: &Path) -> &'static str {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if name == ".env" || name.starts_with(".env.") {
        return "code";
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "md" | "markdown" | "mdx" => "markdown",
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "ico" | "bmp" | "avif" | "apng"
        | "tiff" | "tif" => "image",
        "pdf" => "pdf",
        "mp4" | "webm" | "ogv" | "mov" | "m4v" => "video",
        "mp3" | "wav" | "m4a" | "aac" | "flac" | "opus" | "oga" | "ogg" | "weba" => "audio",
        "zip" | "tar" | "gz" | "rar" | "7z" | "bz2" | "xz" | "exe" | "dll" | "so" | "dylib"
        | "app" | "dmg" | "msi" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt"
        | "ods" | "odp" | "ttf" | "otf" | "woff" | "woff2" | "eot" | "db" | "sqlite"
        | "sqlite3" | "bin" | "dat" | "iso" | "img" | "class" | "jar" | "war" | "pyc" | "pyo" => {
            "binary"
        }
        "js" | "jsx" | "mjs" | "cjs" | "ts" | "tsx" | "mts" | "cts" | "py" | "pyw" | "pyi"
        | "html" | "htm" | "css" | "scss" | "sass" | "less" | "json" | "jsonc" | "json5"
        | "xml" | "yaml" | "yml" | "toml" | "ini" | "cfg" | "conf" | "go" | "rs" | "rb" | "erb"
        | "php" | "java" | "kt" | "kts" | "c" | "h" | "cc" | "cpp" | "hpp" | "cs" | "swift"
        | "lua" | "r" | "sql" | "graphql" | "gql" | "proto" | "sh" | "bash" | "zsh" | "fish"
        | "ps1" | "bat" | "cmd" | "log" => "code",
        _ => "text",
    }
}

fn mime_for_kind(path: &Path, kind: &str) -> Option<String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mime = match (kind, extension.as_str()) {
        ("image", "svg") => "image/svg+xml",
        ("image", "jpg") | ("image", "jpeg") => "image/jpeg",
        ("image", "png") => "image/png",
        ("image", "gif") => "image/gif",
        ("image", "webp") => "image/webp",
        ("image", "ico") => "image/x-icon",
        ("image", "bmp") => "image/bmp",
        ("image", "avif") => "image/avif",
        ("image", "apng") => "image/apng",
        ("image", "tif") | ("image", "tiff") => "image/tiff",
        ("pdf", _) => "application/pdf",
        ("video", "mp4") => "video/mp4",
        ("video", "webm") => "video/webm",
        ("video", "ogv") => "video/ogg",
        ("video", "mov") => "video/quicktime",
        ("video", "m4v") => "video/x-m4v",
        ("audio", "mp3") => "audio/mpeg",
        ("audio", "wav") => "audio/wav",
        ("audio", "m4a") => "audio/mp4",
        ("audio", "aac") => "audio/aac",
        ("audio", "flac") => "audio/flac",
        ("audio", "opus") => "audio/opus",
        ("audio", "oga") | ("audio", "ogg") => "audio/ogg",
        ("audio", "weba") => "audio/webm",
        _ => return None,
    };
    Some(mime.to_string())
}

fn resolve_existing(workspace: &Workspace, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let clean = validate_relative(relative)?;
    let target = workspace.root.join(&clean);
    let canonical = target
        .canonicalize()
        .map_err(|error| format!("无法访问路径：{error}"))?;
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
    let canonical_parent = existing
        .canonicalize()
        .map_err(|error| format!("无法检查路径：{error}"))?;
    if !canonical_parent.starts_with(&workspace.root) {
        return Err("路径超出已授权工作区".into());
    }
    Ok((clean, target))
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub(crate) fn relative_label(path: &Path) -> String {
    path.components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn list_entries(root: &Path, directory: &Path) -> Result<Vec<WorkspaceEntry>, String> {
    let mut entries = Vec::new();
    for item in fs::read_dir(directory).map_err(|error| format!("无法读取工作区：{error}"))?
    {
        let item = item.map_err(|error| format!("无法读取目录项：{error}"))?;
        let file_type = item
            .file_type()
            .map_err(|error| format!("无法识别目录项：{error}"))?;
        if file_type.is_symlink() {
            continue;
        }
        let path = item.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|_| "目录越界".to_string())?;
        let name = item.file_name().to_string_lossy().into_owned();
        if name == ".vinkey"
            || name == "node_modules"
            || name == "target"
            || name == "dist"
            || (name.starts_with('.') && !name.starts_with(".env"))
        {
            continue;
        }
        if file_type.is_dir() {
            entries.push(WorkspaceEntry {
                name,
                path: relative_label(relative),
                kind: "directory",
                children: list_entries(root, &path)?,
                document_kind: None,
            });
        } else if file_type.is_file() {
            entries.push(WorkspaceEntry {
                name,
                path: relative_label(relative),
                kind: "file",
                children: Vec::new(),
                document_kind: Some(classify_file(&path)),
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

fn workspace_from_root(canonical: PathBuf) -> Workspace {
    let mut hasher = DefaultHasher::new();
    canonical.hash(&mut hasher);
    Workspace {
        id: format!("{:016x}", hasher.finish()),
        name: canonical
            .file_name()
            .unwrap_or(canonical.as_os_str())
            .to_string_lossy()
            .into_owned(),
        root: canonical,
    }
}

fn workspace_vinkey_dir(workspace: &Workspace) -> PathBuf {
    workspace.root.join(".vinkey")
}

fn chunk_cache_dir(workspace: &Workspace) -> PathBuf {
    workspace_vinkey_dir(workspace).join("chunks")
}

pub(crate) fn analysis_jobs_dir(workspace: &Workspace) -> PathBuf {
    workspace_vinkey_dir(workspace)
        .join("analysis")
        .join("jobs")
}

fn validate_analysis_artifact_name(name: &str) -> Result<&Path, String> {
    let artifact_name = Path::new(name);
    if name.is_empty()
        || name.len() > 180
        || artifact_name.is_absolute()
        || artifact_name.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
        || !artifact_name
            .file_name()
            .map(|value| !value.is_empty())
            .unwrap_or(false)
    {
        return Err("分析产物名称无效".into());
    }
    Ok(artifact_name)
}

fn cache_manifest_is_valid(
    manifest: &long_text::ChunkManifest,
    source_id: &str,
    content: &str,
    max_tokens: usize,
    overlap_tokens: usize,
    expected_key: &str,
) -> bool {
    if manifest.source_id != source_id
        || manifest.source_fingerprint != long_text::source_fingerprint(content)
        || manifest.algorithm_version != long_text::CHUNK_ALGORITHM_VERSION
        || manifest.cache_key != expected_key
        || manifest.max_tokens != max_tokens
        || manifest.overlap_tokens != overlap_tokens
        || manifest.source_tokens != long_text::estimate_tokens(content)
    {
        return false;
    }
    let character_count = content.chars().count();
    if !content.is_empty() && manifest.chunks.is_empty() {
        return false;
    }
    manifest.chunks.iter().all(|chunk| {
        let start_byte = content
            .char_indices()
            .nth(chunk.start_char)
            .map(|(offset, _)| offset)
            .unwrap_or_else(|| content.len());
        let end_byte = content
            .char_indices()
            .nth(chunk.end_char)
            .map(|(offset, _)| offset)
            .unwrap_or_else(|| content.len());
        chunk.source_id == source_id
            && !chunk.text.is_empty()
            && chunk.start_char <= chunk.end_char
            && chunk.end_char <= character_count
            && chunk.line_start > 0
            && chunk.line_end >= chunk.line_start
            && start_byte <= end_byte
            && content.get(start_byte..end_byte) == Some(chunk.text.as_str())
            && chunk.estimated_tokens == long_text::estimate_tokens(&chunk.text)
            && chunk.estimated_tokens <= max_tokens
    })
}

fn write_atomic(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "缓存路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建中间目录：{error}"))?;
    let temp_name = format!(
        ".{}.tmp-{}",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("artifact"),
        now_millis()
    );
    let temp = parent.join(temp_name);
    let result = (|| {
        let mut file =
            fs::File::create(&temp).map_err(|error| format!("无法创建临时文件：{error}"))?;
        file.write_all(content)
            .map_err(|error| format!("无法写入临时文件：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("无法刷新临时文件：{error}"))?;
        if path.exists() {
            fs::remove_file(path).map_err(|error| format!("无法替换旧缓存：{error}"))?;
        }
        fs::rename(&temp, path).map_err(|error| format!("无法提交中间文件：{error}"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn workspace_preference_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("workspace.json"))
        .map_err(|error| error.to_string())
}

fn persist_workspace_preference(app: &AppHandle, workspace: &Workspace) -> Result<(), String> {
    let path = workspace_preference_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    }
    let content = serde_json::to_vec_pretty(&WorkspacePreference {
        root: workspace.root.to_string_lossy().into_owned(),
    })
    .map_err(|error| format!("无法保存工作区记录：{error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存工作区记录：{error}"))
}

fn restore_workspace_preference(app: &AppHandle) -> Option<Workspace> {
    let path = workspace_preference_path(app).ok()?;
    let content = fs::read(path).ok()?;
    let preference = serde_json::from_slice::<WorkspacePreference>(&content).ok()?;
    let canonical = PathBuf::from(preference.root).canonicalize().ok()?;
    canonical.is_dir().then(|| workspace_from_root(canonical))
}

fn read_document_at(workspace: &Workspace, relative: &str) -> Result<DocumentSnapshot, String> {
    let (clean, target) = resolve_existing(workspace, relative)?;
    if !target.is_file() {
        return Err("目标不是文档".into());
    }
    let mut kind = classify_file(&target);
    let bytes = fs::read(&target).map_err(|error| format!("无法读取文档：{error}"))?;
    let size_bytes = bytes.len() as u64;
    if matches!(kind, "image" | "pdf" | "audio" | "video" | "binary") {
        let metadata =
            fs::metadata(&target).map_err(|error| format!("无法读取文档信息：{error}"))?;
        return Ok(DocumentSnapshot {
            path: relative_label(&clean),
            name: clean
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            content: String::new(),
            kind,
            modified_ms: modified_ms(&metadata),
            line_ending: "lf",
            has_bom: false,
            mime_type: mime_for_kind(&target, kind),
            size_bytes,
        });
    }
    let has_bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    let body = if has_bom { &bytes[3..] } else { &bytes };
    let raw = String::from_utf8(body.to_vec()).unwrap_or_else(|_| {
        kind = "binary";
        String::new()
    });
    let line_ending = if raw.contains("\r\n") { "crlf" } else { "lf" };
    let content = raw.replace("\r\n", "\n").replace('\r', "\n");
    let metadata = fs::metadata(&target).map_err(|error| format!("无法读取文档信息：{error}"))?;
    Ok(DocumentSnapshot {
        path: relative_label(&clean),
        name: clean
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        content,
        kind,
        modified_ms: modified_ms(&metadata),
        line_ending,
        has_bom,
        mime_type: None,
        size_bytes,
    })
}

#[tauri::command]
fn authorize_workspace(
    root: String,
    app: AppHandle,
    state: State<'_, WorkspaceState>,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> Result<WorkspaceSnapshot, String> {
    let canonical = PathBuf::from(root)
        .canonicalize()
        .map_err(|error| format!("无法打开目录：{error}"))?;
    if !canonical.is_dir() {
        return Err("选择的路径不是目录".into());
    }
    let workspace = workspace_from_root(canonical);
    let snapshot = workspace_snapshot(&workspace)?;
    persist_workspace_preference(&app, &workspace)?;
    runtime.set_workspace_root(workspace.root.clone());
    runtime.info(
        "workspace.authorized",
        log_fields([
            ("workspaceId", Value::String(workspace.id.clone())),
            ("name", Value::String(workspace.name.clone())),
        ]),
    );
    *state.0.lock().map_err(|_| "工作区状态不可用".to_string())? = Some(workspace);
    Ok(snapshot)
}

#[tauri::command]
fn get_workspace(
    state: State<'_, WorkspaceState>,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> Result<WorkspaceSnapshot, String> {
    let workspace = lock_workspace(&state)?;
    let snapshot = workspace_snapshot(&workspace)?;
    runtime.info(
        "workspace.refresh",
        log_fields([("workspaceId", Value::String(workspace.id))]),
    );
    Ok(snapshot)
}

#[tauri::command]
fn read_document(
    path: String,
    state: State<'_, WorkspaceState>,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> Result<DocumentSnapshot, String> {
    let document = read_document_at(&lock_workspace(&state)?, &path)?;
    runtime.info(
        "document.read",
        log_fields([
            ("path", Value::String(document.path.clone())),
            ("kind", Value::String(document.kind.into())),
            ("sizeBytes", Value::from(document.size_bytes)),
        ]),
    );
    Ok(document)
}

#[tauri::command]
fn chunk_document(
    path: String,
    max_tokens: Option<usize>,
    overlap_tokens: Option<usize>,
    state: State<'_, WorkspaceState>,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> Result<long_text::ChunkManifest, String> {
    let workspace = lock_workspace(&state)?;
    let document = read_document_at(&workspace, &path)?;
    if !matches!(document.kind, "markdown" | "text" | "code") {
        return Err("只有文本类文档可以进行分块".into());
    }
    let max_tokens = max_tokens.unwrap_or(2048);
    let overlap_tokens = overlap_tokens.unwrap_or(128);
    let cache_key = long_text::cache_key(
        &document.path,
        &document.content,
        max_tokens,
        overlap_tokens,
    );
    let cache_path = chunk_cache_dir(&workspace).join(format!("{cache_key}.json"));
    if let Ok(bytes) = fs::read(&cache_path) {
        if let Ok(manifest) = serde_json::from_slice::<long_text::ChunkManifest>(&bytes) {
            if cache_manifest_is_valid(
                &manifest,
                &document.path,
                &document.content,
                max_tokens,
                overlap_tokens,
                &cache_key,
            ) {
                runtime.info(
                    "document.chunk_cache_hit",
                    log_fields([
                        ("path", Value::String(document.path.clone())),
                        ("cacheKey", Value::String(cache_key)),
                        ("chunkCount", Value::from(manifest.chunks.len())),
                    ]),
                );
                return Ok(manifest);
            }
        }
        runtime.info(
            "document.chunk_cache_invalid",
            log_fields([("path", Value::String(document.path.clone()))]),
        );
    }
    runtime.info(
        "document.chunk_cache_miss",
        log_fields([
            ("path", Value::String(document.path.clone())),
            ("cacheKey", Value::String(cache_key.clone())),
        ]),
    );
    let manifest = long_text::chunk_text(
        document.path.clone(),
        &document.content,
        max_tokens,
        overlap_tokens,
    )?;
    let encoded = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("无法序列化分块缓存：{error}"))?;
    write_atomic(&cache_path, &encoded)?;
    runtime.info(
        "document.chunk",
        log_fields([
            ("path", Value::String(manifest.source_id.clone())),
            ("sourceTokens", Value::from(manifest.source_tokens)),
            ("chunkCount", Value::from(manifest.chunks.len())),
            ("cacheKey", Value::String(manifest.cache_key.clone())),
            ("cacheHit", Value::Bool(false)),
        ]),
    );
    Ok(manifest)
}

#[tauri::command]
fn write_analysis_artifact(
    job_id: String,
    name: String,
    content: String,
    state: State<'_, WorkspaceState>,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> Result<String, String> {
    if job_id.is_empty()
        || job_id.len() > 100
        || !job_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err("分析任务 ID 无效".into());
    }
    let artifact_name = validate_analysis_artifact_name(&name)?;
    if content.len() > 16 * 1024 * 1024 {
        return Err("分析产物超过 16 MB 限制".into());
    }
    let workspace = lock_workspace(&state)?;
    let jobs_dir = analysis_jobs_dir(&workspace);
    fs::create_dir_all(&jobs_dir).map_err(|error| format!("无法创建分析任务目录：{error}"))?;
    let canonical_jobs_dir = jobs_dir
        .canonicalize()
        .map_err(|error| format!("无法解析分析任务目录：{error}"))?;
    if !canonical_jobs_dir.starts_with(&workspace.root) {
        return Err("分析任务目录路径越界".into());
    }
    let artifact_dir = jobs_dir.join(&job_id);
    fs::create_dir_all(&artifact_dir).map_err(|error| format!("无法创建分析任务目录：{error}"))?;
    let canonical_artifact_dir = artifact_dir
        .canonicalize()
        .map_err(|error| format!("无法解析分析任务目录：{error}"))?;
    if !canonical_artifact_dir.starts_with(&canonical_jobs_dir) {
        return Err("分析任务目录路径越界".into());
    }
    let target = artifact_dir.join(artifact_name);
    if fs::symlink_metadata(&target).is_ok() {
        return Err("分析产物已存在，拒绝覆盖".into());
    }
    fs::write(&target, content).map_err(|error| format!("无法写入分析产物：{error}"))?;
    let relative = relative_label(
        target
            .strip_prefix(&workspace.root)
            .map_err(|_| "分析产物路径越界".to_string())?,
    );
    runtime.info(
        "analysis.artifact_written",
        log_fields([
            ("path", Value::String(relative.clone())),
            ("jobId", Value::String(job_id)),
        ]),
    );
    Ok(relative)
}

#[tauri::command]
fn read_analysis_artifact(
    job_id: String,
    name: String,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    if job_id.is_empty()
        || job_id.len() > 100
        || !job_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err("分析任务 ID 无效".into());
    }
    let artifact_name = validate_analysis_artifact_name(&name)?;
    let workspace = lock_workspace(&state)?;
    let jobs_dir = analysis_jobs_dir(&workspace);
    let canonical_jobs_dir = jobs_dir
        .canonicalize()
        .map_err(|error| format!("无法读取分析任务目录：{error}"))?;
    if !canonical_jobs_dir.starts_with(&workspace.root) {
        return Err("分析任务目录路径越界".into());
    }
    let job_dir = jobs_dir.join(&job_id);
    let canonical_job_dir = job_dir
        .canonicalize()
        .map_err(|error| format!("无法读取分析任务目录：{error}"))?;
    if !canonical_job_dir.starts_with(&canonical_jobs_dir) {
        return Err("分析任务目录路径越界".into());
    }
    let target = job_dir.join(artifact_name);
    let canonical = target
        .canonicalize()
        .map_err(|error| format!("无法读取分析产物：{error}"))?;
    if !canonical.starts_with(&canonical_job_dir) {
        return Err("分析产物路径越界".into());
    }
    let metadata =
        fs::metadata(&canonical).map_err(|error| format!("无法读取分析产物信息：{error}"))?;
    if !metadata.is_file() || metadata.len() > 16 * 1024 * 1024 {
        return Err("分析产物不可读或超过 16 MB 限制".into());
    }
    fs::read_to_string(&canonical).map_err(|error| format!("无法读取分析产物：{error}"))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisJobManifest {
    job_id: String,
    workspace_id: String,
    instruction: String,
    status: String,
    created_at: u64,
    updated_at: u64,
    document_count: usize,
    supported_document_count: usize,
    excluded_documents: Vec<Value>,
    source_fingerprints: std::collections::HashMap<String, String>,
    chunk_count: Option<usize>,
    summary_count: Option<usize>,
    evidence_count: Option<usize>,
    error: Option<String>,
}

#[tauri::command]
fn list_analysis_jobs(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<AnalysisJobManifest>, String> {
    let workspace = lock_workspace(&state)?;
    let directory = analysis_jobs_dir(&workspace);
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let canonical_directory = directory
        .canonicalize()
        .map_err(|error| format!("无法读取分析任务：{error}"))?;
    if !canonical_directory.starts_with(&workspace.root) {
        return Err("分析任务目录路径越界".into());
    }
    let mut jobs = Vec::new();
    for entry in
        fs::read_dir(canonical_directory).map_err(|error| format!("无法读取分析任务：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取分析任务目录项：{error}"))?;
        if !entry
            .file_type()
            .map_err(|error| format!("无法识别分析任务：{error}"))?
            .is_dir()
        {
            continue;
        }
        let job_directory = entry.path();
        let mut manifest = None;
        for name in ["job.json", "job-failed.json", "job-start.json"] {
            let path = job_directory.join(name);
            if let Ok(bytes) = fs::read(path) {
                if let Ok(value) = serde_json::from_slice::<AnalysisJobManifest>(&bytes) {
                    manifest = Some(value);
                    if name != "job-start.json" {
                        break;
                    }
                }
            }
        }
        if let Some(value) = manifest {
            jobs.push(value);
        }
    }
    jobs.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    jobs.truncate(20);
    Ok(jobs)
}

#[tauri::command]
fn read_file_bytes(path: String, state: State<'_, WorkspaceState>) -> Result<Vec<u8>, String> {
    let workspace = lock_workspace(&state)?;
    let (_, target) = resolve_existing(&workspace, &path)?;
    if !target.is_file() {
        return Err("目标不是文件".into());
    }
    let metadata = fs::metadata(&target).map_err(|error| format!("无法读取文件信息：{error}"))?;
    if metadata.len() > 32 * 1024 * 1024 {
        return Err("预览文件不能超过 32 MB".into());
    }
    fs::read(&target).map_err(|error| format!("无法读取文件：{error}"))
}

#[tauri::command]
fn save_document(
    path: String,
    content: String,
    expected_modified_ms: u64,
    line_ending: String,
    has_bom: bool,
    state: State<'_, WorkspaceState>,
    runtime: State<'_, runtime_log::RuntimeLogState>,
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
    let encoded = if line_ending == "crlf" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    let parent = target.parent().ok_or_else(|| "无效文档路径".to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("无法创建临时文件：{error}"))?;
    if has_bom {
        temporary
            .write_all(&[0xef, 0xbb, 0xbf])
            .map_err(|error| format!("无法写入文档：{error}"))?;
    }
    temporary
        .write_all(encoded.as_bytes())
        .map_err(|error| format!("无法写入文档：{error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("无法同步文档：{error}"))?;
    temporary
        .persist(&target)
        .map_err(|error| format!("无法替换文档：{}", error.error))?;
    let document = read_document_at(&workspace, &path)?;
    runtime.info(
        "document.save",
        log_fields([
            ("path", Value::String(document.path.clone())),
            ("sizeBytes", Value::from(document.size_bytes)),
        ]),
    );
    Ok(document)
}

#[tauri::command]
fn create_document(
    path: String,
    state: State<'_, WorkspaceState>,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> Result<DocumentSnapshot, String> {
    let workspace = lock_workspace(&state)?;
    let (_, target) = resolve_for_create(&workspace, &path)?;
    ensure_document_extension(&target)?;
    if target.exists() {
        return Err("同名文件已存在".into());
    }
    let parent = target.parent().ok_or_else(|| "无效文档路径".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建上级目录：{error}"))?;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|error| format!("无法创建文档：{error}"))?;
    let document = read_document_at(&workspace, &path)?;
    runtime.info(
        "document.created",
        log_fields([("path", Value::String(document.path.clone()))]),
    );
    Ok(document)
}

#[tauri::command]
fn create_directory(
    path: String,
    state: State<'_, WorkspaceState>,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> Result<(), String> {
    let workspace = lock_workspace(&state)?;
    let (clean, target) = resolve_for_create(&workspace, &path)?;
    if target.exists() {
        return Err("同名路径已存在".into());
    }
    fs::create_dir_all(target).map_err(|error| format!("无法创建文件夹：{error}"))?;
    runtime.info(
        "workspace.directory_created",
        log_fields([("path", Value::String(relative_label(&clean)))]),
    );
    Ok(())
}

fn append_window_diagnostic(app: &AppHandle, message: &str) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let log_path = data_dir.join("vinkey-window.log");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| error.to_string())?;
    writeln!(log, "[{timestamp}] {message}").map_err(|error| error.to_string())?;
    Ok(log_path)
}

fn window_build_diagnostic(app: &AppHandle) -> String {
    let executable = std::env::current_exe()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|error| format!("无法读取：{error}"));
    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == "main")
        .map(|config| {
            format!(
                "config-decorations={}, config-title-bar={:?}, config-hidden-title={}, config-traffic-light={:?}",
                config.decorations,
                config.title_bar_style,
                config.hidden_title,
                config.traffic_light_position
            )
        })
        .unwrap_or_else(|| "config-main-window=missing".into());
    format!(
        "build-marker=mac-overlay-v1, package-version={}, executable={executable}, {window_config}",
        app.package_info().version
    )
}

#[tauri::command]
fn sync_native_window_theme(
    theme: String,
    window: WebviewWindow,
    app: AppHandle,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    let theme_result = {
        let native_theme = match theme.as_str() {
            "dark" => tauri::Theme::Dark,
            "light" => tauri::Theme::Light,
            _ => return Err(format!("不支持的窗口主题：{theme}")),
        };
        window
            .set_theme(Some(native_theme))
            .map_err(|error| format!("设置原生窗口主题失败：{error}"))
    };
    #[cfg(not(target_os = "macos"))]
    let theme_result: Result<(), String> = Ok(());

    let theme_status = theme_result
        .as_ref()
        .map(|_| "ok".to_string())
        .unwrap_or_else(|error| format!("error={error}"));
    let decorated = window
        .is_decorated()
        .map(|value| value.to_string())
        .unwrap_or_else(|error| format!("error={error}"));
    let actual_theme = window
        .theme()
        .map(|value| format!("{value:?}"))
        .unwrap_or_else(|error| format!("error={error}"));
    let inner_size = window
        .inner_size()
        .map(|value| format!("{value:?}"))
        .unwrap_or_else(|error| format!("error={error}"));
    let outer_size = window
        .outer_size()
        .map(|value| format!("{value:?}"))
        .unwrap_or_else(|error| format!("error={error}"));
    let message = format!(
        "theme-request={theme}, theme-sync={theme_status}, native-theme={actual_theme}, decorated={decorated}, inner-size={inner_size}, outer-size={outer_size}, {}",
        window_build_diagnostic(&app)
    );
    let log_path = append_window_diagnostic(&app, &message)?;
    runtime.info(
        "window.theme_synced",
        log_fields([
            ("theme", Value::String(theme)),
            ("status", Value::String(theme_status)),
            ("decorated", Value::String(decorated)),
        ]),
    );
    theme_result.map_err(|error| format!("{error}\n窗口诊断日志：{}", log_path.display()))?;
    Ok(format!("{message}\n日志：{}", log_path.display()))
}

#[tauri::command]
fn get_window_diagnostics(app: AppHandle) -> Result<String, String> {
    let log_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("vinkey-window.log");
    let contents = fs::read_to_string(&log_path).unwrap_or_else(|_| "暂无窗口诊断记录。".into());
    let recent = contents.lines().rev().take(12).collect::<Vec<_>>();
    Ok(format!(
        "窗口诊断日志：{}\n\n{}",
        log_path.display(),
        recent.into_iter().rev().collect::<Vec<_>>().join("\n")
    ))
}

#[tauri::command]
fn get_runtime_diagnostics(
    app: AppHandle,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> runtime_log::RuntimeDiagnostics {
    runtime.diagnostics(&app.package_info().version.to_string())
}

#[tauri::command]
fn record_runtime_event(
    event: String,
    message: Option<String>,
    runtime: State<'_, runtime_log::RuntimeLogState>,
) -> Result<(), String> {
    if event.trim().is_empty() || event.len() > 80 {
        return Err("运行日志事件名无效".into());
    }
    let mut fields = Map::new();
    if let Some(message) = message.filter(|value| !value.trim().is_empty()) {
        fields.insert("message".into(), Value::String(message));
    }
    runtime.info(event.trim(), fields);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WorkspaceState::default())
        .manage(models::ChatCancellation::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let runtime = runtime_log::RuntimeLogState::open(data_dir.join("vinkey-runtime.jsonl"))
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            runtime.info("app.start", log_fields([
                ("platform", Value::String(std::env::consts::OS.into())),
                ("arch", Value::String(std::env::consts::ARCH.into())),
            ]));
            app.manage(runtime.clone());
            // macOS window chrome is configured before creation in tauri.macos.conf.json.
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                let decorated = window.is_decorated()?;
                let theme = window.theme()?;
                let inner_size = window.inner_size()?;
                let outer_size = window.outer_size()?;
                let message = format!(
                    "startup native-theme={theme:?}, decorated={decorated}, inner-size={inner_size:?}, outer-size={outer_size:?}, {}",
                    window_build_diagnostic(app.handle())
                );
                if let Err(error) = append_window_diagnostic(app.handle(), &message) {
                    eprintln!("无法写入 macOS 窗口诊断日志：{error}");
                }
            }
            let database_path = data_dir.join("vinkey.sqlite3");
            database::init(&database_path)?;
            app.manage(database::DatabaseState(database_path));
            if let Some(workspace) = restore_workspace_preference(app.handle()) {
                runtime.set_workspace_root(workspace.root.clone());
                runtime.info("workspace.restored", log_fields([
                    ("workspaceId", Value::String(workspace.id.clone())),
                    ("name", Value::String(workspace.name.clone())),
                ]));
                if let Ok(mut state) = app.state::<WorkspaceState>().0.lock() {
                    *state = Some(workspace);
                }
            }
            runtime.info("app.ready", Map::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            authorize_workspace,
            get_workspace,
            read_document,
            chunk_document,
            write_analysis_artifact,
            read_analysis_artifact,
            list_analysis_jobs,
            read_file_bytes,
            save_document,
            create_document,
            create_directory,
            sync_native_window_theme,
            get_window_diagnostics,
            get_runtime_diagnostics,
            record_runtime_event,
            search::search_workspace,
            models::list_model_profiles,
            models::save_model_profile,
            models::delete_model_profile,
            models::test_model_connection,
            models::stream_chat,
            models::cancel_chat,
            database::list_conversations,
            database::load_conversation,
            database::save_conversation_message,
            database::delete_conversation,
            database::list_project_memory,
            database::search_project_memory,
            database::propose_project_memory,
            database::confirm_project_memory,
            database::reject_project_memory,
            database::upsert_characters,
            database::search_characters,
            database::upsert_character_mentions,
            database::invalidate_character_source,
            database::upsert_character_relationships,
            database::character_graph_stats,
            database::list_character_neighbors,
            database::character_graph_benchmark,
            database::character_graph_path,
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
    fn classifies_editor_file_types() {
        assert_eq!(
            ensure_document_extension(Path::new("chapters/one.MD")).unwrap(),
            "markdown"
        );
        assert_eq!(
            ensure_document_extension(Path::new("notes.txt")).unwrap(),
            "text"
        );
        assert_eq!(
            ensure_document_extension(Path::new("src/main.ts")).unwrap(),
            "code"
        );
        assert!(ensure_document_extension(Path::new("image.png")).is_err());
    }
}
