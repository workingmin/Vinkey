import { ArrowLeft, Bot, Check, Palette, PlugZap, Plus, Save, Settings, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { deleteModelProfile, listModelProfiles, saveModelProfile, testModelConnection } from '../lib/desktop'
import { useAppStore } from '../store'
import type { ModelConnectionResult, ModelProfileInput, ProviderKind } from '../types'

function emptyProfile(kind: ProviderKind = 'ollama'): ModelProfileInput {
  return {
    id: crypto.randomUUID(),
    name: kind === 'ollama' ? '本地 Ollama' : 'OpenAI 兼容模型',
    kind,
    baseUrl: kind === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1',
    model: kind === 'ollama' ? 'qwen2.5:7b' : '',
    contextWindow: 32768,
  }
}

export function SettingsPage() {
  const profiles = useAppStore((state) => state.modelProfiles)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const theme = useAppStore((state) => state.theme)
  const setProfiles = useAppStore((state) => state.setModelProfiles)
  const setActiveModelId = useAppStore((state) => state.setActiveModelId)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setTheme = useAppStore((state) => state.setTheme)
  const setError = useAppStore((state) => state.setError)
  const [section, setSection] = useState<'models' | 'general'>('models')
  const [selectedId, setSelectedId] = useState(activeModelId)
  const [draft, setDraft] = useState<ModelProfileInput>(() => emptyProfile())
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connection, setConnection] = useState<ModelConnectionResult | null>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [setSettingsOpen])

  const selected = useMemo(() => profiles.find((profile) => profile.id === selectedId), [profiles, selectedId])
  useEffect(() => {
    if (!selected) return
    setDraft({
      id: selected.id, name: selected.name, kind: selected.kind, baseUrl: selected.baseUrl,
      model: selected.model, contextWindow: selected.contextWindow,
    })
    setConnection(null)
  }, [selected])

  const reload = async (preferredId?: string) => {
    const values = await listModelProfiles()
    setProfiles(values)
    const next = preferredId ?? values[0]?.id ?? null
    setSelectedId(next)
    if (next) setActiveModelId(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      const profile = await saveModelProfile(draft)
      setDraft({ ...draft, apiKey: undefined, clearApiKey: undefined })
      await reload(profile.id)
    } catch (error) { setError(String(error)) } finally { setSaving(false) }
  }

  const test = async () => {
    setTesting(true)
    setConnection(null)
    try { setConnection(await testModelConnection(draft)) }
    catch (error) { setConnection({ ok: false, message: String(error), models: [] }) }
    finally { setTesting(false) }
  }

  const remove = async () => {
    if (!selected || !window.confirm(`删除模型配置“${selected.name}”？系统凭据库中的 API Key 也会删除。`)) return
    try { await deleteModelProfile(selected.id); await reload() } catch (error) { setError(String(error)) }
  }

  const changeKind = (kind: ProviderKind) => {
    const next = emptyProfile(kind)
    setDraft({ ...draft, kind, baseUrl: next.baseUrl, model: next.model, name: next.name })
    setConnection(null)
  }

  return <section className="settings-page">
    <aside className="settings-nav">
      <div className="settings-heading"><Settings /><span>设置</span></div>
      <button className={section === 'models' ? 'active' : ''} onClick={() => setSection('models')}><Bot />模型</button>
      <button className={section === 'general' ? 'active' : ''} onClick={() => setSection('general')}><Palette />外观</button>
    </aside>
    <div className="settings-content">
      <header className="settings-toolbar">
        <div><h1>{section === 'models' ? '模型与连接' : '外观'}</h1><p>{section === 'models' ? '配置本机、局域网或 OpenAI 兼容模型服务' : '界面偏好仅保存在本机'}</p></div>
        <button className="icon-button" title="返回工作区" aria-label="返回工作区" onClick={() => setSettingsOpen(false)}><ArrowLeft /></button>
      </header>
      {section === 'general' ? <div className="settings-form narrow">
        <div className="setting-row">
          <div><label>主题</label><small>可随时切换，不影响文档内容</small></div>
          <div className="segmented large"><button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>深色</button><button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>浅色</button></div>
        </div>
      </div> : <div className="model-settings-layout">
        <aside className="profile-list">
          <button className="add-profile" onClick={() => { setSelectedId(null); setDraft(emptyProfile()); setConnection(null) }}><Plus />新增配置</button>
          {profiles.map((profile) => <button key={profile.id} className={selectedId === profile.id ? 'active' : ''} onClick={() => setSelectedId(profile.id)}>
            <span className={`provider-mark ${profile.kind}`}><Bot /></span><span><b>{profile.name}</b><small>{profile.model}</small></span>{profile.id === activeModelId && <Check />}
          </button>)}
        </aside>
        <div className="settings-form">
          <div className="field-group"><label>接口类型</label><div className="segmented large"><button className={draft.kind === 'ollama' ? 'active' : ''} onClick={() => changeKind('ollama')}>Ollama</button><button className={draft.kind === 'openai-compatible' ? 'active' : ''} onClick={() => changeKind('openai-compatible')}>OpenAI 兼容</button></div></div>
          <div className="field-grid">
            <div className="field-group"><label htmlFor="profile-name">配置名称</label><input id="profile-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
            <div className="field-group"><label htmlFor="context-window">上下文窗口</label><input id="context-window" type="number" min="2048" max="2000000" step="1024" value={draft.contextWindow} onChange={(event) => setDraft({ ...draft, contextWindow: Number(event.target.value) })} /></div>
          </div>
          <div className="field-group"><label htmlFor="base-url">Base URL</label><input id="base-url" spellCheck={false} value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /><small>{draft.kind === 'ollama' ? '示例：http://localhost:11434 或局域网 Ollama 地址' : '示例：https://api.openai.com/v1、LM Studio 或 vLLM 地址'}</small></div>
          <div className="field-group"><label htmlFor="model-name">模型</label><input id="model-name" list="detected-models" spellCheck={false} value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} /><datalist id="detected-models">{connection?.models.map((model) => <option key={model} value={model} />)}</datalist></div>
          {draft.kind === 'openai-compatible' && <div className="field-group"><label htmlFor="api-key">API Key</label><input id="api-key" type="password" autoComplete="off" placeholder={selected?.hasApiKey ? '已保存在系统凭据库；留空保持不变' : '本机服务可留空'} value={draft.apiKey ?? ''} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value, clearApiKey: false })} /><small>不会写入 SQLite、前端存储或日志</small>{selected?.hasApiKey && <label className="checkbox-label"><input type="checkbox" checked={Boolean(draft.clearApiKey)} onChange={(event) => setDraft({ ...draft, clearApiKey: event.target.checked, apiKey: '' })} />删除已保存的 API Key</label>}</div>}
          {connection && <div className={`connection-result ${connection.ok ? 'success' : 'failure'}`}><span>{connection.ok ? <Check /> : <X />}</span><div><b>{connection.message}</b>{connection.models.length > 0 && <small>可用模型：{connection.models.slice(0, 8).join('、')}{connection.models.length > 8 ? ` 等 ${connection.models.length} 个` : ''}</small>}</div></div>}
          <div className="settings-actions">
            {selected && <button className="danger-button" onClick={() => void remove()}><Trash2 />删除</button>}
            <span />
            <button className="secondary-button" disabled={testing} onClick={() => void test()}><PlugZap />{testing ? '测试中...' : '测试连接'}</button>
            <button className="primary-button" disabled={saving} onClick={() => void save()}><Save />{saving ? '保存中...' : '保存并启用'}</button>
          </div>
        </div>
      </div>}
    </div>
  </section>
}
