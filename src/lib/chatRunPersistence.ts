import { useAppStore } from '../store'
import { saveConversationMessage } from './desktop'
import type { ChatMessage } from '../types'

/** Persist immutable snapshots in order, including runs with no answer yet. */
export function persistChatRun(conversationId: string, title: string, workspaceId?: string, onError?: (error: unknown) => void) {
  const requestId = useAppStore.getState().chatRuns[conversationId]?.requestId
  let pending: ChatMessage | undefined = useAppStore.getState().chatRuns[conversationId]?.assistantMessage
  let timer: ReturnType<typeof setTimeout> | undefined
  let writes = Promise.resolve()
  const writePending = () => {
    if (!pending) return
    const snapshot = pending
    pending = undefined
    writes = writes.then(() => saveConversationMessage(conversationId, title, snapshot, workspaceId))
      .catch((error: unknown) => { onError?.(error) })
  }
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    const run = state.chatRuns[conversationId]
    if (!run || run.requestId !== requestId || run.assistantMessage === previous.chatRuns[conversationId]?.assistantMessage) return
    pending = run.assistantMessage
    if (timer === undefined) timer = setTimeout(() => {
      timer = undefined
      writePending()
    }, 1_000)
  })
  writePending()
  return async () => {
    unsubscribe()
    clearTimeout(timer)
    writePending()
    // The caller saves the terminal snapshot only after every earlier write.
    await writes
  }
}
