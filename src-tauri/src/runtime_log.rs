use serde::Serialize;
use serde_json::{Map, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_FIELD_LENGTH: usize = 500;
const RECENT_LINES: usize = 240;

#[derive(Clone)]
pub struct RuntimeLogState {
    writer: Arc<Mutex<BufWriter<File>>>,
    path: PathBuf,
    workspace_root: Arc<Mutex<Option<PathBuf>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDiagnostics {
    pub path: String,
    pub platform: String,
    pub version: String,
    pub lines: Vec<String>,
}

impl RuntimeLogState {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建运行日志目录：{error}"))?;
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| format!("无法打开运行日志：{error}"))?;
        Ok(Self {
            writer: Arc::new(Mutex::new(BufWriter::new(file))),
            path,
            workspace_root: Arc::new(Mutex::new(None)),
        })
    }

    pub fn set_workspace_root(&self, root: PathBuf) {
        if let Ok(mut value) = self.workspace_root.lock() {
            *value = Some(root);
        }
    }

    pub fn record(&self, level: &str, event: &str, fields: Map<String, Value>) {
        let workspace = self
            .workspace_root
            .lock()
            .ok()
            .and_then(|value| value.clone());
        let mut sanitized = Map::new();
        for (key, value) in fields {
            sanitized.insert(key, sanitize_value(value, workspace.as_deref()));
        }
        let entry = serde_json::json!({
            "timestamp": now_ms(),
            "level": level,
            "event": event,
            "fields": sanitized,
        });
        let line = match serde_json::to_string(&entry) {
            Ok(value) => value,
            Err(_) => return,
        };
        if let Ok(mut writer) = self.writer.lock() {
            if writeln!(writer, "{line}").is_ok() {
                let _ = writer.flush();
            }
        }
    }

    pub fn info(&self, event: &str, fields: Map<String, Value>) {
        self.record("info", event, fields);
    }

    pub fn error(&self, event: &str, message: &str) {
        let mut fields = Map::new();
        fields.insert("message".into(), Value::String(message.into()));
        self.record("error", event, fields);
    }

    pub fn diagnostics(&self, version: &str) -> RuntimeDiagnostics {
        let contents = fs::read_to_string(&self.path).unwrap_or_default();
        let lines = contents
            .lines()
            .rev()
            .take(RECENT_LINES)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(str::to_string)
            .collect();
        RuntimeDiagnostics {
            path: self.path.display().to_string(),
            platform: std::env::consts::OS.to_string(),
            version: version.to_string(),
            lines,
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn sanitize_value(value: Value, workspace_root: Option<&Path>) -> Value {
    match value {
        Value::String(text) => Value::String(sanitize_text(&text, workspace_root)),
        Value::Array(values) => Value::Array(
            values
                .into_iter()
                .map(|item| sanitize_value(item, workspace_root))
                .collect(),
        ),
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| (key, sanitize_value(value, workspace_root)))
                .collect(),
        ),
        other => other,
    }
}

fn sanitize_text(text: &str, workspace_root: Option<&Path>) -> String {
    let mut value = text.replace('\n', " ").replace('\r', " ");
    if let Some(root) = workspace_root.and_then(|path| path.to_str()) {
        if !root.is_empty() {
            value = value.replace(root, "<workspace>");
        }
    }
    for marker in [
        "Bearer ",
        "api_key=",
        "apiKey=",
        "api_key\":\"",
        "apiKey\":\"",
    ] {
        if let Some(start) = value.find(marker) {
            let value_start = start + marker.len();
            let end = value[value_start..]
                .find(|character: char| character.is_whitespace() || matches!(character, ',' | '"'))
                .map(|offset| value_start + offset)
                .unwrap_or(value.len());
            value.replace_range(value_start..end, "<redacted>");
        }
    }
    value.chars().take(MAX_FIELD_LENGTH).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn writes_jsonl_and_redacts_sensitive_values() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("runtime.jsonl");
        let logger = RuntimeLogState::open(path.clone()).unwrap();
        logger.set_workspace_root(PathBuf::from("/tmp/project"));
        let mut fields = Map::new();
        fields.insert(
            "path".into(),
            Value::String("/tmp/project/chapter.md".into()),
        );
        fields.insert(
            "message".into(),
            Value::String("Bearer secret-token".into()),
        );
        logger.info("test.event", fields);
        let line = fs::read_to_string(path).unwrap();
        let value: Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(value["event"], "test.event");
        assert_eq!(value["fields"]["path"], "<workspace>/chapter.md");
        assert!(!line.contains("secret-token"));
    }

    #[test]
    fn concurrent_writes_remain_valid_jsonl() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("runtime.jsonl");
        let logger = RuntimeLogState::open(path.clone()).unwrap();
        let handles = (0..4)
            .map(|index| {
                let logger = logger.clone();
                std::thread::spawn(move || {
                    for _ in 0..20 {
                        let mut fields = Map::new();
                        fields.insert("worker".into(), Value::from(index));
                        logger.info("test.concurrent", fields);
                    }
                })
            })
            .collect::<Vec<_>>();
        for handle in handles {
            handle.join().unwrap();
        }
        let contents = fs::read_to_string(path).unwrap();
        assert_eq!(contents.lines().count(), 80);
        for line in contents.lines() {
            serde_json::from_str::<Value>(line).unwrap();
        }
    }
}
