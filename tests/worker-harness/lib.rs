#![allow(dead_code)]
// Compile the production pipeline and persistence code without the platform WebView.
// Only the desktop event transport and model transport are replaced.
extern crate self as tauri;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
#[derive(Clone, Default)]
pub struct AppHandle;
pub trait Emitter {
    fn emit<T: serde::Serialize>(&self, _: &str, _: T) -> Result<(), String> {
        Ok(())
    }
}
impl Emitter for AppHandle {}
pub mod async_runtime {
    pub use tokio::spawn;
}
#[derive(Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root: PathBuf,
}
pub struct Document {
    path: String,
    content: String,
    kind: &'static str,
}
pub fn read_document_at(workspace: &Workspace, path: &str) -> Result<Document, String> {
    Ok(Document {
        path: path.into(),
        content: std::fs::read_to_string(workspace.root.join(path)).map_err(|e| e.to_string())?,
        kind: "markdown",
    })
}
pub mod database {
    use super::*;
    #[derive(Clone, Default)]
    pub struct DatabaseState {
        pub responses: Arc<Mutex<Vec<String>>>,
        pub calls: Arc<Mutex<Vec<String>>>,
    }
}
pub mod task_runtime {
    #[derive(Clone, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
    #[serde(rename_all = "camelCase")]
    pub struct WorkerDispatchIdentity {
        pub job_id: String,
        pub workspace_id: String,
        pub service_id: String,
        pub policy_version: String,
        pub dispatch_version: String,
        pub execution_owner: String,
    }
    pub fn validate_worker_identity(value: &WorkerDispatchIdentity) -> Result<(), String> {
        if value.service_id != "long-text-analysis" || value.execution_owner != "rust-worker" {
            Err("invalid dispatch".into())
        } else {
            Ok(())
        }
    }
}
pub mod models {
    use super::*;
    #[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
    #[serde(rename_all = "camelCase")]
    pub struct WorkerModelCompatibility {
        pub profile_id: String,
        pub provider_kind: String,
        pub base_url: String,
        pub model: String,
        pub context_window: u32,
    }
    pub struct RequestMessage {
        pub role: String,
        pub content: String,
    }
    pub fn worker_model_compatibility(
        id: &str,
        _: &database::DatabaseState,
    ) -> Result<WorkerModelCompatibility, String> {
        Ok(WorkerModelCompatibility {
            profile_id: id.into(),
            provider_kind: "ollama".into(),
            base_url: "http://localhost:11434".into(),
            model: "test".into(),
            context_window: 8192,
        })
    }
    pub async fn complete_worker_chat(
        _: &str,
        messages: Vec<RequestMessage>,
        database: &database::DatabaseState,
        _: &WorkerModelCompatibility,
        _: &std::sync::atomic::AtomicBool,
    ) -> Result<String, String> {
        let prompt = &messages[0].content;
        database.calls.lock().unwrap().push(prompt.clone());
        if let Some(response) = database.responses.lock().unwrap().pop() {
            return Ok(response);
        }
        if let Some(captures) =
            regex::Regex::new(r#"来源：(.+)，行 (\d+)-\d+\n\n<chunk id="([^"]+)">\n([^\n]+)"#)
                .unwrap()
                .captures(prompt)
        {
            return Ok(format!(
                "- 已检查正文。[source: {} chunk={} lines={}-{} quote=\"{}\"]",
                &captures[1], &captures[3], &captures[2], &captures[2], &captures[4]
            ));
        }
        if let Some(found) = regex::Regex::new(r#"\[source: [^\]\n]+lines=\d+-\d+ quote="[^"]+"\]"#)
            .unwrap()
            .find(prompt)
        {
            return Ok(format!("- 汇总来源中的事实。{}", found.as_str()));
        }
        Ok("未找到与任务相关的证据。".into())
    }
}
#[path = "../../src-tauri/src/job_service.rs"]
mod job_service;
#[path = "../../src-tauri/src/long_text.rs"]
mod long_text;
mod worker_service {
    include!("../../src-tauri/src/worker_service.rs");
    include!("pipeline_tests.rs");
}
