import { listen } from '@tauri-apps/api/event'
import { useAppStore } from '../store'
import { isDesktop, loadConversation } from './desktop'
import type { TaskWorkerEvent } from '../types'

/** Keep restored/background runs observable even without a local ChatRun. */
export function watchWorkerHistory(workspaceId: string, conversationId: string): () => void {
  if (!isDesktop()) return () => {}
  let disposed = false
  let loading = false
  let requested = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let unlisten: (() => void) | undefined
  const eligible = () => {
    const state = useAppStore.getState()
    return !disposed && state.workspace?.id === workspaceId && state.conversationId === conversationId
      && !state.projectTransition && !state.chatRuns[conversationId] && state.pendingChatRequests === 0
  }
  const refresh = async () => {
    timer = undefined
    if (!eligible()) return
    if (loading) { requested = true; return }
    loading = true
    const original = useAppStore.getState().messages
    try {
      const conversation = await loadConversation(conversationId, workspaceId)
      if (eligible() && useAppStore.getState().messages === original) {
        useAppStore.setState({ messages: conversation.messages })
      }
    } catch {
      if (eligible()) useAppStore.getState().setError('后台过程刷新失败，重新打开会话可重试。')
    } finally {
      loading = false
      if (requested && !disposed) { requested = false; schedule() }
    }
  }
  const schedule = () => {
    if (!disposed && timer === undefined) timer = setTimeout(() => { void refresh() }, 250)
  }
  void listen<TaskWorkerEvent>('task-worker-event', ({ payload }) => {
    if (!eligible()) return
    if (useAppStore.getState().messages.some((message) => message.activityLog?.some((item) => (item.worker?.jobId ?? item.jobId) === payload.jobId))) schedule()
  }).then((stop) => {
    if (disposed) { stop(); return }
    unlisten = stop
    // Close the gap between loading a conversation and attaching the listener.
    if (useAppStore.getState().messages.some((message) => message.activityLog?.some((item) => item.worker || item.jobId))) schedule()
  }).catch(() => {
    if (eligible()) useAppStore.getState().setError('后台过程订阅失败，重新打开会话可查看已保存记录。')
  })
  return () => { disposed = true; clearTimeout(timer); unlisten?.() }
}
