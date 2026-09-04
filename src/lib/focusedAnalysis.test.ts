import { describe, expect, it } from 'vitest'
import type { ContextDocument, WorkspaceSnapshot } from '../types'
import { estimateTokens } from './context'
import { buildFocusedWorkspaceMessage } from './focusedAnalysis'

const workspace: WorkspaceSnapshot = {
  id: 'workspace-1',
  name: 'Vinkey',
  pathLabel: '/private/Vinkey',
  entries: [{ name: 'README.md', path: 'README.md', kind: 'file', children: [], documentKind: 'markdown' }],
}

describe('focused workspace analysis context', () => {
  it('includes bounded high-signal excerpts without absolute paths', () => {
    const documents: ContextDocument[] = [{
      path: 'README.md', name: 'README.md', kind: 'markdown', content: '本地 AI 创作工作台', size: 11,
    }]
    const message = buildFocusedWorkspaceMessage(workspace, documents, 8_192)
    expect(message).toContain('focused-project-evidence')
    expect(message).toContain('本地 AI 创作工作台')
    expect(message).toContain('README.md')
    expect(message).not.toContain(workspace.pathLabel)
  })

  it('clips excerpts to a bounded share of the model context', () => {
    const documents: ContextDocument[] = [{
      path: 'README.md', name: 'README.md', kind: 'markdown', content: '正文'.repeat(20_000), size: 40_000,
    }]
    const message = buildFocusedWorkspaceMessage(workspace, documents, 4_096)
    expect(message).toContain('"truncated": true')
    expect(estimateTokens(message)).toBeLessThan(2_400)
  })
})
