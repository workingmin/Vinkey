import { describe, expect, it } from 'vitest'
import { buildWorkspaceInventory, parseEvidenceReferences, readWorkspaceDocuments, selectWorkspaceAnalysisTargets, verifyEvidenceReferences } from './workspaceAnalysis'
import type { WorkspaceSnapshot } from '../types'

const workspace: WorkspaceSnapshot = {
  id: 'workspace-1', name: 'demo', pathLabel: '/tmp/demo', entries: [
    { name: '故事.md', path: '故事.md', kind: 'file', children: [], documentKind: 'markdown' },
    { name: '.env', path: '.env', kind: 'file', children: [], documentKind: 'code' },
    { name: '图.png', path: '图.png', kind: 'file', children: [], documentKind: 'image' },
  ],
}

describe('workspace analysis inventory and evidence', () => {
  it('separates supported, sensitive and unsupported files', () => {
    const inventory = buildWorkspaceInventory(workspace)
    expect(inventory.supported.map((item) => item.path)).toEqual(['故事.md'])
    expect(inventory.excluded.map((item) => item.reason)).toEqual(['sensitive', 'unsupported'])
  })

  it('reads only supported files and reports read failures', async () => {
    const result = await readWorkspaceDocuments(workspace, async (path) => {
      if (path === '故事.md') return { path, name: '故事.md', content: '第一行\n第二行', kind: 'markdown' as const }
      throw new Error('unreachable')
    })
    expect(result.documents).toHaveLength(1)
    expect(result.excluded).toHaveLength(2)
  })

  it('does not admit oversized files into the model context', async () => {
    const result = await readWorkspaceDocuments({ ...workspace, entries: [{ name: 'large.md', path: 'large.md', kind: 'file', children: [], documentKind: 'markdown' }] }, async (path) => ({
      path, name: 'large.md', content: 'x', kind: 'markdown' as const, sizeBytes: 70 * 1024 * 1024,
    }))
    expect(result.documents).toHaveLength(0)
    expect(result.excluded[0].reason).toBe('too-large')
  })

  it('keeps targeted and exhaustive coverage separate', () => {
    const supported = Array.from({ length: 30 }, (_, index) => ({ path: `章节/${index + 1}.md`, name: `${index + 1}.md`, kind: 'markdown' as const, reason: 'supported' as const }))
    expect(selectWorkspaceAnalysisTargets(supported, '深入分析章节/29.md', 'targeted').map((item) => item.path)).toEqual(['章节/29.md'])
    expect(selectWorkspaceAnalysisTargets(supported, '深入分析这个项目', 'targeted')).toHaveLength(24)
    expect(selectWorkspaceAnalysisTargets(supported, '完整通读这个项目', 'exhaustive')).toHaveLength(30)
  })

  it('prioritizes high-signal project documents for an unqualified deep analysis', () => {
    const supported = [
      { path: '章节/第一章.md', name: '第一章.md', kind: 'markdown' as const, reason: 'supported' as const },
      { path: '项目简介.md', name: '项目简介.md', kind: 'markdown' as const, reason: 'supported' as const },
      { path: '设定/人物.md', name: '人物.md', kind: 'markdown' as const, reason: 'supported' as const },
    ]
    expect(selectWorkspaceAnalysisTargets(supported, '分析这个项目', 'targeted').map((item) => item.path)).toEqual([
      '项目简介.md', '设定/人物.md', '章节/第一章.md',
    ])
  })

  it('parses and verifies source line evidence', () => {
    const refs = parseEvidenceReferences('[source: 故事.md chunk=chunk-0 lines=1-2 quote="第一行"]')
    const verified = verifyEvidenceReferences(refs, [{ path: '故事.md', name: '故事.md', content: '第一行\n第二行', size: 11 }])
    expect(verified[0]).toMatchObject({ sourceId: '故事.md', lineStart: 1, lineEnd: 2, verified: true })
    expect(verifyEvidenceReferences(parseEvidenceReferences('[source: 故事.md lines=4-4]'), [{ path: '故事.md', name: '故事.md', content: '第一行', size: 3 }])[0].verified).toBe(false)
  })
})
