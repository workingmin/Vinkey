use std::{collections::HashMap, sync::Mutex};

/// Covers preparation, execution and persistence, independently of model/worker
/// cancellation handles. The mutex also serializes registration with deletion.
#[derive(Default)]
pub struct ConversationActivity(Mutex<HashMap<(String, String), usize>>);

impl ConversationActivity {
    pub fn begin(
        &self,
        workspace_id: String,
        id: String,
        validate: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        let mut requests = self.0.lock().map_err(|_| "会话状态不可用")?;
        validate()?;
        *requests.entry((workspace_id, id)).or_default() += 1;
        Ok(())
    }

    pub fn end(&self, workspace_id: String, id: String) -> Result<(), String> {
        let mut requests = self.0.lock().map_err(|_| "会话状态不可用")?;
        let key = (workspace_id, id);
        if let Some(count) = requests.get_mut(&key) {
            *count -= 1;
            if *count == 0 {
                requests.remove(&key);
            }
        }
        Ok(())
    }

    pub fn has_requests(&self) -> bool {
        self.0
            .lock()
            .map(|requests| !requests.is_empty())
            .unwrap_or(true)
    }

    pub fn while_idle<T>(
        &self,
        workspace_id: String,
        id: String,
        operation: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let requests = self.0.lock().map_err(|_| "会话状态不可用")?;
        if requests.contains_key(&(workspace_id, id)) {
            return Err("此会话的任务尚未结束，请等待任务停止并完成保存后再删除".into());
        }
        // Hold the lock until the database operation finishes.
        let result = operation();
        drop(requests);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    };

    #[test]
    fn deletion_only_blocks_the_matching_project_and_conversation() {
        let activity = ConversationActivity::default();
        activity.begin("p1".into(), "c1".into(), || Ok(())).unwrap();
        assert!(activity.has_requests());
        assert!(activity
            .while_idle("p1".into(), "c1".into(), || Ok(()))
            .is_err());
        assert!(activity
            .while_idle("p1".into(), "history".into(), || Ok(()))
            .is_ok());
        assert!(activity
            .while_idle("p2".into(), "c1".into(), || Ok(()))
            .is_ok());
        activity.end("p1".into(), "c1".into()).unwrap();
        assert!(activity
            .while_idle("p1".into(), "c1".into(), || Ok(()))
            .is_ok());
        assert!(!activity.has_requests());
    }

    #[test]
    fn protection_lasts_until_all_requests_finish() {
        let activity = ConversationActivity::default();
        activity.begin("p".into(), "c".into(), || Ok(())).unwrap();
        activity.begin("p".into(), "c".into(), || Ok(())).unwrap();
        activity.end("p".into(), "c".into()).unwrap();
        assert!(activity
            .while_idle("p".into(), "c".into(), || Ok(()))
            .is_err());
        activity.end("p".into(), "c".into()).unwrap();
        assert!(!activity.has_requests());
    }

    #[test]
    fn failed_validation_does_not_leave_a_reservation() {
        let activity = ConversationActivity::default();
        assert!(activity
            .begin("p".into(), "c".into(), || Err("deleted".into()))
            .is_err());
        assert!(!activity.has_requests());
        assert!(activity
            .while_idle("p".into(), "c".into(), || Ok(()))
            .is_ok());
    }

    #[test]
    fn request_registration_cannot_overtake_a_deletion_in_progress() {
        let activity = Arc::new(ConversationActivity::default());
        let exists = Arc::new(AtomicBool::new(true));
        let (started_tx, started_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let deleting_activity = activity.clone();
        let deleting_exists = exists.clone();
        let deletion = std::thread::spawn(move || {
            deleting_activity
                .while_idle("p".into(), "c".into(), || {
                    started_tx.send(()).unwrap();
                    finish_rx.recv().unwrap();
                    deleting_exists.store(false, Ordering::SeqCst);
                    Ok(())
                })
                .unwrap();
        });
        started_rx.recv().unwrap();
        let requesting_activity = activity.clone();
        let request = std::thread::spawn(move || {
            requesting_activity.begin("p".into(), "c".into(), || {
                if exists.load(Ordering::SeqCst) {
                    Ok(())
                } else {
                    Err("deleted".into())
                }
            })
        });
        finish_tx.send(()).unwrap();
        deletion.join().unwrap();
        assert_eq!(request.join().unwrap(), Err("deleted".into()));
        assert!(!activity.has_requests());
    }
}
