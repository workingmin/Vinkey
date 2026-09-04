import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../types'
import { buildSelectedDocumentsOverviewMessage, buildWorkspaceOverviewMessage, buildWorkspaceProfile, formatWorkspaceOverview } from './workspaceOverview'

const workspace: WorkspaceSnapshot = {
  id: 'workspace-1',
  name: '雾港计划',
  pathLabel: '/Users/private/雾港计划',
  entries: [{
    name: '章节', path: '章节', kind: 'directory', children: [
      { name: '第一章.md', path: '章节/第一章.md', kind: 'file', children: [], documentKind: 'markdown' },
    ],
  }, { name: '.env', path: '.env', kind: 'file', children: [], documentKind: 'code' }],
}

describe('workspace overview context', () => {
  it('builds a project profile from the tree without absolute paths or bodies', () => {
    const profile = buildWorkspaceProfile(workspace)
    const message = buildWorkspaceOverviewMessage(workspace)
    expect(profile).toMatchObject({ name: '雾港计划', directoryCount: 1, fileCount: 2, analyzableFileCount: 1 })
    expect(message).toContain('章节/第一章.md')
    expect(message).not.toContain(workspace.pathLabel)
    expect(message).not.toContain('.env')
    expect(message).not.toMatch(/"(?:content|text|chunk|preview|quote)"\s*:/u)
  })

  it('formats a deterministic answer without requiring a model or digest', () => {
    const result = formatWorkspaceOverview(workspace)
    expect(result).toContain('项目：雾港计划')
    expect(result).toContain('目录：1 个')
    expect(result).toContain('`章节/第一章.md`')
    expect(result).toContain('未读取文件正文')
    expect(result).not.toContain('.env')
  })

  it('ignores selected document bodies', () => {
    const secretBody = '这段正文绝不能进入概览请求'
    const documents = [{
      path: '正文.md', name: '正文.md', kind: 'markdown', size: secretBody.length, sizeBytes: 42, content: secretBody,
    }] as const
    const message = buildSelectedDocumentsOverviewMessage(documents)
    expect(message).toContain('"sizeBytes": 42')
    expect(message).not.toContain(secretBody)
    expect(message).not.toMatch(/"(?:content|text|chunk|preview|quote)"\s*:/u)
  })
})
