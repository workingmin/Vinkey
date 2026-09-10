#[cfg(test)]
mod pipeline_integration {
    use super::*;
    async fn run(root: &Path, workspace: &Workspace, db: &database::DatabaseState, id: &str) -> LongTextWorkerOutput {
        let input = StartLongTextWorkerInput {
            job_id: id.into(), instruction: "概括正文".into(), instruction_hash: long_text::source_fingerprint("概括正文"),
            profile_id: "test".into(), context_window: 8192, source_policy: "local-chunks".into(),
            max_tokens: 512, overlap_tokens: 32, document_index: None, excluded_documents: vec![],
            dispatch: task_runtime::WorkerDispatchIdentity { job_id: id.into(), workspace_id: workspace.id.clone(),
                service_id: "long-text-analysis".into(), policy_version: "1".into(), dispatch_version: "1".into(), execution_owner: "rust-worker".into() },
            documents: vec![WorkerDocumentInput { path: "book.md".into(), source_fingerprint: long_text::source_fingerprint(&fs::read_to_string(workspace.root.join("book.md")).unwrap()) }],
        };
        let model = models::worker_model_compatibility("test", db).unwrap();
        let snapshot = persist_snapshot(root, workspace, &input, &model).unwrap();
        job_service::start(root, &workspace.id, job_service::StartTaskJobInput {
            task_id: id.into(), task_type: "long-text-analysis".into(), instruction_hash: input.instruction_hash.clone(),
            source_fingerprints: input.documents.iter().map(|d| (d.path.clone(), d.source_fingerprint.clone())).collect(),
        }).unwrap();
        run_pipeline_worker(root.into(), workspace.clone(), db.clone(), snapshot, Arc::new(WorkerControl::default()), WorkerRuntimeState::default(), AppHandle::default()).await.unwrap();
        read_output_at(root, id).unwrap().unwrap()
    }

    #[tokio::test]
    async fn repeats_all_stages_without_model_requests_and_detects_tampering() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace { id: "workspace".into(), name: "Test".into(), root: dir.path().into() };
        fs::write(dir.path().join("book.md"), "第一卷\n第一章\n正文甲\n第二章\n正文乙").unwrap();
        let root = dir.path().join("jobs");
        let db = database::DatabaseState::default();
        let first = run(&root, &workspace, &db, "first").await;
        assert!(first.model_invocation_count >= 6);
        let events = read_events_at(&root, "first").unwrap();
        assert!(events.iter().any(|event| event.artifact.as_deref() == Some("manifest-001.json")));
        assert!(events.iter().any(|event| event.artifact.as_deref() == Some("evidence.json")));
        let second = run(&root, &workspace, &db, "second").await;
        assert_eq!(second.model_invocation_count, 0);
        assert!(second.stage_cache_hits > second.map_cache_hits);
        fs::write(root.join("second/analysis.md"), "损坏").unwrap();
        assert!(read_output_at(&root, "second").is_err());
    }

    #[tokio::test]
    async fn bad_response_is_quarantined_before_reuse() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace { id: "workspace".into(), name: "Test".into(), root: dir.path().into() };
        fs::write(dir.path().join("book.md"), "第一章\n正文").unwrap();
        let db = database::DatabaseState::default();
        db.responses.lock().unwrap().push("毫无来源的结论".into());
        let root = dir.path().join("jobs");
        let output = run(&root, &workspace, &db, "first").await;
        assert!(fs::read_dir(root.join("first")).unwrap().any(|entry| entry.unwrap().file_name().to_string_lossy().starts_with("quarantine-")));
        assert_eq!(output.model_invocation_count, db.calls.lock().unwrap().len());
        assert!(!output.content.contains("毫无来源"));
        assert_eq!(run(&root, &workspace, &db, "second").await.model_invocation_count, 0);
    }
}
