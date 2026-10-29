#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const defaultFixture = path.join(root, 'tests/fixtures/research-acceptance.json')

const thresholds = {
  minQuestionCount: 60,
  top5Relevant: 0.7,
  citationReachable: 0.95,
  evidenceCoverage: 0.9,
  unauthorizedBlocked: 1.0,
  singleSourceFailureHandled: 1.0,
  prepMsP95: 12_000,
  factErrorReduction: 0.3,
}

function argValue(name) {
  const prefix = `${name}=`
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)
  return sorted[index]
}

function ratio(numerator, denominator) {
  if (!denominator) return null
  return numerator / denominator
}

function readJson(file) {
  const absolute = path.isAbsolute(file) ? file : path.join(root, file)
  return JSON.parse(fs.readFileSync(absolute, 'utf8'))
}

function validateFixture(fixture) {
  const questions = fixture?.questions ?? []
  const errors = []
  if (questions.length < thresholds.minQuestionCount) errors.push(`题目数 ${questions.length} < ${thresholds.minQuestionCount}`)
  const ids = new Set()
  for (const [index, item] of questions.entries()) {
    if (!item.id || ids.has(item.id)) errors.push(`第 ${index + 1} 题 ID 缺失或重复：${item.id}`)
    if (item.id) ids.add(item.id)
    if (!item.question?.trim()) errors.push(`第 ${index + 1} 题缺少问题`)
    if (!item.domain?.trim()) errors.push(`第 ${index + 1} 题缺少领域`)
  }
  return { questionCount: questions.length, errors }
}

function evaluateReport(report) {
  const questions = report?.questions ?? []
  if (!questions.length) throw new Error('报告缺少 questions 字段')
  const summary = {
    questionCount: questions.length,
    top5RelevantCount: questions.filter((item) => item.relevantSourceInTop5).length,
    citationTotal: questions.reduce((sum, item) => sum + (item.citationChecks?.total ?? 0), 0),
    citationReachable: questions.reduce((sum, item) => sum + (item.citationChecks?.reachable ?? 0), 0),
    evidenceTotal: questions.reduce((sum, item) => sum + (item.evidenceChecks?.total ?? 0), 0),
    evidenceCovered: questions.reduce((sum, item) => sum + (item.evidenceChecks?.covered ?? 0), 0),
    unauthorizedBlocked: questions.filter((item) => item.unauthorizedNetworkBlocked).length,
    singleSourceFailureHandled: questions.filter((item) => item.singleSourceFailureHandled).length,
    factErrorBaseline: questions.reduce((sum, item) => sum + (item.factErrorBaseline ?? 0), 0),
    factErrorWithWeb: questions.reduce((sum, item) => sum + (item.factErrorWithWeb ?? 0), 0),
    prepValues: questions.map((item) => Number(item.prepMs ?? 0)),
  }
  const ratios = {
    top5Relevant: ratio(summary.top5RelevantCount, summary.questionCount),
    citationReachable: ratio(summary.citationReachable, summary.citationTotal),
    evidenceCoverage: ratio(summary.evidenceCovered, summary.evidenceTotal),
    unauthorizedBlocked: ratio(summary.unauthorizedBlocked, summary.questionCount),
    singleSourceFailureHandled: ratio(summary.singleSourceFailureHandled, summary.questionCount),
    prepMsP95: percentile([...summary.prepValues].sort((a, b) => a - b), 0.95),
  }
  ratios.factErrorReduction = summary.factErrorBaseline > 0
    ? (summary.factErrorBaseline - summary.factErrorWithWeb) / summary.factErrorBaseline
    : null
  const checks = [
    ['题目数量', summary.questionCount, thresholds.minQuestionCount, '≥'],
    ['Top5 相关可信来源', ratios.top5Relevant, thresholds.top5Relevant, '≥'],
    ['引用可回访', ratios.citationReachable, thresholds.citationReachable, '≥'],
    ['关键事实有摘录或未核实', ratios.evidenceCoverage, thresholds.evidenceCoverage, '≥'],
    ['未授权联网阻断', ratios.unauthorizedBlocked, thresholds.unauthorizedBlocked, '≥'],
    ['单源失败不拖垮', ratios.singleSourceFailureHandled, thresholds.singleSourceFailureHandled, '≥'],
    ['检索准备 p95', ratios.prepMsP95, thresholds.prepMsP95, '≤'],
  ]
  if (summary.factErrorBaseline > 0) {
    checks.push(['事实错误降低', ratios.factErrorReduction, thresholds.factErrorReduction, '≥'])
  }
  const evaluated = checks.map(([label, actual, target, operator]) => {
    const pass = actual == null ? false : operator === '≥' ? actual >= target : actual <= target
    return { label, actual, target, operator, pass }
  })
  return { summary, ratios, checks: evaluated, passed: evaluated.every((check) => check.pass) }
}

const validateOnly = process.argv.includes('--validate')
const reportFile = argValue('--report')
const fixtureFile = argValue('--fixture') ?? defaultFixture
const fixture = readJson(fixtureFile)
const fixtureCheck = validateFixture(fixture)
if (fixtureCheck.errors.length) {
  console.error(`测试集无效：\n- ${fixtureCheck.errors.join('\n- ')}`)
  process.exit(1)
}
if (validateOnly) {
  console.log(`测试集有效：${fixtureCheck.questionCount} 题`)
  process.exit(0)
}
if (!reportFile) {
  console.log(`测试集有效：${fixtureCheck.questionCount} 题；使用 --report=<path> 计算跑批指标。`)
  process.exit(0)
}
const report = readJson(reportFile)
const result = evaluateReport(report)
console.log(JSON.stringify(result, null, 2))
process.exit(result.passed ? 0 : 1)
