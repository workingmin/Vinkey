// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { loadConversation } from './desktop'
import type { Conversation, TaskWorkerEvent } from '../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), Channel: vi.fn() }))

const event = (sequence: number, status: TaskWorkerEvent['status'] = 'running'): TaskWorkerEvent => ({
  jobId: 'job-1', sequence, timestamp: sequence * 1_000, stage: status === 'completed' ? 'lifecycle' : 'map',
  status, message: '继续处理任务过程', completed: sequence, total: 100,
})
const snapshot = (): Conversation => ({ id: 'conversation', title: '分析', updatedAt: 1, messages: [{
  id: 'assistant', role: 'assistant', content: '', createdAt: 1,
  activityLog: [{ id: 'initial', jobId: 'job-1', status: 'thinking', message: null, timestamp: 1 }],
}] })

beforeEach(() => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
  vi.mocked(invoke).mockReset()
})
afterEach(() => { Reflect.deleteProperty(window, '__TAURI_INTERNALS__') })

describe('persisted Worker history recovery', () => {
  it('restores all persisted events and output after the WebView stopped saving', async () => {
    const events = Array.from({ length: 121 }, (_, index) => event(index + 1, index === 120 ? 'completed' : 'running'))
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'load_conversation') return snapshot()
      if (command === 'list_task_worker_events') return events
      if (command === 'get_long_text_worker_output') return { content: '恢复的分析报告' }
      throw new Error(command)
    })
    const restored = await loadConversation('conversation', 'project-1')
    expect(restored.messages[0].activityLog).toHaveLength(122)
    expect(restored.messages[0].content).toBe('恢复的分析报告')
    expect(restored.messages[0].runResult?.status).toBe('completed')
    expect(invoke).toHaveBeenCalledWith('list_task_worker_events', { jobId: 'job-1', afterSequence: null, workspaceId: 'project-1' })
    expect(invoke).toHaveBeenCalledWith('get_long_text_worker_output', { jobId: 'job-1', workspaceId: 'project-1' })
  })

  it('retains older failures and replaced responses when a later retry succeeds', async () => {
    const saved = snapshot()
    saved.messages[0].content = '此前任务失败'
    saved.messages[0].runResult = { status: 'failed' }
    saved.messages[0].completedAt = 1_000
    saved.messages[0].activityLog!.push({ id: 'worker:job-1:1', status: 'tool_calling', message: '失败', timestamp: 1_000, worker: event(1, 'failed') })
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'load_conversation') return saved
      if (command === 'list_task_worker_events') return [event(1, 'failed'), event(2), event(3, 'completed')]
      return { content: '重试后的报告' }
    })
    const restored = await loadConversation('conversation', 'project-1')
    expect(restored.messages[0].content).toBe('重试后的报告')
    expect(restored.messages[0].activityLog?.filter((item) => item.worker).map((item) => item.worker?.status)).toEqual(['failed', 'running', 'completed'])
    expect(restored.messages[0].activityLog?.at(-1)?.response).toBe('此前任务失败')
    expect(restored.messages[0].runResult?.status).toBe('completed')
  })

  it('keeps a later message-level failure when no newer Worker execution exists', async () => {
    const saved = snapshot()
    saved.messages[0].runResult = { status: 'failed' }
    saved.messages[0].activityLog!.push({ id: 'worker:job-1:1', status: 'tool_calling', message: '完成', timestamp: 1_000, worker: event(1, 'completed') })
    vi.mocked(invoke).mockImplementation(async (command) => command === 'load_conversation' ? saved : [event(1, 'completed')])
    const restored = await loadConversation('conversation', 'project-1')
    expect(restored.messages[0].runResult?.status).toBe('failed')
    expect(restored.messages[0].activityLog).toHaveLength(2)
  })

  it('reports unavailable history instead of dropping the saved snapshot', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'load_conversation') return snapshot()
      throw new Error('工作区已切换')
    })
    const restored = await loadConversation('conversation', 'project-1')
    expect(restored.messages[0].activityLog).toHaveLength(1)
    expect(restored.messages[0].activityHistoryError).toContain('暂时无法读取')
    expect(restored.messages[0].runResult).toBeUndefined()
  })
})
