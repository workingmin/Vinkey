import { ArrowLeft, Bot, Check, ChevronDown, CircleAlert, Cloud, PlugZap, Plus, RefreshCw, Save, Sparkles, Square, Trash2, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { deleteModelConnection, discoverConnectionModels, getLocalHardware, isDesktop, listModelConnections, listModelProfiles, saveModelConnection, saveModelProfile, stopOllamaModel } from '../lib/desktop'
import { isLocalOllamaProfile, recommendModel, type ModelGroupRole } from '../lib/modelGroups'
import { hardwareSummary, hardwareTier, hardwareTierLabels, isLocalModelConnection, LOCAL_CONTEXT_WINDOW, LOCAL_HARDWARE_ADVICE, recommendLocalModel, type LocalHardware } from '../lib/hardwareProfile'
import { formatServiceError } from '../lib/serviceError'
import { useAppStore } from '../store'
import type { ModelConnection, ModelConnectionInput, ModelConnectionResult, ModelProfile } from '../types'

function emptyConnection(): ModelConnectionInput {
  return { id: crypto.randomUUID(), name: '本地 Ollama', kind: 'ollama', baseUrl: 'http://localhost:11434' }
}

const roles = [
  { id: 'efficient', name: '轻量高效', description: '提取、摘要与分块分析', icon: Zap },
  { id: 'general', name: '综合创作', description: '对话、主笔、润色与审校', icon: Sparkles },
] as const

export function SettingsPage() {
  const { modelProfiles: profiles, modelAssignments, autoStopOllamaModels, pendingChatRequests, chatRuns,
    setModelProfiles, setModelAssignment, setAutoStopOllamaModels, setSettingsOpen } = useAppStore()
  const [connections, setConnections] = useState<ModelConnection[]>([])
  const [catalogs, setCatalogs] = useState<Record<string, ModelConnectionResult>>({})
  const [scanning, setScanning] = useState<string[]>([])
  const [draft, setDraft] = useState<ModelConnectionInput>(emptyConnection)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const [hardware, setHardware] = useState<LocalHardware | null>(null)
  const [detectingHardware, setDetectingHardware] = useState(true)
  const alive = useRef(true)
  const selected = connections.find((connection) => connection.id === selectedId)
  const locked = busy || loading || pendingChatRequests > 0 || Object.keys(chatRuns).length > 0
  const tier = hardwareTier(hardware)
  const selectedIsLocal = isLocalModelConnection(selected)
  const hasLocalAssignments = roles.some(({ id }) => isLocalModelConnection(profiles.find((profile) => profile.id === modelAssignments[id])))
  const showHardware = selectedIsLocal || hasLocalAssignments

  const detectHardware = async () => {
    setDetectingHardware(true)
    try { const value = await getLocalHardware(); if (alive.current) setHardware(value) }
    catch { if (alive.current) setHardware(null) }
    finally { if (alive.current) setDetectingHardware(false) }
  }

  const scan = async (connection: ModelConnectionInput) => {
    setScanning((values) => [...values, connection.id])
    let result: ModelConnectionResult
    try { result = await discoverConnectionModels(connection) }
    catch (error) { result = { ok: false, message: String(error), models: [] } }
    if (alive.current) {
      setCatalogs((values) => ({ ...values, [connection.id]: result }))
      setScanning((values) => values.filter((id) => id !== connection.id))
    }
    return result
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
        setLoading(false)
        await Promise.all(values.map(scan))
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
      setNotice({ error: !result.ok, text: result.ok ? `连接已保存，发现 ${result.models.length} 个模型` : `连接已保存；获取模型失败：${result.message}` })
    } catch (error) { setNotice({ error: true, text: String(error) }) }
    finally { setBusy(false) }
  }

  const remove = async () => {
    if (!selected || locked || !window.confirm(`删除连接“${selected.name}”？该连接的凭据及模型配置将删除，相关功能分配会清空。`)) return
    setBusy(true)
    try {
      await deleteModelConnection(selected.id)
      const values = connections.filter((value) => value.id !== selected.id)
      setConnections(values)
      setCatalogs((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== selected.id)))
      setModelProfiles(await listModelProfiles())
      setSelectedId(values[0]?.id ?? null)
      setDraft(values[0] ?? emptyConnection())
      setDirty(false)
      setNotice({ error: false, text: '连接已删除' })
    } catch (error) { setNotice({ error: true, text: String(error) }) }
    finally { setBusy(false) }
  }

  const saveAssignment = async (role: ModelGroupRole, connection: ModelConnection, model: string, contextWindow?: number) => {
    const available = await listModelProfiles()
    const existing = available.find((profile) => profile.connectionId === connection.id && profile.model === model)
    const profile = existing
      ? contextWindow && existing.contextWindow !== contextWindow ? await saveModelProfile({ ...existing, contextWindow }) : existing
      : await saveModelProfile({
      id: crypto.randomUUID(), connectionId: connection.id, name: `${connection.name} · ${model}`,
      kind: connection.kind, baseUrl: connection.baseUrl, model, contextWindow: contextWindow ?? (connection.kind === 'ollama' ? LOCAL_CONTEXT_WINDOW : 32768),
    })
    setModelProfiles(await listModelProfiles())
    setModelAssignment(role, profile.id)
  }

  const assign = async (role: ModelGroupRole, value: string) => {
    if (locked) return
    if (!value) { setModelAssignment(role, null); return }
    setBusy(true)
    setNotice(null)
    try {
      const [connectionId, model] = JSON.parse(value) as [string, string]
      const connection = connections.find((item) => item.id === connectionId)
      if (!connection) throw new Error('连接已不存在')
      await saveAssignment(role, connection, model)
    } catch (error) { setNotice({ error: true, text: String(error) }) }
    finally { setBusy(false) }
  }

  const smartAssign = async () => {
    if (!selected || locked || dirty) return
    if (selectedIsLocal && (detectingHardware || tier === 'unknown' || tier === 'insufficient')) {
      setNotice({ error: true, text: tier === 'insufficient' ? LOCAL_HARDWARE_ADVICE : '硬件信息未确认，请重新检测或手动选择模型。' })
      return
    }
    const models = catalogs[selected.id]?.ok ? catalogs[selected.id].models : []
    setBusy(true)
    try {
      const assignments = roles.map((role) => ({
        role: role.id,
        model: selectedIsLocal ? recommendLocalModel(models, role.id, tier) : recommendModel(models, role.id),
      }))
      if (assignments.some(({ model }) => !model)) throw new Error(selectedIsLocal
        ? '此连接没有适合本机档位的已知模型。请安装 Q4 量化的 openbmb/minicpm4.1:latest 或 qwen3:8b，或手动选择模型。'
        : '此连接没有可用于创作的模型')
      for (const { role, model } of assignments) {
        await saveAssignment(role, selected, model!, selectedIsLocal ? LOCAL_CONTEXT_WINDOW : undefined)
      }
      setNotice({ error: false, text: `已从“${selected.name}”分配两类功能模型` })
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
    setBusy(true)
    try {
      const local = profiles.filter((profile) => profile.connectionId === selectedId && isLocalOllamaProfile(profile))
      for (const profile of local) await stopOllamaModel(profile.id)
      setNotice({ error: false, text: '已停止此连接中配置的本机模型' })
    } catch (error) { setNotice({ error: true, text: String(error) }) }
    finally { setBusy(false) }
  }

  const availableCount = Object.values(catalogs).reduce((count, result) => count + (result.ok ? result.models.length : 0), 0)
  const selectedCatalog = selectedId ? catalogs[selectedId] : undefined

  return <section className="settings-page" aria-label="模型设置">
    <header className="settings-toolbar">
      <div><h1>模型与连接</h1><p>{isDesktop() ? '设置' : '浏览器演示'} · {connections.length} 个连接 · {availableCount} 个可用模型</p></div>
      <button className="icon-button" title="返回工作区" aria-label="返回工作区" disabled={busy} onClick={close}><ArrowLeft /></button>
    </header>
    {notice && <div role={notice.error ? 'alert' : 'status'} className={`settings-notice ${notice.error ? 'failure' : ''}`}>{notice.error ? <CircleAlert /> : <Check />}<span>{notice.text}</span></div>}
    <div className="model-settings-scroll">
      <section className="model-assignments" aria-labelledby="model-assignments-title">
        <div className="settings-section-heading"><div className="model-tier-heading"><h2 id="model-assignments-title">功能模型</h2>{showHardware && <span className={`model-tier tier-${tier}`} title="依据硬件容量估算，单模型运行；不代表实际推理测试结果">{detectingHardware ? '检测硬件中' : hardwareTierLabels[tier]}</span>}</div>{locked && !loading && <small>{busy ? '正在保存...' : '任务运行中'}</small>}</div>
        {showHardware && <div className="hardware-summary"><span>{hardwareSummary(hardware)}</span><button type="button" className="icon-button" aria-label="重新检测硬件" title="重新检测硬件" disabled={detectingHardware || locked} onClick={() => void detectHardware()}><RefreshCw /></button></div>}
        {showHardware && !detectingHardware && (tier === 'insufficient' || tier === 'unknown') && <div className="hardware-advice" role={tier === 'insufficient' ? 'alert' : 'status'}><CircleAlert /><span>{tier === 'insufficient' ? LOCAL_HARDWARE_ADVICE : '无法确认本机内存或独立显存，暂不自动分配本地模型。可重新检测、手动配置或添加远程连接。'}</span><button type="button" className="secondary-button" disabled={locked} onClick={addRemoteConnection}><Cloud />添加远程连接</button></div>}
        <div className="model-assignment-grid">
          {roles.map(({ id, name, description, icon: Icon }) => {
            const profile = profiles.find((item) => item.id === modelAssignments[id])
            const source = connections.find((item) => item.id === profile?.connectionId)
            const value = profile ? JSON.stringify([profile.connectionId, profile.model]) : ''
            const listed = source && catalogs[source.id]?.ok && catalogs[source.id].models.includes(profile?.model ?? '')
            return <article className={`model-assignment ${id}`} key={id}>
              <header><Icon /><div><h3>{name}</h3><p>{description}</p></div><span className={profile ? 'configured' : ''}>{profile ? '已配置' : '未配置'}</span></header>
              <label className="assignment-select"><select aria-label={`${name}模型`} value={value} disabled={locked} onChange={(event) => void assign(id, event.target.value)}>
                <option value="">未配置</option>
                {profile && !listed && <option value={value}>{profile.model}（当前配置）</option>}
                {connections.map((connection) => <optgroup key={connection.id} label={`${connection.name} · ${connection.baseUrl}`}>
                  {(catalogs[connection.id]?.ok ? catalogs[connection.id].models : []).map((model) => <option key={model} value={JSON.stringify([connection.id, model])}>{model} · {connection.name}</option>)}
                </optgroup>)}
              </select><ChevronDown /></label>
              <div className="assignment-source"><PlugZap /><div><strong>{source?.name ?? '未选择连接'}</strong><span>{source?.baseUrl ?? profile?.baseUrl ?? '无连接来源'}</span></div></div>
              {profile && source && !listed && !scanning.includes(source.id) && <small className="assignment-warning"><CircleAlert />{catalogs[source.id]?.ok ? '服务列表中未找到当前模型' : '模型可用性尚未确认'}</small>}
              {profile && <details className="assignment-advanced"><summary>运行参数</summary><label>上下文窗口<input key={`${profile.id}:${profile.contextWindow}`} aria-label={`${name}上下文窗口`} type="number" min={2048} max={2000000} step={1024} defaultValue={profile.contextWindow} disabled={locked} onBlur={(event) => void updateContext(profile, Number(event.target.value))} />tokens</label></details>}
            </article>
          })}
        </div>
      </section>

      <section className="model-connections" aria-labelledby="model-connections-title">
        <div className="settings-section-heading"><h2 id="model-connections-title">模型连接</h2><button className="secondary-button" disabled={locked} onClick={() => chooseConnection()}><Plus />新增连接</button></div>
        <div className="connection-workspace">
          <aside className="connection-list" aria-label="连接列表">
            {loading ? <p>正在读取连接...</p> : connections.length === 0 ? <p>暂无连接</p> : connections.map((connection) => <button key={connection.id} disabled={busy} className={connection.id === selectedId ? 'active' : ''} onClick={() => chooseConnection(connection)}>
              <PlugZap /><span><b>{connection.name}</b><small>{connection.baseUrl}</small><small>{scanning.includes(connection.id) ? '获取模型中...' : catalogs[connection.id]?.ok ? `${catalogs[connection.id].models.length} 个模型` : '连接不可用'}</small></span>
              <span className={`connection-dot ${catalogs[connection.id]?.ok ? 'online' : ''}`} />
            </button>)}
          </aside>
          <form className="connection-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
            <fieldset disabled={locked || Boolean(selectedId && scanning.includes(selectedId))}>
              <div className="connection-form-heading"><h3>{selected ? '连接详情' : '新增连接'}</h3>{dirty && <small>未保存</small>}</div>
              <div className="field-grid">
                <div className="field-group"><label htmlFor="connection-name">连接名称</label><input id="connection-name" required value={draft.name} onChange={(event) => edit({ name: event.target.value })} /></div>
                <div className="field-group"><label htmlFor="connection-kind">接口类型</label><select id="connection-kind" value={draft.kind} onChange={(event) => { const kind = event.target.value as ModelConnectionInput['kind']; edit({ kind, baseUrl: kind === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1' }) }}><option value="ollama">Ollama</option><option value="openai-compatible">OpenAI 兼容</option></select></div>
              </div>
              <div className="field-group"><label htmlFor="base-url">Base URL</label><input id="base-url" type="url" required spellCheck={false} value={draft.baseUrl} onChange={(event) => edit({ baseUrl: event.target.value })} /></div>
              <div className="field-group"><label htmlFor="api-key">API Key</label><input id="api-key" type="password" autoComplete="off" placeholder={selected?.hasApiKey ? '已保存；留空保持不变' : '可选'} value={draft.apiKey ?? ''} onChange={(event) => edit({ apiKey: event.target.value, clearApiKey: false })} />{selected?.hasApiKey && <label className="checkbox-label"><input type="checkbox" checked={Boolean(draft.clearApiKey)} onChange={(event) => edit({ clearApiKey: event.target.checked, apiKey: '' })} />删除已保存的密钥</label>}</div>
              <div className="settings-actions"><button type="button" className="icon-button connection-delete" title="删除连接" aria-label="删除连接" disabled={!selected} onClick={() => void remove()}><Trash2 /></button><span /><button type="submit" className="primary-button"><Save />{busy ? '保存中...' : '保存并获取模型'}</button></div>
            </fieldset>
            {selected && <div className="connection-catalog">
              <header><h3>可用模型 <span>{selectedCatalog?.ok ? selectedCatalog.models.length : 0}</span></h3><button type="button" className="icon-button" title="刷新模型列表" aria-label="刷新模型列表" disabled={locked || dirty || scanning.includes(selected.id)} onClick={() => void scan(selected)}><RefreshCw className={scanning.includes(selected.id) ? 'spinning' : ''} /></button><button type="button" className="secondary-button" disabled={locked || dirty || !selectedCatalog?.ok || !selectedCatalog.models.length || scanning.includes(selected.id) || (selectedIsLocal && (detectingHardware || tier === 'unknown' || tier === 'insufficient'))} onClick={() => void smartAssign()}><Sparkles />智能分配</button></header>
              {scanning.includes(selected.id) ? <p role="status">正在获取模型...</p> : !selectedCatalog?.ok ? <p className="assignment-warning" role="status">{selectedCatalog?.message ?? '尚未获取模型'}</p> : selectedCatalog.models.length === 0 ? <p>服务未返回模型</p> : <ul>{selectedCatalog.models.map((model) => <li key={model}><Bot /><span>{model}</span>{roles.filter((role) => profiles.some((profile) => profile.id === modelAssignments[role.id] && profile.connectionId === selected.id && profile.model === model)).map((role) => <small key={role.id}>{role.name}</small>)}</li>)}</ul>}
            </div>}
          </form>
        </div>
      </section>
      <div className="model-runtime-preference"><label htmlFor="auto-stop-ollama-models">切换时自动停止旧的本机 Ollama 模型</label><label className="toggle-switch"><input id="auto-stop-ollama-models" type="checkbox" checked={autoStopOllamaModels} onChange={(event) => setAutoStopOllamaModels(event.target.checked)} /><span aria-hidden="true" /></label>{selected && isLocalOllamaProfile(selected) && <button className="secondary-button" disabled={locked || !profiles.some((profile) => profile.connectionId === selected.id)} onClick={() => void stopModels()}><Square />停止驻留</button>}</div>
    </div>
  </section>
}
