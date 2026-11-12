import { describe, expect, it } from 'vitest'
import {
  EDITOR_WEBVIEW_CASE_IDS,
  DEFER_UI_001_NOTE,
  evaluateEditorWebViewEvidence,
  subtreeOf,
} from '../../scripts/editor/editor-webview-verdicts.mjs'

// W0-EDITOR-F 目标平台 WebView 判据合同：纯函数，不需要 macOS/AX 权限或运行中的应用。
// 合成证据按 menu-ax-helper.swift 的 ax-tree / texts / click / press-ax 真实输出形状构造。

const DOCUMENT_CONTENT = '# Project B\nVinkey workspace for navigation fixture acceptance.\nThe nebula-echo index maps scene beats.\n'
const SHA = '0123456789abcdef0123456789abcdef01234567'

const node = (depth, role, title = '', subrole = '', description = '', value = '') => ({
  depth, role, subrole, title, description, value,
})

const goodAxTree = () => [
  node(0, 'AXWindow', 'Vinkey'),
  node(1, 'AXGroup'),
  node(4, 'AXWebArea', '', '', 'Vinkey'),
  node(5, 'AXGroup', '项目与会话栏', 'AXLandmarkComplementary', '项目与会话栏'),
  node(5, 'AXGroup', '内容区', 'AXLandmarkRegion', '内容区'),
  node(6, 'AXGroup', '文件列表', 'AXLandmarkRegion', '文件列表'),
  node(7, 'AXButton', 'README.md'),
  node(6, 'AXGroup', '文档视图', '', '文档视图'),
  node(7, 'AXButton', '编辑'),
  node(7, 'AXButton', '分栏'),
  node(7, 'AXButton', '预览'),
  node(6, 'AXTextArea'),
  node(6, 'AXGroup', '', 'AXSectionFooter'),
]

const staticText = (text) => ({ role: 'AXStaticText', text })
const goodTexts = () => [
  staticText('V'), staticText('Vinkey'), staticText('README.md'),
  { role: 'AXTextArea', text: DOCUMENT_CONTENT },
  staticText('语言 '), staticText('markdown'),
  staticText('行 '), staticText('4'),
  staticText('104'), staticText(' 字符'),
  staticText('15'), staticText(' 词'),
  staticText('UTF-8'), staticText('LF'), staticText('已保存'),
]

const goodInput = () => ({
  axTree: goodAxTree(),
  texts: goodTexts(),
  menuClick: { ok: true, click: { ok: true, item: '项目文件', pressedItemTitle: '项目文件' } },
  pressAx: { ok: true, pressAx: { ok: true, matched: { role: 'AXButton', title: 'README.md' } } },
  expectedDocumentContent: DOCUMENT_CONTENT,
  provenance: {
    status: 'PASS', appSha: SHA, headSha: SHA,
    workingTreeDirtyAtBuild: false, repositoryClean: true,
  },
  screenshotBytes: { filesPage: 799175, editorOpen: 799175 },
  preconditionsBlocked: [],
})

const statusById = (verdict) => Object.fromEntries(verdict.cases.map((item) => [item.caseId, item.status]))

describe('subtreeOf (扁平 DFS AX 树)', () => {
  it('只返回深度更大的连续后继节点', () => {
    const tree = goodAxTree()
    const index = tree.findIndex((item) => item.title === '文档视图')
    expect(subtreeOf(tree, index).map((item) => item.title)).toEqual(['编辑', '分栏', '预览'])
  })

  it('越界索引返回空数组', () => {
    expect(subtreeOf(goodAxTree(), -1)).toEqual([])
    expect(subtreeOf(goodAxTree(), 999)).toEqual([])
  })
})

describe('evaluateEditorWebViewEvidence (六项客观证据)', () => {
  it('六项信号齐备时全部 PASS，用例 ID 与四态不变', () => {
    const v = evaluateEditorWebViewEvidence(goodInput())
    expect(v.cases.map((item) => item.caseId)).toEqual(EDITOR_WEBVIEW_CASE_IDS)
    expect(Object.values(statusById(v))).toEqual(Array(6).fill('PASS'))
    expect(v.summary).toEqual({ caseCount: 6, passed: 6, failed: 0, blocked: 0, notApplicable: 0 })
    expect(v.objectiveConclusion).toBe('PASS')
    expect(v.exitCode).toBe(0)
    expect(new Set(v.cases.map((item) => item.status)).size).toBe(1)
  })

  it('缺少 AXWebArea（例如只有 jsdom/Playwright DOM）时 EDIT-WV-001 FAIL', () => {
    const input = goodInput()
    input.axTree = input.axTree.filter((item) => item.role !== 'AXWebArea')
    const v = evaluateEditorWebViewEvidence(input)
    expect(statusById(v)['EDIT-WV-001']).toBe('FAIL')
    expect(v.objectiveConclusion).toBe('FAIL')
    expect(v.exitCode).toBe(1)
  })

  it('原生菜单点击或 AXPress 未成功时 EDIT-WV-001 FAIL', () => {
    const a = goodInput()
    a.menuClick = { ok: false, click: { ok: false, item: '项目文件' } }
    expect(statusById(evaluateEditorWebViewEvidence(a))['EDIT-WV-001']).toBe('FAIL')

    const b = goodInput()
    b.pressAx = { ok: false, error: 'no-ax-match' }
    expect(statusById(evaluateEditorWebViewEvidence(b))['EDIT-WV-001']).toBe('FAIL')

    const c = goodInput()
    c.pressAx = { ok: true, pressAx: { ok: true, matched: { role: 'AXStaticText', title: 'README.md' } } }
    expect(statusById(evaluateEditorWebViewEvidence(c))['EDIT-WV-001']).toBe('FAIL')
  })

  it('文件列表分组或文档按钮缺失时 EDIT-WV-002 FAIL', () => {
    const a = goodInput()
    a.axTree = a.axTree.filter((item) => item.title !== '文件列表')
    expect(statusById(evaluateEditorWebViewEvidence(a))['EDIT-WV-002']).toBe('FAIL')

    const b = goodInput()
    b.axTree = b.axTree.filter((item) => item.title !== 'README.md')
    expect(statusById(evaluateEditorWebViewEvidence(b))['EDIT-WV-002']).toBe('FAIL')
  })

  it('编辑器内容必须逐字匹配 fixture 文档，不得用任意文本冒充', () => {
    const a = goodInput()
    a.texts = a.texts.map((item) => item.role === 'AXTextArea'
      ? { ...item, text: '<html><body>synthetic webview</body></html>' } : item)
    expect(statusById(evaluateEditorWebViewEvidence(a))['EDIT-WV-003']).toBe('FAIL')

    const b = goodInput()
    b.axTree = b.axTree.filter((item) => item.role !== 'AXTextArea')
    expect(statusById(evaluateEditorWebViewEvidence(b))['EDIT-WV-003']).toBe('FAIL')

    const c = goodInput()
    c.expectedDocumentContent = ''
    expect(statusById(evaluateEditorWebViewEvidence(c))['EDIT-WV-003']).toBe('FAIL')
  })

  it('状态栏缺任一信号（已保存 / LF / 数字配对）即 FAIL', () => {
    for (const removed of ['已保存', 'LF', 'markdown', '104', '15', '4', 'UTF-8']) {
      const input = goodInput()
      input.texts = input.texts.filter((item) => item.text.trim() !== removed)
      expect(statusById(evaluateEditorWebViewEvidence(input))['EDIT-WV-004']).toBe('FAIL')
    }
  })

  it('文档视图按钮不齐备时 EDIT-WV-005 FAIL', () => {
    const input = goodInput()
    input.axTree = input.axTree.filter((item) => item.title !== '预览')
    expect(statusById(evaluateEditorWebViewEvidence(input))['EDIT-WV-005']).toBe('FAIL')
  })

  it('溯源 REVIEW / SHA 不一致 / 截图缺失时 EDIT-WV-006 FAIL', () => {
    const a = goodInput()
    a.provenance = { ...a.provenance, status: 'REVIEW' }
    expect(statusById(evaluateEditorWebViewEvidence(a))['EDIT-WV-006']).toBe('FAIL')

    const b = goodInput()
    b.provenance = { ...b.provenance, headSha: 'different' }
    expect(statusById(evaluateEditorWebViewEvidence(b))['EDIT-WV-006']).toBe('FAIL')

    const c = goodInput()
    c.screenshotBytes = { filesPage: 799175, editorOpen: 0 }
    expect(statusById(evaluateEditorWebViewEvidence(c))['EDIT-WV-006']).toBe('FAIL')
  })

  it('AX 树/文本快照为空或前置条件阻断时全部 BLOCKED，绝不写 PASS', () => {
    const a = evaluateEditorWebViewEvidence({ ...goodInput(), axTree: [], texts: [] })
    expect(Object.values(statusById(a))).toEqual(Array(6).fill('BLOCKED'))
    expect(a.objectiveConclusion).toBe('BLOCKED')
    expect(a.exitCode).toBe(1)

    const b = evaluateEditorWebViewEvidence({ ...goodInput(), preconditionsBlocked: ['未找到应用'] })
    expect(Object.values(statusById(b))).toEqual(Array(6).fill('BLOCKED'))
    expect(b.cases[0].actual).toContain('未找到应用')
  })

  it('只允许 PASS/FAIL/BLOCKED/NOT_APPLICABLE 四态', () => {
    for (const input of [goodInput(), {}, { ...goodInput(), provenance: { status: 'REVIEW' } }]) {
      const v = evaluateEditorWebViewEvidence(input)
      for (const item of v.cases) {
        expect(['PASS', 'FAIL', 'BLOCKED', 'NOT_APPLICABLE']).toContain(item.status)
      }
    }
  })
})

describe('人工 UI 观察与 DEFER-UI-001 边界', () => {
  it('即使客观证据全 PASS，人工观察仍未回传、platformPass 恒为 false', () => {
    const v = evaluateEditorWebViewEvidence(goodInput())
    expect(v.objectiveConclusion).toBe('PASS')
    expect(v.humanUIObservation.required).toBe(true)
    expect(v.humanUIObservation.returned).toBe(false)
    expect(v.platformPass).toBe(false)
    expect(v.overallConclusion).toContain('人工 UI 观察仍待测试人员回传')
    expect(v.overallConclusion).not.toContain('平台通过')
  })

  it('DEFER-UI-001 保留登记，不判定、不写成 PASS、不删除', () => {
    const v = evaluateEditorWebViewEvidence(goodInput())
    expect(v.deferredItems).toHaveLength(1)
    expect(v.deferredItems[0].id).toBe('DEFER-UI-001')
    expect(v.deferredItems[0].registered).toBe(true)
    expect(v.deferredItems[0].judged).toBe(false)
    expect(v.deferredItems[0].note).toBe(DEFER_UI_001_NOTE)
    expect(v.cases.some((item) => item.caseId === 'DEFER-UI-001')).toBe(false)
  })
})
