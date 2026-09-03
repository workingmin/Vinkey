import { describe, expect, it } from 'vitest'
import type { WorkspaceEntry } from '../types'
import { filterWorkspaceTree, findNewTextFiles, flattenWorkspaceFiles } from './tree'

const entries: WorkspaceEntry[] = [
  {
    name: '设定',
    path: '设定',
    kind: 'directory',
    children: [
      { name: '人物.md', path: '设定/人物.md', kind: 'file', children: [] },
      { name: '地点.txt', path: '设定/地点.txt', kind: 'file', children: [] },
    ],
  },
  { name: '第一章.md', path: '第一章.md', kind: 'file', children: [] },
]

describe('workspace tree helpers', () => {
  it('keeps ancestor directories when a child matches', () => {
    expect(filterWorkspaceTree(entries, '人物')).toEqual([
      {
        ...entries[0],
        children: [entries[0].children[0]],
      },
    ])
  })

  it('flattens only file entries', () => {
    expect(flattenWorkspaceFiles(entries).map((entry) => entry.path)).toEqual([
      '设定/人物.md',
      '设定/地点.txt',
      '第一章.md',
    ])
  })

  it('finds newly added markdown and text files in the same workspace', () => {
    const previous = { id: 'project', name: 'Project', pathLabel: '.', entries }
    const next = {
      ...previous,
      entries: [...entries, { name: '新章.md', path: '新章.md', kind: 'file' as const, children: [] }],
    }
    expect(findNewTextFiles(previous, next)).toEqual(['新章.md'])
  })
})
