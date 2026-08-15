import { describe, expect, it } from 'vitest'
import { webUiUrl } from '../src/webui'

describe('webUiUrl', () => {
  it('builds the loopback URL from the web server port', () => {
    expect(webUiUrl(3080)).toBe('http://127.0.0.1:3080')
    expect(webUiUrl(18080)).toBe('http://127.0.0.1:18080')
  })

  it('returns undefined when the port is missing or invalid', () => {
    expect(webUiUrl(undefined)).toBeUndefined()
    expect(webUiUrl(0)).toBeUndefined()
    expect(webUiUrl(-1)).toBeUndefined()
    expect(webUiUrl(1.5)).toBeUndefined()
  })
})
