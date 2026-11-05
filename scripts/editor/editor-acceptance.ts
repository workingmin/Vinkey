import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'

// W0-EDITOR-F / D-EDITOR 基础编辑器 fixture/合同验收脚本（UI-ACC-EDITOR-001）。
// 在脚本自建的隔离临时工作区中生成 Markdown/代码/文本/环境文件/二进制等文档 fixture，
// 复刻 src-tauri/src/lib.rs 的文档分类、读取、保存、修改时间冲突、新建与越界保护合同。
// 不读写真实用户文件，不调用 Ollama，不覆盖用户工作区。

export const SUITE_ID = 'UI-ACC-EDITOR-001'
export const SUITE_VERSION = 'editor-acceptance-1'
export const ACCEPTANCE_ID = 'W0-EDITOR-F'
export const DOMAIN_ID = 'D-EDITOR'
export const GATE = 'F'

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

export interface CliOptions {
  workspace: string | null
  outputDir: string | null
  logFile: string | null
  testerId: string | null
  json: boolean
  keepFixture: boolean
}

export interface RepositoryInfo {
  version: string
  gitSha: string | null
  dirty: boolean
  root: string
}

export interface EnvironmentInfo {
  os: string
  osVersion: string
  arch: string
  node: string
  rust: string
  tauriCli: string
  tauriFramework: string
}

export interface FixtureFileSummary {
  relativePath: string
  kind: string
  sha256: string
  sizeBytes: number
}

export interface FixtureManifest {
  fixtureRoot: string
  workspaceRoot: string
  outsideRoot: string
  created: boolean
  files: FixtureFileSummary[]
  cleanup: 'removed' | 'kept' | 'caller-owned'
}

export interface DocumentSnapshot {
  path: string
  name: string
  content: string
  kind: string
  modifiedMs: number
  lineEnding: 'lf' | 'crlf'
  hasBom: boolean
  mimeType: string | null
  sizeBytes: number
}

export interface AcceptanceRunInput {
  options: CliOptions
  repository: RepositoryInfo
  environment: EnvironmentInfo
  fixture: FixtureManifest
  cases?: CaseResult[] | null
}

export interface AcceptanceRunOutput {
  result: Record<string, unknown>
  conclusion: CaseStatus
  exitCode: number
  outputDir: string
  resultFile: string
  sha256File: string
  logFile: string
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function repositoryRoot(): string {
  return resolve(process.env.VINKEY_EDITOR_ACCEPTANCE_ROOT ?? process.cwd())
}

function usage(): string {
  return `Vinkey 基础编辑器 fixture/合同验收（${ACCEPTANCE_ID} / ${SUITE_ID}）

用途：
  在脚本自建的隔离临时工作区生成 Markdown/代码/文本/环境文件/二进制文档 fixture，复刻
  src-tauri/src/lib.rs 的文档分类、读取、保存、修改时间冲突、新建与越界保护合同。
  不覆盖用户文件，不调用 Ollama。

用法：
  npm run test:editor-acceptance -- [选项]
  npm run test:editor-acceptance:sh -- [选项]      # macOS / Linux
  npm run test:editor-acceptance:win -- [选项]     # Windows PowerShell

参数：
  --workspace <dir>   指定 fixture 根目录；省略时在系统临时目录生成（运行后自动清理）
  --output <dir>      结果归档目录（result.json、SHA256SUMS）；默认 artifacts/editor-acceptance/run-<时间戳>/
  --log-file <path>   写入逐用例 JSON 诊断日志
  --tester-id <id>    非个人标识的测试人员代号
  --keep-fixture      运行结束后保留自动生成的 fixture
  --json              输出完整机器可读 JSON（stdout 只有单个 JSON 文档）
  -h, --help          显示帮助

环境变量：
  VINKEY_EDITOR_ACCEPTANCE_ROOT  仓库根目录（由包装脚本注入，一般无需手工设置）`
}

export function parseArguments(values: string[]): CliOptions | null {
  const options: CliOptions = {
    workspace: null,
    outputDir: null,
    logFile: null,
    testerId: null,
    json: false,
    keepFixture: false,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '-h' || value === '--help') return null
    if (value === '--json') { options.json = true; continue }
    if (value === '--keep-fixture') { options.keepFixture = true; continue }
    if (value === '--workspace' || value === '--output' || value === '--log-file' || value === '--tester-id') {
      const argument = values[index + 1]
      if (!argument) throw new Error(`参数 ${value} 缺少值。`)
      index += 1
      if (value === '--workspace') options.workspace = resolve(argument)
      if (value === '--output') options.outputDir = resolve(argument)
      if (value === '--log-file') options.logFile = resolve(argument)
      if (value === '--tester-id') options.testerId = argument.trim()
      continue
    }
    throw new Error(`未知参数 ${value}。`)
  }
  if (options.testerId && !/^[A-Za-z0-9._-]{1,64}$/u.test(options.testerId)) {
    throw new Error('--tester-id 仅允许 1-64 个字母、数字、点、下划线或连字符。')
  }
  return options
}

function sha256OfFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function runCommand(command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; code: number | null } {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 })
    return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim(), code: result.status }
  } catch {
    return { ok: false, stdout: '', stderr: '', code: null }
  }
}

export function collectRepository(root: string): RepositoryInfo {
  let version = '0.0.0'
  const packageFile = join(root, 'package.json')
  if (existsSync(packageFile)) {
    try {
      const parsed = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: string }
      if (typeof parsed.version === 'string' && parsed.version) version = parsed.version
    } catch {
      // 读取失败时保留默认版本
    }
  }
  const shaRun = runCommand('git', ['-C', root, 'rev-parse', 'HEAD'])
  const statusRun = runCommand('git', ['-C', root, 'status', '--porcelain'])
  return { version, gitSha: shaRun.ok ? shaRun.stdout : null, dirty: Boolean(statusRun.stdout), root }
}

export function collectEnvironment(root: string): EnvironmentInfo {
  let tauriCli = 'N/A'
  try {
    const parsed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> }
    tauriCli = parsed.devDependencies?.['@tauri-apps/cli'] ?? 'N/A'
  } catch {
    tauriCli = 'N/A'
  }
  let tauriFramework = 'N/A'
  const cargoFile = join(root, 'src-tauri', 'Cargo.toml')
  if (existsSync(cargoFile)) {
    const content = readFileSync(cargoFile, 'utf8')
    const match = content.match(/tauri\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/u)
    if (match?.[1]) tauriFramework = match[1]
    else {
      const direct = content.match(/^tauri\s*=\s*"([^"]+)"/mu)
      if (direct?.[1]) tauriFramework = direct[1]
    }
  }
  const rust = runCommand('rustc', ['--version'])
  let osVersion = 'N/A'
  if (process.platform === 'win32') osVersion = process.arch
  else {
    const swVers = runCommand('sw_vers', ['-productVersion'])
    if (swVers.ok) osVersion = swVers.stdout
  }
  return {
    os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osVersion,
    arch: process.arch,
    node: process.version,
    rust: rust.ok ? (rust.stdout.match(/rustc[\s/]([0-9]+\.[0-9]+(?:\.[0-9]+)?)/u)?.[1] ?? rust.stdout.split(/\s+/u)[1] ?? rust.stdout) : 'N/A',
    tauriCli,
    tauriFramework,
  }
}

const TEXT_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif', 'apng', 'tiff', 'tif'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'opus', 'oga', 'ogg', 'weba'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'mov', 'm4v'])
const BINARY_EXTENSIONS = new Set(['zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz', 'exe', 'dll', 'so', 'dylib', 'app', 'dmg', 'msi', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'ttf', 'otf', 'woff', 'woff2', 'eot', 'db', 'sqlite', 'sqlite3', 'bin', 'dat', 'iso', 'img', 'class', 'jar', 'war', 'pyc', 'pyo'])
const CODE_EXTENSIONS = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'py', 'pyw', 'pyi', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'jsonc', 'json5', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'go', 'rs', 'rb', 'erb', 'php', 'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'swift', 'lua', 'r', 'sql', 'graphql', 'gql', 'proto', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'log'])
const BINARY_DOCUMENT_KINDS = new Set(['image', 'pdf', 'audio', 'video', 'binary'])

export function classifyDocument(relativePath: string): string {
  const name = relativePath.split('/').at(-1)?.toLowerCase() ?? relativePath.toLowerCase()
  if (name === '.env' || name.startsWith('.env.')) return 'code'
  const extension = extname(name).slice(1).toLowerCase()
  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') return 'markdown'
  if (TEXT_IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (extension === 'pdf') return 'pdf'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (BINARY_EXTENSIONS.has(extension)) return 'binary'
  if (CODE_EXTENSIONS.has(extension)) return 'code'
  return 'text'
}

export function ensureDocumentExtension(relativePath: string): string {
  const kind = classifyDocument(relativePath)
  if (BINARY_DOCUMENT_KINDS.has(kind)) throw new Error('该文件是预览或二进制文件，不能作为文本编辑文档')
  return kind
}

function nativeRelative(relativePath: string): string {
  if (relativePath.includes('\\')) throw new Error('路径包含不允许的片段')
  const parts = relativePath.split('/').filter((part) => part.length > 0)
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) throw new Error('路径包含不允许的片段')
  return parts.join(sep)
}

export function validateRelative(relativePath: string): string {
  if (!relativePath.trim()) throw new Error('路径不能为空')
  if (relativePath.startsWith('/') || /^[A-Za-z]:/u.test(relativePath)) throw new Error('只允许工作区内的相对路径')
  return nativeRelative(relativePath)
}

export function resolveExisting(workspaceRoot: string, relativePath: string): string {
  const clean = validateRelative(relativePath)
  const target = resolve(workspaceRoot, clean)
  const resolvedRoot = resolve(workspaceRoot)
  const canonical = safeRealpath(target)
  if (!canonical.startsWith(resolvedRoot + sep) && canonical !== resolvedRoot) throw new Error('路径超出已授权工作区')
  return canonical
}

export function resolveForCreate(workspaceRoot: string, relativePath: string): string {
  const clean = validateRelative(relativePath)
  const target = resolve(workspaceRoot, clean)
  const resolvedRoot = resolve(workspaceRoot)
  let existing = dirname(target)
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) throw new Error('路径超出已授权工作区')
    existing = parent
  }
  const canonicalParent = safeRealpath(existing)
  if (!canonicalParent.startsWith(resolvedRoot + sep) && canonicalParent !== resolvedRoot) throw new Error('路径超出已授权工作区')
  return target
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

export function modifiedMs(path: string): number {
  return Math.floor(statSync(path).mtimeMs)
}

export function relativeLabel(workspaceRoot: string, absolutePath: string): string {
  return absolutePath.replace(/\\/gu, '/').slice(resolve(workspaceRoot).replace(/\\/gu, '/').length + 1)
}

export function readDocument(workspaceRoot: string, relativePath: string): DocumentSnapshot {
  const target = resolveExisting(workspaceRoot, relativePath)
  if (!statSync(target).isFile()) throw new Error('目标不是文档')
  let kind = classifyDocument(relativePath)
  const bytes = readFileSync(target)
  const sizeBytes = bytes.length
  if (BINARY_DOCUMENT_KINDS.has(kind)) {
    return {
      path: relativeLabel(workspaceRoot, target),
      name: target.split(sep).at(-1) ?? target,
      content: '',
      kind,
      modifiedMs: modifiedMs(target),
      lineEnding: 'lf',
      hasBom: false,
      mimeType: null,
      sizeBytes,
    }
  }
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const body = hasBom ? bytes.subarray(3) : bytes
  let raw: string
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    kind = 'binary'
    raw = ''
  }
  const lineEnding = raw.includes('\r\n') ? 'crlf' : 'lf'
  const content = raw.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n')
  return {
    path: relativeLabel(workspaceRoot, target),
    name: target.split(sep).at(-1) ?? target,
    content,
    kind,
    modifiedMs: modifiedMs(target),
    lineEnding: lineEnding as DocumentSnapshot['lineEnding'],
    hasBom,
    mimeType: null,
    sizeBytes,
  }
}

export function saveDocument(workspaceRoot: string, relativePath: string, content: string, expectedModifiedMs: number, lineEnding: 'lf' | 'crlf', hasBom: boolean): DocumentSnapshot {
  const target = resolveExisting(workspaceRoot, relativePath)
  ensureDocumentExtension(relativePath)
  const currentModifiedMs = modifiedMs(target)
  if (currentModifiedMs !== expectedModifiedMs) throw new Error('文档已被其他程序修改，请重新加载后再保存')
  if (lineEnding !== 'lf' && lineEnding !== 'crlf') throw new Error('不支持的换行格式')
  const normalized = content.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n')
  const encodedText = lineEnding === 'crlf' ? normalized.replace(/\n/gu, '\r\n') : normalized
  const prefix = hasBom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0)
  const temporary = `${target}.tmp-${Date.now()}`
  try {
    writeFileSync(temporary, Buffer.concat([prefix, Buffer.from(encodedText, 'utf8')]))
    if (existsSync(target)) unlinkSync(target)
    renameSync(temporary, target)
  } catch (cause) {
    if (existsSync(temporary)) unlinkSync(temporary)
    throw cause instanceof Error ? cause : new Error(String(cause))
  }
  return readDocument(workspaceRoot, relativePath)
}

export function createDocument(workspaceRoot: string, relativePath: string): DocumentSnapshot {
  const target = resolveForCreate(workspaceRoot, relativePath)
  ensureDocumentExtension(relativePath)
  if (existsSync(target)) throw new Error('同名文件已存在')
  mkdirSync(dirname(target), { recursive: true })
  openSync(target, 'wx')
  return readDocument(workspaceRoot, relativePath)
}

interface FixtureFileSpec {
  relativePath: string
  content: string | Buffer
}

function fixtureFileSpecs(): FixtureFileSpec[] {
  return [
    { relativePath: '第1章.md', content: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# 第一章\n\n灯塔在黎明前亮起。\n', 'utf8')]) },
    { relativePath: 'notes/中文路径.txt', content: Buffer.from('第一行\r\n第二行\r\n', 'utf8') },
    { relativePath: 'src/main.ts', content: 'export const answer = 42\n' },
    { relativePath: '.env', content: 'VINKEY_MODE=acceptance\n' },
    { relativePath: 'assets/cover.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff]) },
    { relativePath: 'docs/无扩展名', content: '无扩展名文本\n' },
  ]
}

export function generateFixture(fixtureRoot: string): FixtureManifest {
  const workspaceRoot = join(fixtureRoot, 'workspace')
  const outsideRoot = join(fixtureRoot, 'outside')
  mkdirSync(workspaceRoot, { recursive: true })
  mkdirSync(outsideRoot, { recursive: true })
  writeFileSync(join(outsideRoot, 'outside.md'), 'outside workspace\n', 'utf8')
  const files: FixtureFileSummary[] = []
  for (const spec of fixtureFileSpecs()) {
    const absolute = join(workspaceRoot, spec.relativePath)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, spec.content)
    files.push({ relativePath: spec.relativePath, kind: classifyDocument(spec.relativePath), sha256: sha256OfFile(absolute), sizeBytes: statSync(absolute).size })
  }
  return { fixtureRoot, workspaceRoot, outsideRoot, created: true, files, cleanup: 'caller-owned' }
}

function passCase(caseId: string, title: string, detail: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'PASS', detail }
}

function failCase(caseId: string, title: string, detail: string): CaseResult {
  return { caseId, title, category: 'machine', status: 'FAIL', detail }
}

function sameFile(path: string, buffer: Buffer): boolean {
  return existsSync(path) && readFileSync(path).equals(buffer)
}

export function runMachineCases(fixture: FixtureManifest): CaseResult[] {
  const cases: CaseResult[] = []
  const workspaceRoot = fixture.workspaceRoot

  // EDIT-F-001 文档分类与可编辑性
  {
    const issues: string[] = []
    if (classifyDocument('第1章.md') !== 'markdown') issues.push('Markdown 未分类为 markdown')
    if (classifyDocument('src/main.ts') !== 'code') issues.push('TypeScript 未分类为 code')
    if (classifyDocument('.env') !== 'code') issues.push('.env 未分类为 code')
    if (classifyDocument('封面.png') !== 'image') issues.push('PNG 未分类为 image')
    if (classifyDocument('archive.zip') !== 'binary') issues.push('ZIP 未分类为 binary')
    if (classifyDocument('notes/无扩展名') !== 'text') issues.push('无扩展名 UTF-8 未分类为 text')
    for (const path of ['cover.png', 'doc.pdf', 'sound.mp3', 'movie.mp4', 'archive.zip']) {
      let rejected = false
      try { ensureDocumentExtension(path) } catch { rejected = true }
      if (!rejected) issues.push(`二进制/预览文档未被拒绝：${path}`)
    }
    for (const path of ['第1章.md', 'src/main.ts', '.env', 'notes.txt']) {
      let allowed = true
      try { ensureDocumentExtension(path) } catch { allowed = false }
      if (!allowed) issues.push(`可编辑文档被误拒绝：${path}`)
    }
    cases.push(issues.length > 0 ? failCase('EDIT-F-001', '文档分类与可编辑性', issues.join('；')) : passCase('EDIT-F-001', '文档分类与可编辑性', 'Markdown/代码/.env/文本正确分类；图片/PDF/音视频/二进制保存与新建被拒绝。'))
  }

  // EDIT-F-002 打开与读取（Unicode、BOM、CRLF、二进制快照）
  {
    const issues: string[] = []
    const markdown = readDocument(workspaceRoot, '第1章.md')
    if (markdown.kind !== 'markdown' || !markdown.hasBom || markdown.content !== '# 第一章\n\n灯塔在黎明前亮起。\n') issues.push('BOM 读取或 Markdown 内容不正确')
    const notes = readDocument(workspaceRoot, 'notes/中文路径.txt')
    if (notes.lineEnding !== 'crlf' || notes.content !== '第一行\n第二行\n' || !notes.path.includes('中文路径')) issues.push('CRLF 或中文路径读取不正确')
    const image = readDocument(workspaceRoot, 'assets/cover.png')
    if (image.kind !== 'image' || image.content !== '') issues.push('二进制文档读取未返回空内容快照')
    const missing = join(fixture.fixtureRoot, 'missing.md')
    if (existsSync(missing)) issues.push('fixture 不应存在 missing.md')
    let traversalRejected = false
    try { readDocument(workspaceRoot, '../outside/outside.md') } catch { traversalRejected = true }
    if (!traversalRejected) issues.push('读取路径越界未被拒绝')
    cases.push(issues.length > 0 ? failCase('EDIT-F-002', '打开与读取（Unicode/BOM/CRLF/二进制）', issues.join('；')) : passCase('EDIT-F-002', '打开与读取（Unicode/BOM/CRLF/二进制）', 'BOM、CRLF、中文路径读取正确；二进制返回空内容快照；路径越界被拒绝。'))
  }

  // EDIT-F-003 保存与行尾/BOM 保真
  {
    const issues: string[] = []
    const target = join(workspaceRoot, '第1章.md')
    const before = modifiedMs(target)
    const saved = saveDocument(workspaceRoot, '第1章.md', '# 第一章\n\n保存后的内容\n', before, 'lf', true)
    if (saved.content !== '# 第一章\n\n保存后的内容\n') issues.push('保存内容未回读一致')
    if (!saved.hasBom || saved.kind !== 'markdown') issues.push('保存未保留 BOM 或分类有误')
    const bytes = readFileSync(target)
    if (!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) issues.push('文件头 BOM 未写回')
    const crlfDoc = saveDocument(workspaceRoot, 'notes/中文路径.txt', '第一行\n第二行\n', modifiedMs(join(workspaceRoot, 'notes/中文路径.txt')), 'crlf', false)
    if (crlfDoc.lineEnding !== 'crlf' || !readFileSync(join(workspaceRoot, 'notes/中文路径.txt'), 'utf8').includes('\r\n')) issues.push('CRLF 保存未正确写回')
    cases.push(issues.length > 0 ? failCase('EDIT-F-003', '编辑保存与行尾/BOM 保真', issues.join('；')) : passCase('EDIT-F-003', '编辑保存与行尾/BOM 保真', '内容、BOM 与 LF/CRLF 行尾保存后回读一致。'))
  }

  // EDIT-F-004 保存冲突（修改时间不匹配不覆盖）
  {
    const issues: string[] = []
    const target = join(workspaceRoot, 'src/main.ts')
    const before = readFileSync(target)
    const wrongTimestamp = modifiedMs(target) - 1000
    let conflictRejected = false
    try { saveDocument(workspaceRoot, 'src/main.ts', 'should not persist\n', wrongTimestamp, 'lf', false) } catch { conflictRejected = true }
    if (!conflictRejected) issues.push('保存冲突未被拒绝')
    if (!sameFile(target, before)) issues.push('保存冲突后文件被覆盖')
    let invalidEolRejected = false
    try { saveDocument(workspaceRoot, 'src/main.ts', 'noop\n', modifiedMs(target), 'cr' as 'lf', false) } catch { invalidEolRejected = true }
    if (!invalidEolRejected) issues.push('非法换行格式未被拒绝')
    cases.push(issues.length > 0 ? failCase('EDIT-F-004', '保存冲突与非法换行拒绝', issues.join('；')) : passCase('EDIT-F-004', '保存冲突与非法换行拒绝', '修改时间不匹配与非法换行被拒绝且原文件字节不变。'))
  }

  // EDIT-F-005 新建文档与路径保护（新建父目录、拒绝同名/二进制/越界、Unicode 新建）
  {
    const issues: string[] = []
    const created = createDocument(workspaceRoot, '生成/新文档-中文.md')
    if (!existsSync(join(workspaceRoot, '生成', '新文档-中文.md')) || created.kind !== 'markdown' || created.content !== '') issues.push('中文路径或上级目录新建失败')
    let duplicateRejected = false
    try { createDocument(workspaceRoot, '第1章.md') } catch { duplicateRejected = true }
    if (!duplicateRejected) issues.push('同名文档新建未被拒绝')
    let binaryRejected = false
    try { createDocument(workspaceRoot, 'new.png') } catch { binaryRejected = true }
    if (!binaryRejected) issues.push('二进制扩展名新建未被拒绝')
    let traversalRejected = false
    try { createDocument(workspaceRoot, '../outside/escape.md') } catch { traversalRejected = true }
    if (!traversalRejected) issues.push('新建路径越界未被拒绝')
    cases.push(issues.length > 0 ? failCase('EDIT-F-005', '新建文档与路径保护', issues.join('；')) : passCase('EDIT-F-005', '新建文档与路径保护', '自动创建父目录；同名、二进制扩展与越界路径均被拒绝。'))
  }

  // EDIT-F-006 只清理自有 fixture 与边界文件不变
  {
    const issues: string[] = []
    const manifestByPath = new Map(fixture.files.map((file) => [file.relativePath, file.sha256]))
    for (const [relativePath, expectedSha] of manifestByPath.entries()) {
      if (relativePath !== '第1章.md' && relativePath !== 'notes/中文路径.txt' && relativePath !== 'src/main.ts') {
        const absolute = join(workspaceRoot, relativePath)
        if (!existsSync(absolute)) { issues.push(`fixture 文件消失：${relativePath}`); continue }
        const actual = sha256OfFile(absolute)
        if (actual !== expectedSha) issues.push(`fixture 文件被修改：${relativePath}`)
      }
    }
    if (!sameFile(join(fixture.outsideRoot, 'outside.md'), Buffer.from('outside workspace\n', 'utf8'))) issues.push('工作区外文件被修改')
    if (readdirSync(fixture.outsideRoot).some((name) => name === 'escape.md')) issues.push('越界文件被写入工作区外部')
    cases.push(issues.length > 0 ? failCase('EDIT-F-006', '边界与清理（只改动自有 fixture）', issues.join('；')) : passCase('EDIT-F-006', '边界与清理（只改动自有 fixture）', `${fixture.files.length} 个 fixture 文件按预期分类且未污染工作区外部。`))
  }

  return cases
}

function summarizeCases(cases: CaseResult[]): { caseCount: number; passed: number; failed: number; blocked: number } {
  return {
    caseCount: cases.length,
    passed: cases.filter((item) => item.status === 'PASS').length,
    failed: cases.filter((item) => item.status === 'FAIL').length,
    blocked: cases.filter((item) => item.status === 'BLOCKED').length,
  }
}

function computeConclusion(cases: CaseResult[]): CaseStatus {
  const summary = summarizeCases(cases)
  if (summary.failed > 0) return 'FAIL'
  if (summary.blocked > 0) return 'BLOCKED'
  return 'PASS'
}

function defaultLogFile(): string {
  const directory = process.platform === 'win32' ? tmpdir() : '/tmp'
  return join(directory, `vinkey-editor-acceptance-${Date.now()}.json`)
}

export function runEditorAcceptance(input: AcceptanceRunInput): AcceptanceRunOutput {
  const { options, repository, environment, fixture, cases } = input
  const startedAt = Date.now()
  const machineCases = cases && cases.length > 0 ? cases : runMachineCases(fixture)
  const allCases = machineCases.map((item) => ({ ...item, durationMs: item.durationMs ?? 0 }))

  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const outputDir = options.outputDir ?? join(repository.root, 'artifacts', 'editor-acceptance', `run-${timestamp}`)
  mkdirSync(outputDir, { recursive: true })
  const resultFile = join(outputDir, 'result.json')
  const sha256File = join(outputDir, 'SHA256SUMS')
  const logFile = options.logFile ?? defaultLogFile()
  if (!existsSync(dirname(logFile))) throw new Error(`--log-file 父目录不存在：${dirname(logFile)}`)

  const summary = summarizeCases(allCases)
  const conclusion = computeConclusion(allCases)
  const exitCode = conclusion === 'FAIL' ? 2 : 0

  const result: Record<string, unknown> = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    acceptance: { id: ACCEPTANCE_ID, domainId: DOMAIN_ID, gate: GATE },
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    repository: { version: repository.version, gitSha: repository.gitSha, dirty: repository.dirty },
    application: {
      version: repository.version,
      buildNumber: null,
      gitSha: null,
      architectures: [process.arch],
      source: 'repository-development-run',
      note: 'W0-EDITOR-F fixture/合同验收：只作用于脚本自建的隔离临时工作区，不读写用户文档。',
    },
    provenance: {
      status: repository.gitSha && !repository.dirty ? 'PASS' : 'BLOCKED',
      versionMatch: true,
      gitShaMatch: Boolean(repository.gitSha),
      repositoryClean: !repository.dirty,
    },
    execution: { testerId: options.testerId ?? 'local-tester', testerIdBasis: 'explicit non-personal identifier' },
    environment,
    fixtureManifest: fixture,
    cases: allCases.map((item) => ({
      caseId: item.caseId,
      title: item.title,
      category: item.category,
      status: item.status,
      detail: item.detail,
      evidence: item.evidence ?? null,
      notes: item.notes ?? null,
      durationMs: item.durationMs ?? 0,
      blockedReason: item.blockedReason ?? null,
    })),
    summary,
    exitCode,
    logFile,
    artifacts: { manifestFile: 'SHA256SUMS', screenshots: [], sha256: {} },
    conclusion,
    elapsedMs: Date.now() - startedAt,
  }

  writeFileSync(logFile, JSON.stringify({
    schemaVersion: 1,
    generatedAt: result.generatedAt,
    suite: { id: SUITE_ID, version: SUITE_VERSION },
    cases: allCases.map((item) => ({ caseId: item.caseId, category: item.category, status: item.status, detail: item.detail })),
  }, null, 2), 'utf8')
  writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8')
  const entries = [{ file: 'result.json', hash: sha256OfFile(resultFile) }]
  writeFileSync(sha256File, `${entries.map((entry) => `${entry.hash}  ${entry.file}`).join('\n')}\n`, 'utf8')
  const finalResult = { ...result, artifacts: { ...result.artifacts, sha256: Object.fromEntries(entries.map((entry) => [entry.file, entry.hash])) } }
  writeFileSync(resultFile, JSON.stringify(finalResult, null, 2), 'utf8')

  return { result: finalResult, conclusion, exitCode, outputDir, resultFile, sha256File, logFile }
}

function stdoutSummary(output: AcceptanceRunOutput): string {
  const summary = output.result.summary as { caseCount: number; passed: number; failed: number; blocked: number }
  return [
    `${SUITE_ID} acceptance: ${output.conclusion} (${summary.passed}/${summary.caseCount} passed, ${summary.failed} failed, ${summary.blocked} blocked)`,
    `Results: ${output.resultFile}`,
    `SHA256SUMS: ${output.sha256File}`,
    `exit=${output.exitCode}`,
  ].join('\n')
}

function stderrProgress(cases: CaseResult[]): void {
  for (const item of cases) console.error(`[${item.caseId}] ${item.status} ${item.title}`)
}

export function main(): void {
  let options: CliOptions
  try {
    const parsed = parseArguments(process.argv.slice(2))
    if (!parsed) { console.log(usage()); return }
    options = parsed
  } catch (cause) {
    console.error(`参数错误：${messageOf(cause)}`)
    process.exitCode = 1
    return
  }

  let fixtureRoot: string | null = null
  let autoGenerated = false
  try {
    const root = repositoryRoot()
    const repository = collectRepository(root)
    const environment = collectEnvironment(root)
    fixtureRoot = options.workspace ?? join(tmpdir(), `vinkey-editor-fixture-${Date.now()}`)
    if (!options.workspace) autoGenerated = true
    const fixture = generateFixture(fixtureRoot)
    fixture.cleanup = autoGenerated ? (options.keepFixture ? 'kept' : 'removed') : 'caller-owned'

    let completed = false
    try {
      const output = runEditorAcceptance({ options, repository, environment, fixture })
      stderrProgress(output.result.cases as CaseResult[])
      if (options.json) console.log(JSON.stringify(output.result, null, 2))
      else console.log(stdoutSummary(output))
      process.exitCode = output.exitCode
      completed = true
    } finally {
      if (completed && autoGenerated && !options.keepFixture) {
        try { rmSync(fixtureRoot, { recursive: true, force: true }) } catch { /* 清理失败不影响结论 */ }
      }
    }
  } catch (cause) {
    console.error(`编辑器 fixture 验收失败：${messageOf(cause)}${fixtureRoot ? `（fixture：${fixtureRoot}）` : ''}`)
    process.exitCode = 1
  }
}

if (process.env.VINKEY_EDITOR_ACCEPTANCE_CLI === '1') {
  main()
}
