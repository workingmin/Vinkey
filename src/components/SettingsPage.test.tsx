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
  it('shows the local tier and applies its model choices to existing profiles', async () => {
    vi.spyOn(desktop, 'getLocalHardware').mockResolvedValue({ platform: 'macos', architecture: 'aarch64', totalMemoryBytes: 32 * 1024 ** 3, gpuMemoryBytes: null, unifiedMemory: true })
    vi.spyOn(desktop, 'discoverConnectionModels').mockResolvedValue({ ok: true, message: '', models: ['qwen3:8b', 'qwen3:14b', 'qwen3:32b'] })
    const [connection] = await desktop.listModelConnections()
    await desktop.saveModelProfile({ id: 'large', connectionId: connection.id, name: '14B', kind: 'ollama', baseUrl: connection.baseUrl, model: 'qwen3:14b', contextWindow: 4096 })
    render(<SettingsPage />)
    await screen.findByText('标准配置')
    const smart = await screen.findByRole('button', { name: '智能分配' })
    await waitFor(() => expect((smart as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(smart)
    await screen.findByText('已从“Ollama · 浏览器演示”分配两类功能模型')
    const state = useAppStore.getState()
    expect(state.modelProfiles.find((profile) => profile.id === state.modelAssignments.general)).toMatchObject({ model: 'qwen3:14b', contextWindow: 16384 })
  })

  it('warns below minimum and opens a remote connection without saving it', async () => {
    vi.spyOn(desktop, 'getLocalHardware').mockResolvedValue({ platform: 'macos', architecture: 'aarch64', totalMemoryBytes: 8 * 1024 ** 3, gpuMemoryBytes: null, unifiedMemory: true })
    render(<SettingsPage />)
    await screen.findByText('低于最低配置')
    expect((screen.getByRole('button', { name: '智能分配' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '添加远程连接' }))
    expect((screen.getByLabelText('接口类型') as HTMLSelectElement).value).toBe('openai-compatible')
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('')
    expect(await desktop.listModelConnections()).toHaveLength(1)
  })

  it('does not apply the local hardware gate to a remote Ollama connection', async () => {
    vi.spyOn(desktop, 'getLocalHardware').mockRejectedValue(new Error('probe failed'))
    await desktop.saveModelConnection({ id: 'remote', name: '远程推理', kind: 'ollama', baseUrl: 'http://192.168.1.8:11434' })
    render(<SettingsPage />)
    await screen.findByText('硬件未确认')
    const smart = await screen.findByRole('button', { name: '智能分配' })
    await waitFor(() => expect((smart as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(smart)
    await screen.findByText('已从“远程推理”分配两类功能模型')
  })
  it('discovers models, assigns both roles, and shows their source', async () => {
    render(<SettingsPage />)
    const smart = await screen.findByRole('button', { name: '智能分配' })
    await waitFor(() => expect((smart as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(smart)
    await screen.findByText('已从“Ollama · 浏览器演示”分配两类功能模型')
    const state = useAppStore.getState()
    expect(state.modelProfiles.find((profile) => profile.id === state.modelAssignments.efficient)?.model).toBe('openbmb/minicpm4.1:latest')
    expect(state.modelProfiles.find((profile) => profile.id === state.modelAssignments.general)?.model).toBe('qwen3:8b')
    expect(screen.getAllByText('http://localhost:11434').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByLabelText('模型')).toBeNull()
    expect(screen.queryByText('外观')).toBeNull()
  })

  it('keeps same-name models from different connections distinct and removes deleted assignments', async () => {
    const initial = await desktop.listModelConnections()
    const second = await desktop.saveModelConnection({ id: 'second', name: '局域网', kind: 'ollama', baseUrl: 'http://192.168.1.8:11434' })
    render(<SettingsPage />)
    await screen.findAllByRole('option', { name: 'qwen3:8b · 局域网' })
    fireEvent.change(screen.getByLabelText('综合创作模型'), { target: { value: JSON.stringify([second.id, 'qwen3:8b']) } })
    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.modelProfiles.find((profile) => profile.id === state.modelAssignments.general)?.connectionId).toBe('second')
    })
    expect((await desktop.listModelProfiles()).some((profile) => profile.connectionId === initial[0].id)).toBe(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await waitFor(() => expect((screen.getByLabelText('删除连接') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByLabelText('删除连接'))
    await screen.findByText('连接已删除')
    expect(useAppStore.getState().modelAssignments.general).toBeNull()
    expect((await desktop.listModelConnections()).map((connection) => connection.id)).not.toContain('second')
  })

  it('retains configured models after a discovery failure and disables smart assignment', async () => {
    vi.spyOn(desktop, 'discoverConnectionModels').mockResolvedValue({ ok: false, models: [], message: '服务返回 HTTP 401' })
    render(<SettingsPage />)
    await screen.findByText('服务返回 HTTP 401')
    expect((screen.getByRole('button', { name: '智能分配' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('综合创作模型') as HTMLSelectElement).selectedOptions[0].textContent).toContain('qwen3:8b')
    expect(screen.getByText('模型可用性尚未确认')).toBeTruthy()
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
