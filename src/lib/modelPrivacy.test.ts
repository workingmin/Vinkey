import { describe, expect, it } from 'vitest'
import { isLoopbackModelEndpoint } from './modelPrivacy'

describe('model source privacy', () => {
  it.each(['http://localhost:11434', 'http://127.0.0.1:1234/v1', 'http://127.12.34.56:9000', 'http://[::1]:8080'])(
    'accepts loopback endpoint %s',
    (value) => expect(isLoopbackModelEndpoint(value)).toBe(true),
  )

  it.each(['https://api.openai.com/v1', 'http://192.168.1.20:11434', 'not-a-url'])(
    'rejects non-loopback endpoint %s',
    (value) => expect(isLoopbackModelEndpoint(value)).toBe(false),
  )
})
