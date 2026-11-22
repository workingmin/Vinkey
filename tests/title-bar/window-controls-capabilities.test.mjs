import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const capabilitiesPath = new URL('../../src-tauri/capabilities/default.json', import.meta.url)
const capabilities = JSON.parse(readFileSync(capabilitiesPath, 'utf8'))

describe('Windows self-drawn title bar window-control permissions', () => {
  it('grants all Tauri window commands invoked by the minimize/maximize/close buttons', () => {
    const required = [
      'core:window:allow-minimize',
      'core:window:allow-maximize',
      'core:window:allow-unmaximize',
      'core:window:allow-toggle-maximize',
      'core:window:allow-close',
    ]
    for (const permission of required) {
      expect(capabilities.permissions, `missing ${permission}`).toContain(permission)
    }
  })

  it('grants window dragging so the custom title bar remains movable', () => {
    expect(capabilities.permissions).toContain('core:window:allow-start-dragging')
  })

  it('scopes the granted window commands to the main window', () => {
    expect(capabilities.windows).toContain('main')
  })
})
