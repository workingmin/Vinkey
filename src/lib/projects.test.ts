// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activateProject, chooseWorkspace, deleteConversation, deleteProject, listConversations, listProjects, refreshWorkspace, saveConversationMessage } from './desktop'
import { useAppStore } from '../store'

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('project and conversation records', () => {
  it('keeps projects and their conversations isolated when switching or deleting', async () => {
    const [first] = await listProjects()
    await saveConversationMessage('same-id', 'First', { id: 'a', role: 'user', content: 'A', createdAt: 1 }, first.id)
    vi.spyOn(window, 'prompt').mockReturnValue('Second')
    const second = (await chooseWorkspace())!
    await saveConversationMessage('same-id', 'Second', { id: 'b', role: 'user', content: 'B', createdAt: 2 }, second.id)
    expect(await listProjects()).toHaveLength(2)
    await activateProject(first.id)
    expect((await listConversations())[0].title).toBe('First')
    await deleteConversation('same-id', second.id)
    expect(await listConversations(second.id)).toEqual([])
    expect(await listConversations(first.id)).toHaveLength(1)
    await expect(deleteProject(first.id, 'wrong')).rejects.toThrow('名称不匹配')
    expect(await listProjects()).toHaveLength(2)
    await deleteProject(first.id, first.name)
    expect(await listProjects()).toEqual([expect.objectContaining({ id: second.id })])
    await expect(refreshWorkspace()).rejects.toThrow('请先选择工作目录')
    await expect(listConversations(first.id)).rejects.toThrow('项目记录不存在')
    expect(await listProjects()).toHaveLength(1)
  })

  it('does not add duplicates or resurrect deleted sessions when a project is added again', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Second')
    const project = (await chooseWorkspace())!
    expect((await chooseWorkspace())!.id).toBe(project.id)
    await saveConversationMessage('c', 'History', { id: 'm', role: 'user', content: 'Old', createdAt: 1 }, project.id)
    await deleteProject(project.id, project.name)
    const readded = (await chooseWorkspace())!
    expect(await listConversations(readded.id)).toEqual([])
    expect(await listProjects()).toHaveLength(2)
  })

  it('clears relative-path editor state, context and active conversation when changing projects', () => {
    const store = useAppStore.getState()
    store.setWorkspace({ id: 'a', name: 'A', pathLabel: '/a', entries: [] })
    useAppStore.setState({ tabs: [{ path: 'same.md', name: 'same.md', content: 'A draft', savedContent: 'A', kind: 'markdown', modifiedMs: 1, lineEnding: 'lf', hasBom: false }], activePath: 'same.md', contextDocuments: [{ path: 'same.md', name: 'same.md', content: 'A', size: 1 }], conversationId: 'c', conversations: [{ id: 'c', title: 'A', messageCount: 1, updatedAt: 1 }] })
    store.setWorkspace({ id: 'b', name: 'B', pathLabel: '/b', entries: [] })
    expect(useAppStore.getState()).toMatchObject({ tabs: [], activePath: null, contextDocuments: [], conversationId: null, conversations: [] })
    store.setWorkspace(null)
    expect(useAppStore.getState().workspace).toBeNull()
  })
})
