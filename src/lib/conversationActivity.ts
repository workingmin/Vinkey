import { useAppStore } from '../store'
import { beginConversationRequest, endConversationRequest } from './desktop'

export function conversationActivityKey(workspaceId: string, conversationId: string): string {
  return JSON.stringify([workspaceId, conversationId])
}

export function isConversationBusy(state: ReturnType<typeof useAppStore.getState>, workspaceId: string, conversationId: string): boolean {
  return Boolean(state.pendingConversationRequests[conversationActivityKey(workspaceId, conversationId)]
    || (state.workspace?.id === workspaceId && state.chatRuns[conversationId]))
}

// Keep the reservation through preflight and the final message save, even after
// the visible chat run has ended. Reserve new IDs before the first async step.
export async function withConversationRequest(workspaceId: string, conversationId: string, existing: boolean, operation: () => Promise<void>): Promise<void> {
  const key = conversationActivityKey(workspaceId, conversationId)
  useAppStore.setState((state) => ({
    pendingChatRequests: state.pendingChatRequests + 1,
    pendingConversationRequests: { ...state.pendingConversationRequests, [key]: (state.pendingConversationRequests[key] ?? 0) + 1 },
  }))
  let registered = false
  try {
    await beginConversationRequest(conversationId, workspaceId, existing)
    registered = true
    await operation()
  } finally {
    try {
      if (registered) await endConversationRequest(conversationId, workspaceId)
    } finally {
      useAppStore.setState((state) => {
        const pendingConversationRequests = { ...state.pendingConversationRequests }
        if (--pendingConversationRequests[key] === 0) delete pendingConversationRequests[key]
        return { pendingChatRequests: state.pendingChatRequests - 1, pendingConversationRequests }
      })
    }
  }
}
