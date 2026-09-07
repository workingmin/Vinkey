import { describe, expect, it } from 'vitest'
import {
  applyDiffProposal, applyDiffProposalSet, buildMultiFileRevisionContract,
  buildMultiFileRevisionTargets, createDiffProposal, createMultiFileDiffProposals, fingerprintDocument,
} from './diffProposal'
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

  it('creates locally-authoritative multi-file chunk proposals', () => {
    const targets = buildMultiFileRevisionTargets([
      { path: 'a.md', name: 'a.md', content: '甲'.repeat(700), size: 700 },
      { path: 'b.md', name: 'b.md', content: '乙段', size: 2 },
    ], '润色', 'set-1', 500)
    expect(targets.map((target) => target.targetId)).toEqual([
      'document-1-chunk-1', 'document-1-chunk-2', 'document-2-chunk-1',
    ])
    expect(buildMultiFileRevisionContract(targets)).toContain('targetId')
    const proposals = createMultiFileDiffProposals(
      '{"replacements":[{"targetId":"document-1-chunk-2","replacementText":"新甲"},{"targetId":"document-2-chunk-1","replacementText":"新乙"}]}',
      targets,
      (() => { let index = 0; return () => `proposal-${++index}` })(),
    )
    expect(proposals.map((proposal) => [proposal.id, proposal.path, proposal.proposalSetId])).toEqual([
      ['proposal-1', 'a.md', 'set-1'], ['proposal-2', 'b.md', 'set-1'],
    ])
  })

  it('rejects unknown multi-file targets and overlapping proposal ranges', () => {
    const targets = buildMultiFileRevisionTargets([{ path: 'a.md', name: 'a.md', content: '原文', size: 2 }], '润色', 'set-1')
    expect(() => createMultiFileDiffProposals('{"replacements":[{"targetId":"other","replacementText":"新文"}]}', targets)).toThrow('未知或重复目标')
    const sourceFingerprint = fingerprintDocument('abcdef')
    const proposals = [
      { ...createDiffProposal('{"replacementText":"x"}', { ...request, path: 'a.md', from: 1, to: 4, text: 'bcd', sourceFingerprint }), proposalSetId: 'set-1' },
      { ...createDiffProposal('{"replacementText":"y"}', { ...request, path: 'a.md', from: 3, to: 5, text: 'de', sourceFingerprint }), proposalSetId: 'set-1' },
    ]
    expect(() => applyDiffProposalSet('abcdef', proposals)).toThrow('重叠')
  })
})
