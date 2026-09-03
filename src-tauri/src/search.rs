use crate::runtime_log::RuntimeLogState;
use crate::{lock_workspace, WorkspaceState};
use serde::Serialize;
use std::fs;
use std::time::Instant;
use tauri::State;
use walkdir::{DirEntry, WalkDir};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    path: String,
    line: usize,
    snippet: String,
}

fn allowed(entry: &DirEntry) -> bool {
    if entry.file_type().is_symlink() {
        return false;
    }
    let name = entry.file_name().to_string_lossy();
    !name.starts_with('.') && !matches!(name.as_ref(), "node_modules" | "target" | "dist")
}

#[tauri::command]
pub async fn search_workspace(
    query: String,
    max_results: usize,
    state: State<'_, WorkspaceState>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<Vec<SearchHit>, String> {
    let workspace = lock_workspace(&state)?;
    let limit = max_results.clamp(1, 200);
    let started = Instant::now();
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let needle = query.trim().to_lowercase();
        if needle.is_empty() {
            return Ok(Vec::new());
        }
        let mut hits = Vec::new();
        for entry in WalkDir::new(&workspace.root)
            .follow_links(false)
            .into_iter()
            .filter_entry(allowed)
        {
            if hits.len() >= limit {
                break;
            }
            let entry = match entry {
                Ok(value) => value,
                Err(_) => continue,
            };
            if !entry.file_type().is_file()
                || crate::ensure_document_extension(entry.path()).is_err()
            {
                continue;
            }
            let content = match fs::read_to_string(entry.path()) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let relative = match entry.path().strip_prefix(&workspace.root) {
                Ok(value) => crate::relative_label(value),
                Err(_) => continue,
            };
            for (index, line) in content.lines().enumerate() {
                if hits.len() >= limit {
                    break;
                }
                if line.to_lowercase().contains(&needle) {
                    hits.push(SearchHit {
                        path: relative.clone(),
                        line: index + 1,
                        snippet: line.chars().take(180).collect(),
                    });
                }
            }
        }
        runtime.info(
            "search.completed",
            serde_json::json!({
                "resultCount": hits.len(),
                "durationMs": started.elapsed().as_millis(),
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        );
        Ok(hits)
    })
    .await
    .map_err(|error| format!("搜索任务失败：{error}"))?
}
