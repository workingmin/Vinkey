import { ArrowLeft, BadgeCheck, Bot, Check, ChevronDown, CircleAlert, Cloud, Cpu, PlugZap, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { deleteModelConnection, discoverConnectionModels, getLocalHardware, listModelConnections, listModelProfiles, probeModelAdmission, saveModelConnection, saveModelProfile } from '../lib/desktop'
import { hardwareSummary, hardwareTier, hardwareTierLabels, LOCAL_CONTEXT_WINDOW, LOCAL_HARDWARE_ADVICE, type LocalHardware } from '../lib/hardwareProfile'
import { formatServiceError } from '../lib/serviceError'
import { useAppStore } from '../store'
import type { ModelAdmissionResult, ModelConnection, ModelConnectionInput, ModelConnectionResult } from '../types'

type AdmissionState = ModelAdmissionResult & { testedAt?: number }
const REMOTE_CONTEXT_WINDOW = 8_192
const ADMISSION_CHECK_VERSION = 2
type PersistedProbe = {
  kind: ModelConnection['kind']
  baseUrl: string
  catalog: ModelConnectionResult
  admissions: Record<string, AdmissionState>
  admissionVersion: number
}

type ModelPickerOption = {
  value: string
  model: string
  connection: string
  pending?: boolean
}

type ModelMenuPosition = {
  placement: 'up' | 'down'
  style: CSSProperties
}

const PROBE_CACHE_KEY = 'vinkey.modelProbeCache'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isConnectionResult(value: unknown): value is ModelConnectionResult {
  return isRecord(value)
    && typeof value.ok === 'boolean'
    && typeof value.message === 'string'
    && Array.isArray(value.models)
    && value.models.every((model) => typeof model === 'string')
}

function isAdmissionState(value: unknown): value is AdmissionState {
  return isRecord(value)
    && typeof value.ok === 'boolean'
    && typeof value.message === 'string'
    && typeof value.model === 'string'
    && typeof value.structuredOutput === 'boolean'
    && typeof value.contextWindow === 'number'
    && (value.testedAt === undefined || typeof value.testedAt === 'number')
}

function emptyConnection(): ModelConnectionInput {
  return { id: crypto.randomUUID(), name: '本地 Ollama', kind: 'ollama', baseUrl: 'http://localhost:11434' }
}

function admissionKey(connectionId: string, model: string): string {
  return `${connectionId}::${model}`
}

function readProbeCache(): Record<string, PersistedProbe> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROBE_CACHE_KEY) ?? '{}')
    if (!isRecord(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).flatMap(([id, value]) => {
      if (!isRecord(value)
        || (value.kind !== 'ollama' && value.kind !== 'openai-compatible')
        || typeof value.baseUrl !== 'string'
        || !isConnectionResult(value.catalog)
        || !isRecord(value.admissions)) return []
      const admissions = value.admissionVersion === ADMISSION_CHECK_VERSION
        ? Object.fromEntries(Object.entries(value.admissions).filter((entry): entry is [string, AdmissionState] => isAdmissionState(entry[1])))
        : {}
      return [[id, { kind: value.kind, baseUrl: value.baseUrl, catalog: value.catalog, admissions, admissionVersion: ADMISSION_CHECK_VERSION }]]
    }))
  }
  catch { return {} }
}

function writeProbeCache(cache: Record<string, PersistedProbe>): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(PROBE_CACHE_KEY, JSON.stringify(cache)) } catch { /* optional cache; in-memory state remains authoritative */ }
}

function persistProbe(connection: ModelConnectionInput | ModelConnection, patch: Partial<PersistedProbe>): void {
  const cache = readProbeCache()
  const previous = cache[connection.id]
  cache[connection.id] = {
    kind: connection.kind,
    baseUrl: connection.baseUrl,
    catalog: patch.catalog ?? previous?.catalog ?? { ok: false, message: '尚未获取模型列表', models: [] },
    admissions: patch.admissions ?? previous?.admissions ?? {},
    admissionVersion: ADMISSION_CHECK_VERSION,
  }
  writeProbeCache(cache)
}

function removePersistedProbe(connectionId: string): void {
  const cache = readProbeCache()
  if (!(connectionId in cache)) return
  delete cache[connectionId]
  writeProbeCache(cache)
}

function ModelPicker({ value, options, disabled, onChange }: {
  value: string
  options: ModelPickerOption[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState<ModelMenuPosition>({ placement: 'down', style: {} })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const positionMenu = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const viewportMargin = 8
    const menuGap = 5
    const desiredHeight = Math.min(240, Math.max(52, options.length * 48 + 8))
    const availableBelow = window.innerHeight - rect.bottom - viewportMargin - menuGap
    const availableAbove = rect.top - viewportMargin - menuGap
    const placement = availableBelow >= Math.min(desiredHeight, 144) || availableBelow >= availableAbove ? 'down' : 'up'
    const availableHeight = placement === 'down' ? availableBelow : availableAbove
    const width = Math.min(rect.width, window.innerWidth - viewportMargin * 2)
    const left = Math.max(viewportMargin, Math.min(rect.left, window.innerWidth - width - viewportMargin))
    setMenuPosition({
      placement,
      style: {
        left,
        top: placement === 'down' ? rect.bottom + menuGap : rect.top - menuGap,
        width,
        maxHeight: Math.max(52, Math.min(240, availableHeight)),
      },
    })
  }, [options.length])

  const showMenu = (initialIndex?: number) => {
    if (disabled || options.length === 0) return
    setActiveIndex(initialIndex ?? (selectedIndex >= 0 ? selectedIndex : 0))
    positionMenu()
    setOpen(true)
  }

  const chooseOption = (index: number) => {
    const option = options[index]
    if (!option) return
    setOpen(false)
    if (option.value !== value) onChange(option.value)
    buttonRef.current?.focus()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      if (!open) {
        const fallback = event.key === 'ArrowDown' ? 0 : options.length - 1
        showMenu(selectedIndex >= 0 ? selectedIndex : fallback)
      } else {
        const offset = event.key === 'ArrowDown' ? 1 : -1
        setActiveIndex((index) => (index + offset + options.length) % options.length)
      }
      return
    }
    if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      chooseOption(activeIndex)
      return
    }
    if (open && event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
      return
    }
    if (open && event.key === 'End') {
      event.preventDefault()
      setActiveIndex(options.length - 1)
      return
    }
    if (open && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const reposition = () => positionMenu()
    document.addEventListener('mousedown', closeOnOutsideClick)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, positionMenu])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  return <div className="model-picker">
    <button
      ref={buttonRef}
      type="button"
      className="model-picker-trigger"
      role="combobox"
      aria-label="当前模型"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
      disabled={disabled || options.length === 0}
      onClick={() => open ? setOpen(false) : showMenu()}
      onKeyDown={onKeyDown}
    >
      <span className="model-picker-value">
        <strong>{selected?.model ?? '请选择模型'}</strong>
        <small>{selected?.connection ?? (options.length ? '选择已检查可用的模型' : '请先检查模型服务')}</small>
      </span>
      <ChevronDown className={open ? 'expanded' : ''} />
    </button>
    {open && createPortal(<div
      ref={menuRef}
      id={listboxId}
      className="model-picker-menu"
      role="listbox"
      aria-label="当前模型"
      data-placement={menuPosition.placement}
      style={menuPosition.style}
    >
      {options.map((option, index) => <div
        id={`${listboxId}-option-${index}`}
        key={option.value}
        className={`model-picker-option ${index === activeIndex ? 'active' : ''}`}
        role="option"
        aria-selected={option.value === value}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => chooseOption(index)}
      >
        <span><strong>{option.model}</strong><small>{option.connection}{option.pending ? ' · 需要检查' : ''}</small></span>
        {option.value === value && <Check />}
      </div>)}
    </div>, document.body)}
  </div>
}

export function SettingsPage() {
  const { modelProfiles: profiles, activeModelId, pendingChatRequests, chatRuns,
    setModelProfiles, setActiveModelId, setSettingsOpen } = useAppStore()
  const [connections, setConnections] = useState<ModelConnection[]>([])
  const [catalogs, setCatalogs] = useState<Record<string, ModelConnectionResult>>({})
  const [admissions, setAdmissions] = useState<Record<string, AdmissionState>>({})
  const [scanning, setScanning] = useState<string[]>([])
  const [admissionScanning, setAdmissionScanning] = useState<string[]>([])
  const [draft, setDraft] = useState<ModelConnectionInput>(emptyConnection)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [catalogExpandedId, setCatalogExpandedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const [hardware, setHardware] = useState<LocalHardware | null>(null)
  const [detectingHardware, setDetectingHardware] = useState(true)
  const alive = useRef(true)
  const selected = connections.find((connection) => connection.id === selectedId)
  const locked = busy || loading || pendingChatRequests > 0 || Object.keys(chatRuns).length > 0
  const formLocked = locked || Boolean(selectedId && scanning.includes(selectedId))
  const tier = hardwareTier(hardware)
  const activeProfile = profiles.find((profile) => profile.id === activeModelId) ?? profiles[0]
  const activeConnection = connections.find((connection) => connection.id === activeProfile?.connectionId)
  const selectedCatalog = selectedId ? catalogs[selectedId] : undefined
  const selectedAdmissions = selectedId && selectedCatalog?.ok
    ? selectedCatalog.models.map((model) => ({ model, state: admissions[admissionKey(selectedId, model)] }))
    : []

  const detectHardware = async () => {
    setDetectingHardware(true)
    try { const value = await getLocalHardware(); if (alive.current) setHardware(value) }
    catch { if (alive.current) setHardware(null) }
    finally { if (alive.current) setDetectingHardware(false) }
  }

  const scan = async (connection: ModelConnectionInput) => {
    setScanning((values) => values.includes(connection.id) ? values : [...values, connection.id])
    let result: ModelConnectionResult
    try { result = await discoverConnectionModels(connection) }
    catch (error) { result = { ok: false, message: String(error), models: [] } }
    if (alive.current) {
      setCatalogs((values) => ({ ...values, [connection.id]: result }))
      setAdmissions((values) => Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith(`${connection.id}::`))))
      setScanning((values) => values.filter((id) => id !== connection.id))
    }
    persistProbe(connection, { catalog: result, admissions: {} })
    return result
  }

  const probeModel = async (connection: ModelConnection, model: string) => {
    const key = admissionKey(connection.id, model)
    setAdmissions((values) => ({ ...values, [key]: { ok: false, message: '正在检查模型…', model, structuredOutput: false, contextWindow: connection.kind === 'ollama' ? LOCAL_CONTEXT_WINDOW : REMOTE_CONTEXT_WINDOW } }))
    try {
      const result = await probeModelAdmission({
        id: crypto.randomUUID(), connectionId: connection.id, name: `${connection.name} · ${model}`,
        kind: connection.kind, baseUrl: connection.baseUrl, model,
        contextWindow: connection.kind === 'ollama' ? LOCAL_CONTEXT_WINDOW : REMOTE_CONTEXT_WINDOW,
      })
      const admission = { ...result, testedAt: Date.now() }
      if (alive.current) setAdmissions((values) => ({ ...values, [key]: admission }))
      const cached = readProbeCache()[connection.id]
      persistProbe(connection, { admissions: { ...(cached?.admissions ?? {}), [model]: admission } })
      return result
    } catch (error) {
      const result: AdmissionState = { ok: false, message: formatServiceError(error), model, structuredOutput: false, contextWindow: connection.kind === 'ollama' ? LOCAL_CONTEXT_WINDOW : REMOTE_CONTEXT_WINDOW, testedAt: Date.now() }
      if (alive.current) setAdmissions((values) => ({ ...values, [key]: result }))
      const cached = readProbeCache()[connection.id]
      persistProbe(connection, { admissions: { ...(cached?.admissions ?? {}), [model]: result } })
      return result
    }
  }

  const probeConnection = async (connection: ModelConnection, models: string[]) => {
    if (models.length === 0 || admissionScanning.includes(connection.id)) return []
    setAdmissionScanning((values) => [...values, connection.id])
    const results: ModelAdmissionResult[] = []
    try {
      for (const model of models) results.push(await probeModel(connection, model))
      const profiles = await listModelProfiles()
      for (const result of results) {
        if (!result.ok) continue
        const profile = profiles.find((item) => item.connectionId === connection.id && item.model === result.model)
        if (profile && profile.contextWindow !== result.contextWindow) {
          await saveModelProfile({ ...profile, contextWindow: result.contextWindow })
        }
      }
      if (alive.current) setModelProfiles(await listModelProfiles())
      return results
    } finally {
      if (alive.current) setAdmissionScanning((values) => values.filter((id) => id !== connection.id))
    }
  }

  useEffect(() => {
    alive.current = true
    void detectHardware()
    let cancelled = false
    void (async () => {
      try {
        const values = await listModelConnections()
        const available = await listModelProfiles()
        if (cancelled) return
        setConnections(values)
        setModelProfiles(available)
        if (values[0]) { setSelectedId(values[0].id); setDraft(values[0]) }
        const cache = readProbeCache()
        const restoredCatalogs: Record<string, ModelConnectionResult> = {}
        const restoredAdmissions: Record<string, AdmissionState> = {}
        const pendingScans: ModelConnection[] = []
        for (const connection of values) {
          const cached = cache[connection.id]
          if (!cached || cached.kind !== connection.kind || cached.baseUrl !== connection.baseUrl) {
            pendingScans.push(connection)
            continue
          }
          restoredCatalogs[connection.id] = cached.catalog
          for (const [model, admission] of Object.entries(cached.admissions ?? {})) restoredAdmissions[admissionKey(connection.id, model)] = admission
        }
        setCatalogs(restoredCatalogs)
        setAdmissions(restoredAdmissions)
        await Promise.all(pendingScans.map(scan))
        if (!cancelled) setLoading(false)
      } catch (error) {
        if (!cancelled) { setNotice({ error: true, text: String(error) }); setLoading(false) }
      }
    })()
    return () => { cancelled = true; alive.current = false }
  }, [setModelProfiles])

  const discard = () => !dirty || window.confirm('放弃尚未保存的连接修改？')
  const close = () => { if (!busy && discard()) setSettingsOpen(false) }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const edit = (changes: Partial<ModelConnectionInput>) => { setDraft((value) => ({ ...value, ...changes })); setDirty(true); setNotice(null) }
  const chooseConnection = (connection?: ModelConnection) => {
    if (!discard()) return
    setSelectedId(connection?.id ?? null)
    setDraft(connection ?? emptyConnection())
    setCatalogExpandedId(null)
    setDirty(false)
    setNotice(null)
  }

  const addRemoteConnection = () => {
    if (locked || !discard()) return
    setSelectedId(null)
    setDraft({ id: crypto.randomUUID(), name: '远程 AI', kind: 'openai-compatible', baseUrl: '' })
    setDirty(false)
    setNotice(null)
    window.setTimeout(() => document.getElementById('base-url')?.focus(), 0)
  }

  const save = async () => {
    if (locked) return
    setBusy(true)
    setNotice(null)
    try {
      const url = new URL(draft.baseUrl.trim())
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请输入不含凭据、查询参数或片段的 HTTP / HTTPS 服务地址')
      if (!draft.name.trim()) throw new Error('服务名称不能为空')
      const saved = await saveModelConnection(draft)
      setConnections((values) => [saved, ...values.filter((value) => value.id !== saved.id)])
      setSelectedId(saved.id)
      setDraft(saved)
      setDirty(false)
      setModelProfiles(await listModelProfiles())
      const result = await scan(saved)
      if (result.ok) {
        const admissionResults = await probeConnection(saved, result.models)
        const passed = admissionResults.filter((admission) => admission.ok).length
        setNotice({ error: false, text: `服务已保存，${passed}/${result.models.length} 个模型可用` })
      } else {
        setNotice({ error: true, text: `服务已保存；获取模型列表失败：${result.message}` })
      }
    } catch (error) { setNotice({ error: true, text: String(error) }) }
    finally { setBusy(false) }
  }

  const remove = async (target: ModelConnection | undefined = selected) => {
    if (!target || locked || scanning.includes(target.id) || admissionScanning.includes(target.id) || !window.confirm(`删除服务“${target.name}”？该服务的凭据及模型配置将删除。`)) return
    setBusy(true)
    try {
      await deleteModelConnection(target.id)
      removePersistedProbe(target.id)
      const values = connections.filter((value) => value.id !== target.id)
      setConnections(values)
      setCatalogs((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== target.id)))
      setAdmissions((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${target.id}::`))))
      setModelProfiles(await listModelProfiles())
      const nextSelected = target.id === selectedId ? values[0] : connections.find((value) => value.id === selectedId)
      setSelectedId(nextSelected?.id ?? null)
      setDraft(nextSelected ?? emptyConnection())
      if (target.id === selectedId) setCatalogExpandedId(null)
      setDirty(false)
      setNotice({ error: false, text: '服务已删除' })
    } catch (error) { setNotice({ error: true, text: String(error) }) }
    finally { setBusy(false) }
  }

  const selectModel = async (value: string) => {
    if (locked || !value) return
    setBusy(true)
    setNotice(null)
    try {
      const [connectionId, model] = JSON.parse(value) as [string, string]
      const connection = connections.find((item) => item.id === connectionId)
      if (!connection) throw new Error('连接已不存在')
      const admission = admissions[admissionKey(connectionId, model)]
      if (!admission?.ok) throw new Error('该模型尚未完成检查')
      const available = await listModelProfiles()
      const existing = available.find((profile) => profile.connectionId === connection.id && profile.model === model)
      const profile = existing
        ? existing.contextWindow === admission.contextWindow
          ? existing
          : await saveModelProfile({ ...existing, contextWindow: admission.contextWindow })
        : await saveModelProfile({
          id: crypto.randomUUID(), connectionId: connection.id, name: `${connection.name} · ${model}`,
          kind: connection.kind, baseUrl: connection.baseUrl, model,
          contextWindow: admission.contextWindow,
        })
      setModelProfiles(await listModelProfiles())
      setActiveModelId(profile.id)
      setNotice({ error: false, text: `已切换到 ${model}` })
    } catch (error) { setNotice({ error: true, text: formatServiceError(error) }) }
    finally { setBusy(false) }
  }

  const availableModels = Object.entries(admissions)
    .filter(([, result]) => result.ok)
    .map(([key, result]) => {
      const [connectionId] = key.split('::')
      const connection = connections.find((item) => item.id === connectionId)
      return connection ? { connection, model: result.model } : null
    })
    .filter((value): value is { connection: ModelConnection; model: string } => Boolean(value))
  const activeValue = activeProfile && activeConnection ? JSON.stringify([activeConnection.id, activeProfile.model]) : ''
  const activeAdmission = activeProfile && activeConnection ? admissions[admissionKey(activeConnection.id, activeProfile.model)] : undefined
  const modelOptions: ModelPickerOption[] = [
    ...(activeProfile && activeConnection && !activeAdmission?.ok
      ? [{ value: activeValue, model: activeProfile.model, connection: activeConnection.name, pending: true }]
      : []),
    ...availableModels.map(({ connection, model }) => ({
      value: JSON.stringify([connection.id, model]), model, connection: connection.name,
    })),
  ]

  return <section className="settings-page" aria-label="模型设置">
    <header className="settings-toolbar"><div><h1>模型设置</h1><p>设置当前模型并管理模型服务</p></div><button className="icon-button" title="返回工作区" aria-label="返回工作区" disabled={busy} onClick={close}><ArrowLeft /></button></header>
    {notice && <div role={notice.error ? 'alert' : 'status'} className={`settings-notice ${notice.error ? 'failure' : ''}`}>{notice.error ? <CircleAlert /> : <Check />}<span>{notice.text}</span></div>}
    <div className="model-settings-scroll"><div className="settings-layout">
      <main className="settings-main">
        <section className="active-model-panel" aria-labelledby="active-model-title">
          <div className="settings-section-heading"><div><h2 id="active-model-title">当前模型</h2></div></div>
          <p className="section-description">对话、续写和改稿等功能均使用此模型。</p>
          <div className="active-model-row"><div className="active-model-icon"><Bot /></div><ModelPicker value={activeValue} options={modelOptions} disabled={locked} onChange={(value) => void selectModel(value)} /><div className={`admission-badge ${activeAdmission?.ok ? 'passed' : activeProfile ? 'pending' : ''}`}><span>{activeAdmission?.ok ? <BadgeCheck /> : <ShieldCheck />}</span>{activeAdmission?.ok ? '可用' : activeProfile ? '需要检查' : '未选择'}</div></div>
          <div className="active-model-meta"><span><PlugZap />{activeConnection?.name ?? '未选择服务'}</span>{activeAdmission?.ok && <span><Cpu />上下文已自动配置</span>}</div>
          {activeProfile && activeAdmission && !activeAdmission.ok && <p className="assignment-warning"><CircleAlert />模型检查未通过，部分功能可能无法正常使用。</p>}
        </section>
        <section className="model-connections" aria-labelledby="model-connections-title">
          <div className="settings-section-heading"><div><h2 id="model-connections-title">模型服务</h2></div><button className="secondary-button" disabled={locked} onClick={() => chooseConnection()}><Plus />添加服务</button></div>
          <div className="connection-workspace">
            <aside className="connection-list" aria-label="模型服务列表">
              {loading ? <p>正在读取服务...</p> : connections.length === 0 ? <p>暂无服务</p> : connections.map((connection) => {
                const catalog = catalogs[connection.id]
                const passed = catalog?.ok ? catalog.models.filter((model) => admissions[admissionKey(connection.id, model)]?.ok).length : 0
                return <div className={`connection-list-item ${connection.id === selectedId ? 'active' : ''}`} key={connection.id}>
                  <button type="button" className="connection-select" disabled={locked} onClick={() => chooseConnection(connection)}>
                    <PlugZap />
                    <span className="connection-copy"><b>{connection.name}</b><small>{connection.baseUrl}</small><small>{scanning.includes(connection.id) ? '正在获取模型列表…' : admissionScanning.includes(connection.id) ? '正在检查模型…' : catalog?.ok ? `${passed}/${catalog.models.length} 个模型可用` : '无法连接'}</small></span>
                  </button>
                  <div className="connection-item-actions">
                    <span className={`connection-dot ${catalog?.ok ? passed > 0 ? 'online' : 'warning' : ''}`} title={catalog?.ok ? passed > 0 ? '有可用模型' : '尚无可用模型' : '无法连接'} aria-label={catalog?.ok ? passed > 0 ? '有可用模型' : '尚无可用模型' : '无法连接'} />
                    <button type="button" className="icon-button connection-list-delete" title={`删除服务“${connection.name}”`} aria-label="删除服务" disabled={locked || scanning.includes(connection.id) || admissionScanning.includes(connection.id)} onClick={() => void remove(connection)}><Trash2 /></button>
                  </div>
                </div>
              })}
            </aside>
            <form className="connection-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
              <fieldset disabled={formLocked}>
                <div className="connection-form-heading"><div><h3>{selected ? '服务设置' : '添加服务'}</h3></div>{dirty && <small>未保存</small>}</div>
                <div className="field-grid"><div className="field-group"><label htmlFor="connection-name">名称</label><input id="connection-name" required value={draft.name} onChange={(event) => edit({ name: event.target.value })} /></div><div className="field-group"><label htmlFor="connection-kind">服务类型</label><select id="connection-kind" value={draft.kind} onChange={(event) => { const kind = event.target.value as ModelConnectionInput['kind']; edit({ kind, baseUrl: kind === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1' }) }}><option value="ollama">Ollama</option><option value="openai-compatible">OpenAI 兼容服务</option></select></div></div>
                <div className="field-group"><label htmlFor="base-url">服务地址</label><input id="base-url" type="url" required spellCheck={false} value={draft.baseUrl} onChange={(event) => edit({ baseUrl: event.target.value })} /></div>
                <div className="field-group"><label htmlFor="api-key">API 密钥</label><input id="api-key" type="password" autoComplete="off" placeholder={selected?.hasApiKey ? '已保存，留空不会更改' : '没有密钥可留空'} value={draft.apiKey ?? ''} onChange={(event) => edit({ apiKey: event.target.value, clearApiKey: false })} />{selected?.hasApiKey && <label className="checkbox-label"><input type="checkbox" checked={Boolean(draft.clearApiKey)} onChange={(event) => edit({ clearApiKey: event.target.checked, apiKey: '' })} />删除已保存的密钥</label>}</div>
              </fieldset>
              {selected ? <div className="connection-catalog">
                <header><div className="connection-catalog-title"><h3>模型列表 <span>{selectedCatalog?.ok ? selectedCatalog.models.length : 0}</span></h3></div>
                  <button type="button" className="secondary-button catalog-toggle" aria-expanded={catalogExpandedId === selected.id} onClick={() => setCatalogExpandedId((value) => value === selected.id ? null : selected.id)}><ChevronDown />{catalogExpandedId === selected.id ? '收起模型列表' : '查看模型列表'}</button>
                  <button type="submit" className="primary-button catalog-save" disabled={formLocked}><Save />{busy ? '保存中...' : '保存并检查模型'}</button>
                </header>
                {catalogExpandedId === selected.id && <div className="connection-catalog-body">
                  <div className="connection-catalog-actions"><button type="button" className="icon-button" title="刷新模型列表" aria-label="刷新模型列表" disabled={locked || dirty || scanning.includes(selected.id)} onClick={() => void scan(selected)}><RefreshCw className={scanning.includes(selected.id) ? 'spinning' : ''} /></button><button type="button" className="secondary-button" disabled={locked || dirty || !selectedCatalog?.ok || !selectedCatalog.models.length || admissionScanning.includes(selected.id)} onClick={() => void probeConnection(selected, selectedCatalog!.models).catch((error) => setNotice({ error: true, text: formatServiceError(error) }))}><ShieldCheck />检查全部模型</button></div>
                  {scanning.includes(selected.id) ? <p role="status">正在获取模型列表…</p> : !selectedCatalog?.ok ? <p className="assignment-warning" role="status">{selectedCatalog?.message ?? '尚未获取模型列表'}</p> : selectedCatalog.models.length === 0 ? <p>没有找到模型</p> : <ul>{selectedAdmissions.map(({ model, state }) => <li key={model}><Bot /><span><strong>{model}</strong><small>{state?.message ?? '尚未检查'}</small></span><span className={`admission-status ${state?.ok ? 'passed' : state ? 'failed' : 'idle'}`}>{state?.ok ? <><BadgeCheck />可用</> : state ? <><CircleAlert />不可用</> : '待检查'}</span></li>)}</ul>}
                </div>}
              </div> : <div className="settings-actions"><span /><button type="submit" className="primary-button" disabled={formLocked}><Save />{busy ? '保存中...' : '保存并检查模型'}</button></div>}
            </form>
          </div>
        </section>
      </main>
      <aside className="settings-sidebar"><section className="settings-side-panel" aria-labelledby="hardware-title"><div className="settings-section-heading"><div><h2 id="hardware-title">本机配置</h2></div><button type="button" className="icon-button" aria-label="重新检测本机配置" title="重新检测本机配置" disabled={detectingHardware || locked} onClick={() => void detectHardware()}><RefreshCw className={detectingHardware ? 'spinning' : ''} /></button></div><div className="hardware-tier-large"><Cpu /><div><strong>{detectingHardware ? '检测中…' : hardwareTierLabels[tier]}</strong><span>{hardwareSummary(hardware)}</span></div></div>{!detectingHardware && (tier === 'insufficient' || tier === 'unknown') && <div className="hardware-advice" role={tier === 'insufficient' ? 'alert' : 'status'}><CircleAlert /><span>{tier === 'insufficient' ? LOCAL_HARDWARE_ADVICE : '无法确认本机内存或独立显存。'}</span><button type="button" className="secondary-button" disabled={locked} onClick={addRemoteConnection}><Cloud />添加远程服务</button></div>}</section></aside>
    </div></div>
  </section>
}
