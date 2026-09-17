import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { INTENT_CLASSIFICATION_EVALUATION_CASES } from '../src/lib/intentModelEvaluation'

const fixtureRoot = fileURLToPath(new URL('../tests/fixtures/chinese-fiction/', import.meta.url))

describe('Chinese fiction fixtures', () => {
  it('keeps every document target backed by a stable fixture', () => {
    const manifest = JSON.parse(readFileSync(resolve(fixtureRoot, 'manifest.json'), 'utf8')) as {
      works: Array<{ path: string; characters: number; bytes: number; sha256: string }>
    }
    const fixturePaths = new Set(manifest.works.map((item) => item.path))
    const targetedPaths = new Set(INTENT_CLASSIFICATION_EVALUATION_CASES
      .flatMap((testCase) => testCase.targets)
      .filter((target) => target.kind === 'document')
      .map((target) => target.id))

    for (const targetPath of targetedPaths) {
      expect(fixturePaths.has(targetPath), targetPath).toBe(true)
    }
    for (const work of manifest.works) {
      const content = readFileSync(resolve(fixtureRoot, work.path), 'utf8')
      expect(work.path).toMatch(/\.txt$/u)
      expect([...content].length, work.path).toBe(work.characters)
      expect(Buffer.byteLength(content), work.path).toBe(work.bytes)
      expect(createHash('sha256').update(content).digest('hex'), work.path).toBe(work.sha256)
    }
  })
})
