import { isLoopbackModelEndpoint } from './modelPrivacy'

export interface LocalHardware {
  platform: string
  architecture: string
  totalMemoryBytes: number | null
  gpuMemoryBytes: number | null
  unifiedMemory: boolean
}

export type HardwareTier = 'minimum' | 'standard' | 'recommended' | 'insufficient' | 'unknown'
export const hardwareTierLabels: Record<HardwareTier, string> = {
  minimum: '最低配置', standard: '标准配置', recommended: '推荐配置', insufficient: '低于最低配置', unknown: '硬件未确认',
}
const GiB = 1024 ** 3

export function isLocalModelConnection(connection: { baseUrl: string } | null | undefined): boolean {
  return Boolean(connection && isLoopbackModelEndpoint(connection.baseUrl))
}

export function hardwareTier(hardware: LocalHardware | null): HardwareTier {
  if (!hardware || !hardware.totalMemoryBytes || !Number.isFinite(hardware.totalMemoryBytes)) return 'unknown'
  // Allow physical RAM reserved by the OS; do not add RAM and discrete VRAM.
  const ram = hardware.totalMemoryBytes / GiB / 0.97
  if (ram < 16) return 'insufficient'
  if (hardware.unifiedMemory) return ram >= 64 ? 'recommended' : ram >= 32 ? 'standard' : 'minimum'
  if (hardware.gpuMemoryBytes === null || !Number.isFinite(hardware.gpuMemoryBytes)) return 'unknown'
  const vram = hardware.gpuMemoryBytes / GiB / 0.97
  if (vram < 8) return 'insufficient'
  return ram >= 64 && vram >= 24 ? 'recommended' : ram >= 32 && vram >= 16 ? 'standard' : 'minimum'
}

export function hardwareSummary(hardware: LocalHardware | null): string {
  if (!hardware) return '硬件信息不可用'
  const amount = (bytes: number | null) => bytes === null ? '未确认' : `${Math.round(bytes / GiB)} GB`
  return hardware.unifiedMemory ? `统一内存 ${amount(hardware.totalMemoryBytes)}`
    : `内存 ${amount(hardware.totalMemoryBytes)} · 独立显存 ${amount(hardware.gpuMemoryBytes)}`
}

export const LOCAL_CONTEXT_WINDOW = 16_384
export const LOCAL_HARDWARE_ADVICE = '本机配置较低，建议使用局域网或远程模型服务。'
