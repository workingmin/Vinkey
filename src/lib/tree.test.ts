import { describe, expect, it } from 'vitest'
import type { WorkspaceEntry } from '../types'
import { filterWorkspaceTree, flattenWorkspaceFiles } from './tree'

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
})
