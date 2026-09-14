import { ArrowLeft, BadgeCheck, Bot, Check, ChevronDown, CircleAlert, Cloud, Cpu, PlugZap, Plus, RefreshCw, Save, ShieldCheck, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { deleteModelConnection, discoverConnectionModels, getLocalHardware, isDesktop, listModelConnections, listModelProfiles, probeModelAdmission, saveModelConnection, saveModelProfile, stopOllamaModel } from '../lib/desktop'
import { isLocalOllamaProfile } from '../lib/modelGroups'
import { hardwareSummary, hardwareTier, hardwareTierLabels, LOCAL_CONTEXT_WINDOW, LOCAL_HARDWARE_ADVICE, type LocalHardware } from '../lib/hardwareProfile'
import { formatServiceError } from '../lib/serviceError'
import { useAppStore } from '../store'
import type { ModelAdmissionResult, ModelConnection, ModelConnectionInput, ModelConnectionResult, ModelProfile } from '../types'

type AdmissionState = ModelAdmissionResult & { testedAt?: number }

function emptyConnection(): ModelConnectionInput {
  return { id: crypto.randomUUID(), name: '本地 Ollama', kind: 'ollama', baseUrl: 'http://localhost:11434' }
}

function admissionKey(connectionId: string, model: string): string {
  return `${connectionId}::${model}`
}

export function SettingsPage() {
  const { modelProfiles: profiles, modelAssignments, activeModelId, autoStopOllamaModels, pendingChatRequests, chatRuns,
    setModelProfiles, setModelAssignment, setActiveModelId, setAutoStopOllamaModels, setSettingsOpen } = useAppStore()
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
  const activeProfile = profiles.find((profile) => profile.id === activeModelId)
    ?? profiles.find((profile) => profile.id === modelAssignments.general)
    ?? profiles[0]
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
    return result
  }

  const probeModel = async (connection: ModelConnection, model: string) => {
    const key = admissionKey(connection.id, model)
    setAdmissions((values) => ({ ...values, [key]: { ok: false, message: '正在探测结构化输出…', model, structuredOutput: false, contextWindow: connection.kind === 'ollama' ? LOCAL_CONTEXT_WINDOW : 32768 } }))
    try {
      const result = await probeModelAdmission({
        id: crypto.randomUUID(), connectionId: connection.id, name: `${connection.name} · ${model}`,
        kind: connection.kind, baseUrl: connection.baseUrl, model,
        contextWindow: connection.kind === 'ollama' ? LOCAL_CONTEXT_WINDOW : 32768,
      })
      if (alive.current) setAdmissions((values) => ({ ...values, [key]: { ...result, testedAt: Date.now() } }))
      return result
    } catch (error) {
      const result: AdmissionState = { ok: false, message: formatServiceError(error), model, structuredOutput: false, contextWindow: connection.kind === 'ollama' ? LOCAL_CONTEXT_WINDOW : 32768, testedAt: Date.now() }
      if (alive.current) setAdmissions((values) => ({ ...values, [key]: result }))
      return result
    }
  }

  const probeConnection = async (connection: ModelConnection, models: string[]) => {
    if (models.length === 0 || admissionScanning.includes(connection.id)) return []
    setAdmissionScanning((values) => [...values, connection.id])
    const results: ModelAdmissionResult[] = []
    for (const model of models) results.push(await probeModel(connection, model))
    if (alive.current) setAdmissionScanning((values) => values.filter((id) => id !== connection.id))
    return results
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
        await Promise.all(values.map(scan))
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
      if (!draft.name.trim()) throw new Error('连接名称不能为空')
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
        setNotice({ error: false, text: `连接已保存，${passed}/${result.models.length} 个模型通过准入探测` })
      } else {
        setNotice({ error: true, text: `连接已保存；获取模型失败：${result.message}` })
      }
    } catch (error) { setNotice({ error: true, text: String(error) }) }
    finally { setBusy(false) }
  }

  const remove = async (target: ModelConnection | undefined = selected) => {
    if (!target || locked || !window.confirm(`删除连接“${target.name}”？该连接的凭据及模型配置将删除。`)) return
    setBusy(true)
    try {
      await deleteModelConnection(target.id)
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
      setNotice({ error: false, text: '连接已删除' })
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
      if (!admission?.ok) throw new Error('该模型尚未通过模型准入探测')
      const available = await listModelProfiles()
      const existing = available.find((profile) => profile.connectionId === connection.id && profile.model === model)
      const profile = existing ?? await saveModelProfile({
        id: crypto.randomUUID(), connectionId: connection.id, name: `${connection.name} · ${model}`,
        kind: connection.kind, baseUrl: connection.baseUrl, model,
        contextWindow: connection.kind === 'ollama' ? LOCAL_CONTEXT_WINDOW : 32768,
      })
      setModelProfiles(await listModelProfiles())
      setModelAssignment('efficient', profile.id)
      setModelAssignment('general', profile.id)
      setActiveModelId(profile.id)
      setNotice({ error: false, text: `已启用 ${model}，Skill 将根据任务类型调整处理方式` })
    } catch (error) { setNotice({ error: true, text: formatServiceError(error) }) }
    finally { setBusy(false) }
  }

  const updateContext = async (profile: ModelProfile, value: number) => {
    if (locked || value === profile.contextWindow) return
    if (!Number.isInteger(value) || value < 2048 || value > 2000000) { setNotice({ error: true, text: '上下文窗口必须在 2048 到 2000000 之间' }); return }
    setBusy(true)
    try { await saveModelProfile({ ...profile, contextWindow: value }); setModelProfiles(await listModelProfiles()) }
    catch (error) { setNotice({ error: true, text: String(error) }) }
    finally { setBusy(false) }
  }

  const stopModels = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const local = profiles.filter((profile) => profile.connectionId === selected.id && isLocalOllamaProfile(profile))
      for (const profile of local) await stopOllamaModel(profile.id)
      setNotice({ error: false, text: '已停止此连接中配置的本机模型' })
    } catch (error) { setNotice({ error: true, text: String(error) }) }
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

  return <section className="settings-page" aria-label="模型设置">
    <header className="settings-toolbar"><div><span className="settings-eyebrow">MODEL RUNTIME</span><h1>模型与连接</h1><p>{isDesktop() ? '统一模型入口 · 通过准入探测后才可用于工作区' : '浏览器演示 · 统一模型入口'}</p></div><button className="icon-button" title="返回工作区" aria-label="返回工作区" disabled={busy} onClick={close}><ArrowLeft /></button></header>
    {notice && <div role={notice.error ? 'alert' : 'status'} className={`settings-notice ${notice.error ? 'failure' : ''}`}>{notice.error ? <CircleAlert /> : <Check />}<span>{notice.text}</span></div>}
    <div className="model-settings-scroll"><div className="settings-layout">
      <main className="settings-main">
        <section className="active-model-panel" aria-labelledby="active-model-title">
          <div className="settings-section-heading"><div><span className="section-kicker">ACTIVE MODEL</span><h2 id="active-model-title">功能模型</h2></div><span className={`model-tier tier-${tier}`}>{detectingHardware ? '检测硬件中' : hardwareTierLabels[tier]}</span></div>
          <p className="section-description">轻量高效、综合创作等场景由 Skill 调整，所有功能共用一个通过准入探测的模型。</p>
          <div className="active-model-row"><div className="active-model-icon"><Bot /></div><label className="assignment-select"><span className="sr-only">活动模型</span><select aria-label="活动模型" value={activeValue} disabled={locked} onChange={(event) => void selectModel(event.target.value)}><option value="">尚未启用模型</option>{activeProfile && !activeAdmission?.ok && <option value={activeValue}>{activeProfile.model}（当前未通过探测）</option>}{availableModels.map(({ connection, model }) => <option key={`${connection.id}:${model}`} value={JSON.stringify([connection.id, model])}>{model} · {connection.name}</option>)}</select><ChevronDown /></label><div className={`admission-badge ${activeAdmission?.ok ? 'passed' : activeProfile ? 'pending' : ''}`}><span>{activeAdmission?.ok ? <BadgeCheck /> : <ShieldCheck />}</span>{activeAdmission?.ok ? '准入通过' : activeProfile ? '需要重新探测' : '等待选择'}</div></div>
          <div className="active-model-meta"><span><PlugZap />{activeConnection?.name ?? '未选择连接'}</span><span><Cpu />{activeProfile ? `${activeProfile.contextWindow.toLocaleString()} tokens` : '上下文窗口待配置'}</span><span><ShieldCheck />严格 JSON Schema 输出</span></div>
          {activeProfile && activeAdmission && !activeAdmission.ok && <p className="assignment-warning"><CircleAlert />当前模型未通过准入探测，无法保证长文本任务的结构化输出。</p>}
          {activeProfile && <details className="assignment-advanced"><summary>运行参数</summary><label>上下文窗口<input key={`${activeProfile.id}:${activeProfile.contextWindow}`} aria-label="活动模型上下文窗口" type="number" min={2048} max={2000000} step={1024} defaultValue={activeProfile.contextWindow} disabled={locked} onBlur={(event) => void updateContext(activeProfile, Number(event.target.value))} />tokens</label></details>}
        </section>
        <section className="model-connections" aria-labelledby="model-connections-title">
          <div className="settings-section-heading"><div><span className="section-kicker">PROVIDERS</span><h2 id="model-connections-title">模型连接</h2></div><button className="secondary-button" disabled={locked} onClick={() => chooseConnection()}><Plus />新增连接</button></div>
          <div className="connection-workspace">
            <aside className="connection-list" aria-label="连接列表">
              {loading ? <p>正在读取连接...</p> : connections.length === 0 ? <p>暂无连接</p> : connections.map((connection) => {
                const catalog = catalogs[connection.id]
                const passed = catalog?.ok ? catalog.models.filter((model) => admissions[admissionKey(connection.id, model)]?.ok).length : 0
                return <div className={`connection-list-item ${connection.id === selectedId ? 'active' : ''}`} key={connection.id}>
                  <button type="button" className="connection-select" disabled={locked} onClick={() => chooseConnection(connection)}>
                    <PlugZap />
                    <span><b>{connection.name}</b><small>{connection.baseUrl}</small><small>{scanning.includes(connection.id) ? '正在获取模型…' : admissionScanning.includes(connection.id) ? '正在进行准入探测…' : catalog?.ok ? `${passed}/${catalog.models.length} 个模型准入通过` : '连接不可用'}</small></span>
                    <span className={`connection-dot ${catalog?.ok ? passed > 0 ? 'online' : 'warning' : ''}`} />
                  </button>
                  <button type="button" className="icon-button connection-list-delete" title={`删除连接“${connection.name}”`} aria-label="删除连接" disabled={locked} onClick={() => void remove(connection)}><Trash2 /></button>
                </div>
              })}
            </aside>
            <form className="connection-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
              <fieldset disabled={formLocked}>
                <div className="connection-form-heading"><div><span className="section-kicker">CONNECTION</span><h3>{selected ? '连接详情' : '新增连接'}</h3></div>{dirty && <small>未保存</small>}</div>
                <div className="field-grid"><div className="field-group"><label htmlFor="connection-name">连接名称</label><input id="connection-name" required value={draft.name} onChange={(event) => edit({ name: event.target.value })} /></div><div className="field-group"><label htmlFor="connection-kind">接口类型</label><select id="connection-kind" value={draft.kind} onChange={(event) => { const kind = event.target.value as ModelConnectionInput['kind']; edit({ kind, baseUrl: kind === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1' }) }}><option value="ollama">Ollama</option><option value="openai-compatible">OpenAI 兼容</option></select></div></div>
                <div className="field-group"><label htmlFor="base-url">Base URL</label><input id="base-url" type="url" required spellCheck={false} value={draft.baseUrl} onChange={(event) => edit({ baseUrl: event.target.value })} /></div>
                <div className="field-group"><label htmlFor="api-key">API Key</label><input id="api-key" type="password" autoComplete="off" placeholder={selected?.hasApiKey ? '已保存；留空保持不变' : '可选'} value={draft.apiKey ?? ''} onChange={(event) => edit({ apiKey: event.target.value, clearApiKey: false })} />{selected?.hasApiKey && <label className="checkbox-label"><input type="checkbox" checked={Boolean(draft.clearApiKey)} onChange={(event) => edit({ clearApiKey: event.target.checked, apiKey: '' })} />删除已保存的密钥</label>}</div>
                <div className="settings-actions"><span /><button type="submit" className="primary-button" disabled={formLocked}><Save />{busy ? '保存中...' : '保存并运行准入探测'}</button></div>
              </fieldset>
              {selected && <div className="connection-catalog">
                <header><div><span className="section-kicker">MODEL CATALOG</span><h3>模型准入 <span>{selectedCatalog?.ok ? selectedCatalog.models.length : 0}</span></h3></div>
                  <button type="button" className="secondary-button catalog-toggle" aria-expanded={catalogExpandedId === selected.id} onClick={() => setCatalogExpandedId((value) => value === selected.id ? null : selected.id)}><ChevronDown />{catalogExpandedId === selected.id ? '收起模型列表' : '查看模型列表'}</button>
                </header>
                {catalogExpandedId === selected.id && <div className="connection-catalog-body">
                  <div className="connection-catalog-actions"><button type="button" className="icon-button" title="刷新模型列表" aria-label="刷新模型列表" disabled={locked || dirty || scanning.includes(selected.id)} onClick={() => void scan(selected)}><RefreshCw className={scanning.includes(selected.id) ? 'spinning' : ''} /></button><button type="button" className="secondary-button" disabled={locked || dirty || !selectedCatalog?.ok || !selectedCatalog.models.length || admissionScanning.includes(selected.id)} onClick={() => void probeConnection(selected, selectedCatalog!.models)}><ShieldCheck />重新探测</button></div>
                  {scanning.includes(selected.id) ? <p role="status">正在获取模型列表…</p> : !selectedCatalog?.ok ? <p className="assignment-warning" role="status">{selectedCatalog?.message ?? '尚未获取模型'}</p> : selectedCatalog.models.length === 0 ? <p>服务未返回模型</p> : <ul>{selectedAdmissions.map(({ model, state }) => <li key={model}><Bot /><span><strong>{model}</strong><small>{state?.message ?? '尚未探测结构化输出能力'}</small></span><span className={`admission-status ${state?.ok ? 'passed' : state ? 'failed' : 'idle'}`}>{state?.ok ? <><BadgeCheck />通过</> : state ? <><CircleAlert />未通过</> : '待探测'}</span></li>)}</ul>}
                </div>}
              </div>}
            </form>
          </div>
        </section>
      </main>
      <aside className="settings-sidebar"><section className="settings-side-panel" aria-labelledby="hardware-title"><div className="settings-section-heading"><div><span className="section-kicker">DEVICE</span><h2 id="hardware-title">运行环境</h2></div><button type="button" className="icon-button" aria-label="重新检测硬件" title="重新检测硬件" disabled={detectingHardware || locked} onClick={() => void detectHardware()}><RefreshCw className={detectingHardware ? 'spinning' : ''} /></button></div><div className="hardware-tier-large"><Cpu /><div><strong>{detectingHardware ? '检测中…' : hardwareTierLabels[tier]}</strong><span>{hardwareSummary(hardware)}</span></div></div>{!detectingHardware && (tier === 'insufficient' || tier === 'unknown') && <div className="hardware-advice" role={tier === 'insufficient' ? 'alert' : 'status'}><CircleAlert /><span>{tier === 'insufficient' ? LOCAL_HARDWARE_ADVICE : '无法确认本机内存或独立显存。'}</span><button type="button" className="secondary-button" disabled={locked} onClick={addRemoteConnection}><Cloud />添加远程连接</button></div>}</section><section className="settings-side-panel runtime-panel" aria-labelledby="runtime-title"><div className="settings-section-heading"><div><span className="section-kicker">RUNTIME</span><h2 id="runtime-title">运行策略</h2></div></div><div className="runtime-policy-row"><div><strong>单模型运行</strong><span>Skill 根据场景调整提示词与流程</span></div><span className="policy-check"><Check /></span></div><div className="runtime-policy-row"><div><strong>自动释放旧模型</strong><span>切换连接时降低内存压力</span></div><label className="toggle-switch"><input id="auto-stop-ollama-models" type="checkbox" checked={autoStopOllamaModels} onChange={(event) => setAutoStopOllamaModels(event.target.checked)} /><span aria-hidden="true" /></label></div>{selected && isLocalOllamaProfile(selected) && <button className="secondary-button runtime-stop" disabled={locked || !profiles.some((profile) => profile.connectionId === selected.id)} onClick={() => void stopModels()}><Square />停止驻留模型</button>}</section><section className="settings-side-panel admission-policy"><ShieldCheck /><div><strong>准入标准</strong><p>连接可用、上下文达标，并能返回严格 JSON Schema 结构化结果。</p></div></section></aside>
    </div></div>
  </section>
}
