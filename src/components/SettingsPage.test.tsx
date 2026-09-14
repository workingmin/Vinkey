// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { useAppStore } from '../store'
import * as desktop from '../lib/desktop'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(desktop, 'getLocalHardware').mockResolvedValue({ platform: 'macos', architecture: 'aarch64', totalMemoryBytes: 16 * 1024 ** 3, gpuMemoryBytes: null, unifiedMemory: true })
  useAppStore.setState({ modelProfiles: [], modelAssignments: {}, activeModelId: null, pendingChatRequests: 0, chatRuns: {} })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('model settings workflow', () => {
  it('shows the local tier and exposes discovered models for the single active model', async () => {
    vi.spyOn(desktop, 'getLocalHardware').mockResolvedValue({ platform: 'macos', architecture: 'aarch64', totalMemoryBytes: 32 * 1024 ** 3, gpuMemoryBytes: null, unifiedMemory: true })
    vi.spyOn(desktop, 'discoverConnectionModels').mockResolvedValue({ ok: true, message: '', models: ['qwen3:8b', 'qwen3:14b', 'qwen3:32b'] })
    const [connection] = await desktop.listModelConnections()
    await desktop.saveModelProfile({ id: 'large', connectionId: connection.id, name: '14B', kind: 'ollama', baseUrl: connection.baseUrl, model: 'qwen3:14b', contextWindow: 4096 })
    render(<SettingsPage />)
    expect((await screen.findAllByText('标准配置')).length).toBeGreaterThan(0)
    fireEvent.click(await screen.findByRole('button', { name: '查看模型列表' }))
    expect(await screen.findByText('qwen3:14b')).toBeTruthy()
    expect(screen.getByLabelText('活动模型')).toBeTruthy()
  })

  it('warns below minimum and opens a remote connection without saving it', async () => {
    vi.spyOn(desktop, 'getLocalHardware').mockResolvedValue({ platform: 'macos', architecture: 'aarch64', totalMemoryBytes: 8 * 1024 ** 3, gpuMemoryBytes: null, unifiedMemory: true })
    render(<SettingsPage />)
    expect((await screen.findAllByText('低于最低配置')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '添加远程连接' }))
    expect((screen.getByLabelText('接口类型') as HTMLSelectElement).value).toBe('openai-compatible')
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('')
    expect(await desktop.listModelConnections()).toHaveLength(1)
  })

  it('shows admission controls for a remote Ollama connection', async () => {
    vi.spyOn(desktop, 'getLocalHardware').mockRejectedValue(new Error('probe failed'))
    await desktop.saveModelConnection({ id: 'remote', name: '远程推理', kind: 'ollama', baseUrl: 'http://192.168.1.8:11434' })
    render(<SettingsPage />)
    expect((await screen.findAllByText('硬件未确认')).length).toBeGreaterThan(0)
    fireEvent.click(await screen.findByRole('button', { name: '查看模型列表' }))
    expect(await screen.findByRole('button', { name: '重新探测' })).toBeTruthy()
  })

  it('discovers models and assigns one model to both internal runtime roles', async () => {
    render(<SettingsPage />)
    const saveButton = await screen.findByRole('button', { name: '保存并运行准入探测' })
    await waitFor(() => expect((saveButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(saveButton)
    await screen.findByRole('option', { name: 'qwen3:8b · Ollama · 浏览器演示' })
    fireEvent.change(screen.getByLabelText('活动模型'), { target: { value: JSON.stringify(['demo-ollama', 'qwen3:8b']) } })
    await screen.findByText(/已启用 qwen3:8b/)
    const state = useAppStore.getState()
    expect(state.modelAssignments.efficient).toBe(state.modelAssignments.general)
    expect(state.modelProfiles.find((profile) => profile.id === state.modelAssignments.general)?.model).toBe('qwen3:8b')
  })

  it('keeps same-name models from different connections distinct and removes deleted assignments', async () => {
    const initial = await desktop.listModelConnections()
    const second = await desktop.saveModelConnection({ id: 'second', name: '局域网', kind: 'ollama', baseUrl: 'http://192.168.1.8:11434' })
    render(<SettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /局域网.*192\.168/ }))
    const saveButton = await screen.findByRole('button', { name: '保存并运行准入探测' })
    await waitFor(() => expect((saveButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(saveButton)
    await screen.findAllByRole('option', { name: 'qwen3:8b · 局域网' })
    fireEvent.change(screen.getByLabelText('活动模型'), { target: { value: JSON.stringify([second.id, 'qwen3:8b']) } })
    await waitFor(() => expect(useAppStore.getState().modelProfiles.find((profile) => profile.id === useAppStore.getState().modelAssignments.general)?.connectionId).toBe('second'))
    expect((await desktop.listModelProfiles()).some((profile) => profile.connectionId === initial[0].id)).toBe(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await waitFor(() => expect((screen.getByLabelText('删除连接') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByLabelText('删除连接'))
    await screen.findByText('连接已删除')
    const remainingProfile = useAppStore.getState().modelProfiles.find((profile) => profile.id === useAppStore.getState().modelAssignments.general)
    expect(remainingProfile?.connectionId).not.toBe('second')
    expect((await desktop.listModelConnections()).map((connection) => connection.id)).not.toContain('second')
  })

  it('retains configured models after a discovery failure and asks for a new admission probe', async () => {
    vi.spyOn(desktop, 'discoverConnectionModels').mockResolvedValue({ ok: false, models: [], message: '服务返回 HTTP 401' })
    render(<SettingsPage />)
    await screen.findByText('服务返回 HTTP 401')
    expect(screen.getByText('需要重新探测')).toBeTruthy()
    expect((screen.getByLabelText('活动模型') as HTMLSelectElement).selectedOptions[0].textContent).toContain('qwen3:8b')
  })

  it('does not resurrect the last deleted connection or persist API keys in browser storage', async () => {
    const [connection] = await desktop.listModelConnections()
    await desktop.saveModelConnection({ ...connection, apiKey: 'test-secret-value' })
    expect(JSON.stringify(localStorage)).not.toContain('test-secret-value')
    await desktop.deleteModelConnection(connection.id)
    expect(await desktop.listModelConnections()).toEqual([])
    expect(await desktop.listModelProfiles()).toEqual([])
  })
})
