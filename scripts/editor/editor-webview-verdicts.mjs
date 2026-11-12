#!/usr/bin/env node
/**
 * UI-ACC-EDITOR-WEBVIEW-001 — W0-EDITOR-F 目标平台 WebView 客观证据判据（纯函数）
 *
 * 边界（不含糊、不放宽）：
 *   - 只接受真实 Tauri 目标应用窗口的 AX 树 / AX 文本快照 / 运行时 app.start 日志 /
 *     原生窗口截图；jsdom、Playwright DOM、合成节点、人工描述一律不作为证据。
 *   - 六个客观用例各自要求多个独立信号同时成立，任一缺失即为 FAIL；
 *     证据完全不可读时为 BLOCKED，不得记作 PASS。
 *   - 人工 UI 观察（视觉质量、交互手感、无障碍观感）不由脚本判定：
 *     platformPass 恒为 false，除非测试人员材料真实回传并由人工复核。
 *   - DEFER-UI-001 只登记，不判定、不删除、不写成 PASS。
 */
export const EDITOR_WEBVIEW_CASE_IDS = [
  'EDIT-WV-001',
  'EDIT-WV-002',
  'EDIT-WV-003',
  'EDIT-WV-004',
  'EDIT-WV-005',
  'EDIT-WV-006',
]

export const EDITOR_WEBVIEW_CASE_DEFS = [
  { id: 'EDIT-WV-001', scene: '目标平台 WebView 与原生导航', expected: '真实应用窗口存在 AXWebArea；由原生「查看 > 项目文件」切换、由 AXPress 打开 fixture 文档' },
  { id: 'EDIT-WV-002', scene: '文件树 / 文件列表', expected: 'AX 树存在 AXLandmarkRegion「文件列表」，其子树包含可按下文档按钮 README.md' },
  { id: 'EDIT-WV-003', scene: '编辑器与文档内容', expected: 'AX 树存在 AXTextArea，且该控件的 AXValue 与 fixture 文档内容一致' },
  { id: 'EDIT-WV-004', scene: '保存状态栏', expected: 'AX 文本快照含语言/行/字符/词/编码/行尾/已保存并按顺序成对读回' },
  { id: 'EDIT-WV-005', scene: '文档视图与预览切换', expected: 'AX 树存在「文档视图」分组且其子树含「编辑 / 分栏 / 预览」三个按钮' },
  { id: 'EDIT-WV-006', scene: '构建溯源与原生截图', expected: 'app.start.commitSha 等于 HEAD、构建时工作树干净、仓库干净，且文件页与编辑器页各有原生窗口截图' },
]

export const HUMAN_UI_OBSERVATION_NOTE =
  '人工 UI 观察仍待测试人员回传（视觉质量、交互手感、无障碍观感）；客观 AX/CG/截图证据不冒充人工观察，也不代表 W0-EDITOR-F 平台层综合通过。'

export const DEFER_UI_001_NOTE =
  'DEFER-UI-001（帮助/诊断弹窗视觉质量与交互完成度）按总计划 §8.3 保留登记，Alpha 内不判定、不写成 PASS、不删除。'

const normalize = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim()
const isNumber = (value) => /^\d+$/u.test(value)

/** 扁平 DFS 前序 AX 树中，取出 index 节点的子树（不含自身）。 */
export function subtreeOf(nodes, index) {
  if (index < 0 || index >= nodes.length) return []
  const depth = Number(nodes[index]?.depth)
  if (!Number.isFinite(depth)) return []
  const result = []
  for (let i = index + 1; i < nodes.length; i += 1) {
    if (Number(nodes[i]?.depth) <= depth) break
    result.push(nodes[i])
  }
  return result
}

function textIndexOf(tokens, value, from = 0) {
  return tokens.findIndex((token, index) => index >= from && token === value)
}

/**
 * @param {object} info
 * @param {Array}  info.axTree            扁平 AX 树（menu-ax-helper ax-tree）
 * @param {Array}  info.texts             AX 文本快照（menu-ax-helper texts）
 * @param {object} info.menuClick         原生菜单 click 结果
 * @param {object} info.pressAx           AXPress 文档按钮结果
 * @param {string} info.expectedDocumentContent  fixture 文档真实内容
 * @param {object} info.provenance        { status, appSha, headSha, workingTreeDirtyAtBuild, repositoryClean }
 * @param {object} info.screenshotBytes  { filesPage, editorOpen }
 * @param {Array}  info.preconditionsBlocked    前置条件阻断原因
 */
export function evaluateEditorWebViewEvidence(info = {}) {
  const nodes = Array.isArray(info.axTree) ? info.axTree : []
  const texts = Array.isArray(info.texts) ? info.texts : []
  const tokens = texts.map((entry) => normalize(entry?.text))
  const roles = texts.map((entry) => String(entry?.role ?? ''))
  const blockers = Array.isArray(info.preconditionsBlocked) ? info.preconditionsBlocked.filter(Boolean) : []
  const evidenceUnavailable = blockers.length > 0 || nodes.length === 0 || texts.length === 0
  const unavailableReason = blockers.length
    ? `前置条件未满足：${blockers.join('；')}`
    : '目标应用 AX 树或 AX 文本快照为空，无法读取目标平台 WebView 结构证据'

  const webArea = nodes.find((node) => String(node?.role ?? '') === 'AXWebArea')
  const webAreaIdentity = webArea ? normalize(`${webArea.title ?? ''} ${webArea.description ?? ''}`) : ''
  // menu-ax-helper 的原始输出把细节嵌在 click / pressAx 子对象里；同时兼容
  // 调用方已归一化的形状，避免合同测试与真实批次使用两套结构。
  const clickNode = info.menuClick?.click ?? info.menuClick ?? {}
  const menuClickTitle = normalize(clickNode?.pressedItemTitle ?? clickNode?.item
    ?? info.menuClick?.pressedItemTitle ?? info.menuClick?.item)
  const menuClickOk = info.menuClick?.ok === true && menuClickTitle === '项目文件'
  const pressNode = info.pressAx?.pressAx ?? info.pressAx ?? {}
  const pressMatched = pressNode?.matched ?? {}
  const pressTitle = normalize(pressMatched.title ?? pressNode.title ?? info.pressAx?.title)
  const pressRole = String(pressMatched.role ?? pressNode.role ?? '')
  const pressAxOk = info.pressAx?.ok === true && pressTitle === 'README.md' && pressRole === 'AXButton'
  const wv001 = Boolean(webArea) && /Vinkey/u.test(webAreaIdentity) && menuClickOk && pressAxOk

  const fileListIndex = nodes.findIndex((node) => String(node?.role ?? '') === 'AXGroup'
    && String(node?.subrole ?? '') === 'AXLandmarkRegion'
    && normalize(node?.title) === '文件列表')
  const fileListSubtree = subtreeOf(nodes, fileListIndex)
  const readmeButtons = fileListSubtree.filter((node) => String(node?.role ?? '') === 'AXButton'
    && normalize(node?.title) === 'README.md')
  const wv002 = fileListIndex >= 0 && readmeButtons.length >= 1

  const textAreaNodes = nodes.filter((node) => String(node?.role ?? '') === 'AXTextArea')
  const expectedContent = normalize(info.expectedDocumentContent)
  const textAreaValues = texts
    .filter((entry, index) => roles[index] === 'AXTextArea')
    .map((entry) => normalize(entry?.text))
  const wv003 = textAreaNodes.length >= 1 && expectedContent.length > 0
    && textAreaValues.some((value) => value === expectedContent)

  // 保存状态栏必须按「语言 / markdown / 行 / 行数 / 字符数 / 字符 / 词数 / 词 /
  // UTF-8 / LF|CRLF / 已保存」连续 11 个 token 严格成对读回；只检查零散关键词会
  // 让相邻数字互相顶替（例如删掉行数后由字符数冒充），属于断言放宽，故不采用。
  const statusStart = textIndexOf(tokens, '语言')
  const statusSeq = statusStart >= 0 ? tokens.slice(statusStart, statusStart + 11) : []
  const languagePair = statusSeq[0] === '语言' && statusSeq[1] === 'markdown'
  const linePair = statusSeq[2] === '行' && isNumber(statusSeq[3] ?? '')
  const charPair = isNumber(statusSeq[4] ?? '') && statusSeq[5] === '字符'
  const wordPair = isNumber(statusSeq[6] ?? '') && statusSeq[7] === '词'
  const encodingOk = statusSeq[8] === 'UTF-8'
  const lineEndingOk = statusSeq[9] === 'LF' || statusSeq[9] === 'CRLF'
  const savedOk = statusSeq[10] === '已保存'
  const wv004 = statusSeq.length === 11 && languagePair && linePair && charPair
    && wordPair && encodingOk && lineEndingOk && savedOk

  const documentViewIndex = nodes.findIndex((node) => String(node?.role ?? '') === 'AXGroup'
    && normalize(node?.title) === '文档视图')
  const viewButtons = subtreeOf(nodes, documentViewIndex)
    .filter((node) => String(node?.role ?? '') === 'AXButton')
    .map((node) => normalize(node?.title))
  const wv005 = documentViewIndex >= 0
    && ['编辑', '分栏', '预览'].every((label) => viewButtons.includes(label))

  const provenance = info.provenance ?? {}
  const shot = info.screenshotBytes ?? {}
  const provenanceOk = provenance.status === 'PASS'
    && typeof provenance.appSha === 'string' && provenance.appSha.length > 0
    && provenance.appSha === provenance.headSha
    && provenance.workingTreeDirtyAtBuild === false
    && provenance.repositoryClean === true
  const screenshotsOk = Number(shot.filesPage) > 20_000 && Number(shot.editorOpen) > 20_000
  const wv006 = provenanceOk && screenshotsOk

  const signals = {
    'EDIT-WV-001': {
      ok: wv001,
      actual: `AXWebArea=${Boolean(webArea)} identity=${JSON.stringify(webAreaIdentity)}；原生菜单「查看 > 项目文件」点击=${menuClickOk}；AXPress README.md=${pressAxOk}`,
      evidence: ['states/click-files-page.json', 'states/press-readme.json', 'states/ax-tree-editor-open.json'],
    },
    'EDIT-WV-002': {
      ok: wv002,
      actual: `AXLandmarkRegion「文件列表」=${fileListIndex >= 0}；子树 README.md 按钮=${readmeButtons.length}`,
      evidence: ['states/ax-tree-files-page.json', 'states/ax-tree-editor-open.json'],
    },
    'EDIT-WV-003': {
      ok: wv003,
      actual: `AXTextArea 节点=${textAreaNodes.length}；控件值快照=${textAreaValues.length}；与 fixture 文档内容逐字一致=${Boolean(expectedContent && textAreaValues.some((v) => v === expectedContent))}`,
      evidence: ['states/texts-editor-open.json', 'states/ax-tree-editor-open.json', 'fixture-document.txt'],
    },
    'EDIT-WV-004': {
      ok: wv004,
      actual: `语言/markdown=${languagePair}；行/数字=${linePair}；数字/字符=${charPair}；数字/词=${wordPair}；UTF-8=${encodingOk}；LF|CRLF=${lineEndingOk}；已保存=${savedOk}`,
      evidence: ['states/texts-editor-open.json'],
    },
    'EDIT-WV-005': {
      ok: wv005,
      actual: `「文档视图」分组=${documentViewIndex >= 0}；子树按钮=${JSON.stringify(viewButtons)}；编辑/分栏/预览齐备=${['编辑', '分栏', '预览'].every((l) => viewButtons.includes(l))}`,
      evidence: ['states/ax-tree-editor-open.json'],
    },
    'EDIT-WV-006': {
      ok: wv006,
      actual: `provenance=${provenance.status ?? 'UNAVAILABLE'}；appSha=${provenance.appSha ?? 'unknown'}；headSha=${provenance.headSha ?? 'unknown'}；构建时工作树干净=${provenance.workingTreeDirtyAtBuild === false}；仓库干净=${provenance.repositoryClean === true}；原生截图字节 filesPage=${shot.filesPage ?? 0} editorOpen=${shot.editorOpen ?? 0}`,
      evidence: ['screenshots/files-page.png', 'screenshots/editor-open.png', 'app-runtime.jsonl'],
    },
  }

  const cases = EDITOR_WEBVIEW_CASE_DEFS.map((def) => {
    const signal = signals[def.id]
    const status = evidenceUnavailable ? 'BLOCKED' : signal.ok ? 'PASS' : 'FAIL'
    return {
      caseId: def.id,
      scene: def.scene,
      platform: 'macOS',
      expected: def.expected,
      actual: evidenceUnavailable ? unavailableReason : signal.actual,
      status,
      evidence: signal.evidence,
    }
  })

  const summary = {
    caseCount: cases.length,
    passed: cases.filter((item) => item.status === 'PASS').length,
    failed: cases.filter((item) => item.status === 'FAIL').length,
    blocked: cases.filter((item) => item.status === 'BLOCKED').length,
    notApplicable: cases.filter((item) => item.status === 'NOT_APPLICABLE').length,
  }
  const objectiveConclusion = summary.blocked > 0 ? 'BLOCKED' : summary.failed > 0 ? 'FAIL' : 'PASS'
  const humanUIObservation = {
    required: true,
    returned: false,
    note: HUMAN_UI_OBSERVATION_NOTE,
    reviewer: 'human-tester',
  }
  return {
    cases,
    summary,
    objectiveConclusion,
    humanUIObservation,
    deferredItems: [{ id: 'DEFER-UI-001', registered: true, judged: false, note: DEFER_UI_001_NOTE }],
    platformPass: false,
    overallConclusion: `目标平台 WebView 客观证据 ${objectiveConclusion}；${HUMAN_UI_OBSERVATION_NOTE}`,
    exitCode: objectiveConclusion === 'PASS' ? 0 : 1,
  }
}
