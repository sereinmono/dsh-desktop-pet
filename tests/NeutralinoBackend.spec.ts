import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NeutralinoBackend, resolveRuntimeBinary } from '../src/renderer/backend/NeutralinoBackend'

const ENV_KEY = 'DSH_PET_NEUTRALINO_BIN'

afterEach(() => {
  delete process.env[ENV_KEY]
})

describe('resolveRuntimeBinary', () => {
  it('honors an env override pointing at an existing binary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-nlbin-'))
    const fake = join(dir, 'neutralino-fake.exe')
    writeFileSync(fake, 'x')
    process.env[ENV_KEY] = fake
    expect(resolveRuntimeBinary()).toBe(fake)
    rmSync(dir, { recursive: true, force: true })
  })

  it('ignores an env override pointing at a missing file', () => {
    const missing = join(tmpdir(), 'does-not-exist-', 'neutralino.exe')
    process.env[ENV_KEY] = missing
    expect(resolveRuntimeBinary()).not.toBe(missing)
    expect(existsSync(missing)).toBe(false)
  })

  it('never throws on the current platform', () => {
    expect(() => resolveRuntimeBinary()).not.toThrow()
  })
})

describe('NeutralinoBackend', () => {
  it('reports its name and answers isSupported without throwing', () => {
    const backend = new NeutralinoBackend()
    expect(backend.name).toBe('neutralino')
    expect(typeof backend.isSupported()).toBe('boolean')
  })
})
