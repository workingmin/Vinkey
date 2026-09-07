import { describe, expect, it } from 'vitest'
import { applyDiffProposal, createDiffProposal, fingerprintDocument } from './diffProposal'
import type { EditorRevisionRequest } from '../types'

const request: EditorRevisionRequest = {
  path: 'chapter.md', documentName: 'chapter.md', from: 2, to: 4, text: '旧句',
  instruction: '润色', sourceModifiedMs: 1, sourceFingerprint: fingerprintDocument('前-旧句-后'),
}

describe('editor selection DiffProposal', () => {
  it('parses the only model-controlled field', () => {
    const proposal = createDiffProposal('```json\n{"replacementText":"新句"}\n```', request, 'proposal-1')
    expect(proposal).toMatchObject({ id: 'proposal-1', path: 'chapter.md', from: 2, to: 4, text: '旧句', replacementText: '新句' })
  })

  it('rejects model attempts to change the authoritative target', () => {
    expect(() => createDiffProposal('{"path":"other.md","replacementText":"新句"}', request)).toThrow('只能包含 replacementText')
  })

  it('applies only when the original range still matches', () => {
    const proposal = createDiffProposal('{"replacementText":"新句"}', request, 'proposal-2')
    expect(applyDiffProposal('前-旧句-后', proposal)).toBe('前-新句-后')
    expect(() => applyDiffProposal('前-已变-后', proposal)).toThrow('源文档已变化')
  })
})
