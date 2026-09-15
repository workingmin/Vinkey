// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { useAppStore } from '../store'
import * as desktop from '../lib/desktop'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(desktop, 'getLocalHardware').mockResolvedValue({ platform: 'macos', architecture: 'aarch64', totalMemoryBytes: 16 * 1024 ** 3, gpuMemoryBytes: null, unifiedMemory: true })
  useAppStore.setState({ modelProfiles: [], activeModelId: null, pendingChatRequests: 0, chatRuns: {} })
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
    expect((await screen.findAllByText('qwen3:14b')).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: '当前模型' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '当前模型' })).toBeTruthy()
    expect(screen.queryByRole('spinbutton', { name: '上下文长度' })).toBeNull()
  })

  it('warns below minimum and opens a remote connection without saving it', async () => {
    vi.spyOn(desktop, 'getLocalHardware').mockResolvedValue({ platform: 'macos', architecture: 'aarch64', totalMemoryBytes: 8 * 1024 ** 3, gpuMemoryBytes: null, unifiedMemory: true })
    render(<SettingsPage />)
    expect((await screen.findAllByText('低于最低配置')).length).toBeGreaterThan(0)
    const remoteButton = screen.getByRole('button', { name: '添加远程服务' })
    await waitFor(() => expect((remoteButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(remoteButton)
    await waitFor(() => expect((screen.getByLabelText('服务类型') as HTMLSelectElement).value).toBe('openai-compatible'))
    expect((screen.getByLabelText('服务地址') as HTMLInputElement).value).toBe('')
    expect(await desktop.listModelConnections()).toHaveLength(1)
  })

  it('shows admission controls for a remote Ollama connection', async () => {
    vi.spyOn(desktop, 'getLocalHardware').mockRejectedValue(new Error('probe failed'))
    await desktop.saveModelConnection({ id: 'remote', name: '远程推理', kind: 'ollama', baseUrl: 'http://192.168.1.8:11434' })
    render(<SettingsPage />)
    expect((await screen.findAllByText('硬件未确认')).length).toBeGreaterThan(0)
    fireEvent.click(await screen.findByRole('button', { name: '查看模型列表' }))
    expect(await screen.findByRole('button', { name: '检查全部模型' })).toBeTruthy()
  })

  it('discovers models and selects one active model', async () => {
    render(<SettingsPage />)
    const saveButton = await screen.findByRole('button', { name: '保存并检查模型' })
    await waitFor(() => expect((screen.getByRole('button', { name: '保存并检查模型' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '保存并检查模型' }))
    const activeModel = screen.getByRole('combobox', { name: '当前模型' }) as HTMLButtonElement
    await waitFor(() => expect(activeModel.disabled).toBe(false))
    fireEvent.click(activeModel)
    fireEvent.click(await screen.findByRole('option', { name: /openbmb\/minicpm4\.1:latest.*Ollama · 浏览器演示/ }))
    await waitFor(() => expect(screen.getByText('已切换到 openbmb/minicpm4.1:latest')).toBeTruthy())
    const state = useAppStore.getState()
    expect(state.modelProfiles.find((profile) => profile.id === state.activeModelId)?.model).toBe('openbmb/minicpm4.1:latest')
  })

  it('keeps same-name models from different connections distinct and reconciles a deleted active model', async () => {
    const initial = await desktop.listModelConnections()
    const second = await desktop.saveModelConnection({ id: 'second', name: '局域网', kind: 'ollama', baseUrl: 'http://192.168.1.8:11434' })
    render(<SettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /局域网.*192\.168/ }))
    await waitFor(() => expect((screen.getByLabelText('服务地址') as HTMLInputElement).value).toBe('http://192.168.1.8:11434'))
    const saveButton = await screen.findByRole('button', { name: '保存并检查模型' })
    await waitFor(() => expect((saveButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(saveButton)
    await screen.findByText('服务已保存，3/3 个模型可用', undefined, { timeout: 5000 })
    const secondActiveModel = screen.getByRole('combobox', { name: '当前模型' }) as HTMLButtonElement
    await waitFor(() => expect(secondActiveModel.disabled).toBe(false))
    fireEvent.click(secondActiveModel)
    fireEvent.click(await screen.findByRole('option', { name: /qwen3:8b.*局域网/ }))
    await waitFor(() => expect(useAppStore.getState().modelProfiles.find((profile) => profile.id === useAppStore.getState().activeModelId)?.connectionId).toBe('second'))
    expect((await desktop.listModelProfiles()).some((profile) => profile.connectionId === initial[0].id)).toBe(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const deleteSecond = screen.getByTitle('删除服务“局域网”')
    await waitFor(() => expect((deleteSecond as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(deleteSecond)
    await screen.findByText('服务已删除')
    const remainingProfile = useAppStore.getState().modelProfiles.find((profile) => profile.id === useAppStore.getState().activeModelId)
    expect(remainingProfile?.connectionId).not.toBe('second')
    expect((await desktop.listModelConnections()).map((connection) => connection.id)).not.toContain('second')
  })

  it('retains configured models after a discovery failure and asks for a new admission probe', async () => {
    vi.spyOn(desktop, 'discoverConnectionModels').mockResolvedValue({ ok: false, models: [], message: '服务返回 HTTP 401' })
    render(<SettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: '查看模型列表' }))
    await screen.findByText('服务返回 HTTP 401')
    expect(screen.getByText('需要检查')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '当前模型' }).textContent).toContain('qwen3:8b')
  })

  it('opens the model list upward only when the window has more room above', async () => {
    render(<SettingsPage />)
    const picker = screen.getByRole('combobox', { name: '当前模型' }) as HTMLButtonElement
    await waitFor(() => expect(picker.disabled).toBe(false))
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(500)
    vi.spyOn(picker, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 440, top: 440, bottom: 486, left: 100, right: 400, width: 300, height: 46,
      toJSON: () => ({}),
    })

    fireEvent.click(picker)
    expect((await screen.findByRole('listbox', { name: '当前模型' })).dataset.placement).toBe('up')
    fireEvent.keyDown(picker, { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: '当前模型' })).toBeNull()
  })

  it('restores the model catalog from cache when settings are reopened', async () => {
    const discover = vi.spyOn(desktop, 'discoverConnectionModels').mockResolvedValue({ ok: true, models: ['cached-model'], message: '' })
    const firstView = render(<SettingsPage />)
    await screen.findByText('0/1 个模型可用')
    expect(discover).toHaveBeenCalledTimes(1)

    firstView.unmount()
    discover.mockClear()
    render(<SettingsPage />)

    await screen.findByText('0/1 个模型可用')
    expect(discover).not.toHaveBeenCalled()
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
