// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../store'
import { deleteConversation, listConversations, listProjects, saveConversationMessage } from './desktop'
import { isConversationBusy, withConversationRequest } from './conversationActivity'

beforeEach(() => { localStorage.clear(); useAppStore.setState(useAppStore.getInitialState()) })

describe('conversation request lifetime', () => {
  it('protects a new conversation before a chat run exists and through the final save', async () => {
    const [project] = await listProjects()
    let finishSave!: () => void
    const saved = new Promise<void>((resolve) => { finishSave = resolve })
    let saving!: () => void
    const reachedSave = new Promise<void>((resolve) => { saving = resolve })
    const request = withConversationRequest(project.id, 'new', false, async () => {
      await expect(deleteConversation('new', project.id)).rejects.toThrow('此会话的任务尚未结束')
      await saveConversationMessage('new', 'New', { id: 'u', role: 'user', content: 'hello', createdAt: 1 }, project.id)
      saving()
      await saved
      await saveConversationMessage('new', 'New', { id: 'a', role: 'assistant', content: 'done', createdAt: 2 }, project.id)
    })
    await reachedSave
    try {
      expect(useAppStore.getState().chatRuns).toEqual({})
      expect(isConversationBusy(useAppStore.getState(), project.id, 'new')).toBe(true)
      await expect(deleteConversation('new', project.id)).rejects.toThrow('此会话的任务尚未结束')
    } finally { finishSave(); await request }
    expect(isConversationBusy(useAppStore.getState(), project.id, 'new')).toBe(false)
    expect((await listConversations(project.id))[0].messageCount).toBe(2)
    await deleteConversation('new', project.id)
    expect(await listConversations(project.id)).toEqual([])
    expect(useAppStore.getState().pendingChatRequests).toBe(0)
  })

  it('does not resurrect a conversation when deletion wins the race with starting a request', async () => {
    const [project] = await listProjects()
    await saveConversationMessage('old', 'Old', { id: 'u', role: 'user', content: 'hello', createdAt: 1 }, project.id)
    await deleteConversation('old', project.id)
    const operation = vi.fn()
    await expect(withConversationRequest(project.id, 'old', true, operation)).rejects.toThrow('会话记录已删除')
    expect(operation).not.toHaveBeenCalled()
    expect(await listConversations(project.id)).toEqual([])
    expect(useAppStore.getState()).toMatchObject({ pendingChatRequests: 0, pendingConversationRequests: {} })
  })

  it('releases protection when preparation, execution or saving fails', async () => {
    const [project] = await listProjects()
    await expect(withConversationRequest(project.id, 'failed', false, async () => { throw new Error('失败') })).rejects.toThrow('失败')
    expect(useAppStore.getState()).toMatchObject({ pendingChatRequests: 0, pendingConversationRequests: {} })
    await expect(deleteConversation('failed', project.id)).resolves.toBeUndefined()
  })
})
