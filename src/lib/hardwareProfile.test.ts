import { describe, expect, it } from 'vitest'
import { hardwareTier, isLocalModelConnection, recommendLocalModel, type LocalHardware } from './hardwareProfile'

const GiB = 1024 ** 3
const hardware = (ram: number, vram: number | null = null, unifiedMemory = false): LocalHardware => ({
  platform: unifiedMemory ? 'macos' : 'windows', architecture: 'test',
  totalMemoryBytes: ram * GiB, gpuMemoryBytes: vram === null ? null : vram * GiB, unifiedMemory,
})

describe('local hardware assignment', () => {
  it('uses unified memory without double counting it as VRAM', () => {
    expect(hardwareTier(hardware(8, null, true))).toBe('insufficient')
    expect(hardwareTier(hardware(16, null, true))).toBe('minimum')
    expect(hardwareTier(hardware(32, null, true))).toBe('standard')
    expect(hardwareTier(hardware(64, null, true))).toBe('recommended')
  })
  it('requires both RAM and single-device VRAM for discrete tiers', () => {
    expect(hardwareTier(hardware(64, 4))).toBe('insufficient')
    expect(hardwareTier(hardware(8, 24))).toBe('insufficient')
    expect(hardwareTier(hardware(15.8, 8))).toBe('minimum')
    expect(hardwareTier(hardware(32, 16))).toBe('standard')
    expect(hardwareTier(hardware(64, 24))).toBe('recommended')
    expect(hardwareTier(hardware(16, 24))).toBe('minimum')
  })
  it('keeps missing hardware distinct from below-minimum hardware', () => {
    expect(hardwareTier(null)).toBe('unknown')
    expect(hardwareTier(hardware(32))).toBe('unknown')
    expect(hardwareTier(hardware(32, 0))).toBe('insufficient')
  })
  it('applies local policy only to loopback connections of either provider', () => {
    expect(isLocalModelConnection({ baseUrl: 'http://localhost:11434' })).toBe(true)
    expect(isLocalModelConnection({ baseUrl: 'http://[::1]:1234/v1' })).toBe(true)
    expect(isLocalModelConnection({ baseUrl: 'http://192.168.1.8:11434' })).toBe(false)
    expect(isLocalModelConnection({ baseUrl: 'https://api.example.com/v1' })).toBe(false)
  })
  it('selects only discovered models that fit the tier and falls back safely', () => {
    const models = ['qwen3:32b', 'qwen3:14b', 'qwen3:8b', 'openbmb/minicpm4.1:latest']
    expect(recommendLocalModel(models, 'general', 'minimum')).toBe('qwen3:8b')
    expect(recommendLocalModel(models, 'general', 'standard')).toBe('qwen3:14b')
    expect(recommendLocalModel(models, 'general', 'recommended')).toBe('qwen3:32b')
    expect(recommendLocalModel(models, 'efficient', 'recommended')).toBe('openbmb/minicpm4.1:latest')
    expect(recommendLocalModel(['qwen3:8b'], 'general', 'recommended')).toBe('qwen3:8b')
    expect(recommendLocalModel(['qwen3:32b', 'qwen3:8b-fp16', 'custom'], 'general', 'minimum')).toBeNull()
    expect(recommendLocalModel(models, 'general', 'insufficient')).toBeNull()
    expect(recommendLocalModel(models, 'general', 'unknown')).toBeNull()
  })
})
