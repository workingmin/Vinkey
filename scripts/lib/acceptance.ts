import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// Shared result contract for the machine acceptance suites under scripts/.
// Each suite keeps its own IDs, fixtures and case list; only the plumbing that
// must stay identical across suites lives here.

export type CaseStatus = 'PASS' | 'FAIL' | 'BLOCKED'

export interface CaseResult {
  caseId: string
  title: string
  category: 'machine' | 'manual'
  status: CaseStatus
  detail: string | null
  evidence?: string | null
  notes?: string | null
  durationMs?: number
  blockedReason?: string | null
}

export interface CaseSummary {
  caseCount: number
  passed: number
  failed: number
  blocked: number
}

export interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}

export function summarizeCases(cases: CaseResult[]): CaseSummary {
  return {
    caseCount: cases.length,
    passed: cases.filter((item) => item.status === 'PASS').length,
    failed: cases.filter((item) => item.status === 'FAIL').length,
    blocked: cases.filter((item) => item.status === 'BLOCKED').length,
  }
}

export function sha256OfFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function runCommand(command: string, args: string[], timeoutMs = 5_000): CommandResult {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024 })
    return {
      ok: result.status === 0,
      stdout: (result.stdout ?? '').trim(),
      stderr: (result.stderr ?? '').trim(),
      code: result.status,
    }
  } catch {
    return { ok: false, stdout: '', stderr: '', code: null }
  }
}

/** One-line CLI footer shared by every suite runner. */
export function formatSuiteSummary(
  suiteId: string,
  output: { conclusion: CaseStatus; resultFile: string; sha256File: string; exitCode: number; result: Record<string, unknown> },
): string {
  const summary = output.result.summary as CaseSummary
  return [
    `${suiteId} acceptance: ${output.conclusion} (${summary.passed}/${summary.caseCount} passed, ${summary.failed} failed, ${summary.blocked} blocked)`,
    `Results: ${output.resultFile}`,
    `SHA256SUMS: ${output.sha256File}`,
    `exit=${output.exitCode}`,
  ].join('\n')
}
