import { describe, expect, it, vi, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importPetFromDirectory, importPetFromPetdex, type SpawnFn } from '../src/imports'

/** A fake ChildProcess that reports a single exit code. */
function fakeChild(exitCode: number): SpawnFn {
  return (() => {
    return {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (event: string, cb: (code: number) => void) => {
        if (event === 'exit') {
          // Defer so the caller has finished wiring up its handlers.
          setTimeout(() => cb(exitCode), 0)
        }
        return undefined as never
      },
      kill: () => {},
      pid: 123,
    } as never
  }) as SpawnFn
}

function makeSourceDir(name = 'cat'): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-import-'))
  mkdirSync(join(dir, name))
  writeFileSync(join(dir, name, 'pet.json'), JSON.stringify({ id: name, displayName: 'Cat', spritesheetPath: 'sheet.webp' }))
  writeFileSync(join(dir, name, 'sheet.webp'), Buffer.from([0, 1, 2, 3]))
  return dir
}

function makeTarget(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-import-target-'))
}

describe('importPetFromDirectory', () => {
  it('imports a valid pet directory into the target root', () => {
    const source = makeSourceDir('cat')
    const target = makeTarget()
    const result = importPetFromDirectory(join(source, 'cat'), target)
    expect(result.ok).toBe(true)
    expect(result.petId).toBe('cat')
    expect(result.displayName).toBe('Cat')
    expect(existsSync(join(target, 'cat', 'pet.json'))).toBe(true)
    expect(existsSync(join(target, 'cat', 'sheet.webp'))).toBe(true)
    expect(readFileSync(join(target, 'cat', 'pet.json'), 'utf8')).toContain('"id":"cat"')
    rmSync(source, { recursive: true, force: true })
    rmSync(target, { recursive: true, force: true })
  })

  it('rejects a missing source directory', () => {
    const result = importPetFromDirectory(join(tmpdir(), 'does-not-exist-dir'), makeTarget())
    expect(result.ok).toBe(false)
    expect(result.code).toBe('source-not-directory')
  })

  it('rejects a source missing pet.json', () => {
    const source = makeSourceDir('cat')
    rmSync(join(source, 'cat', 'pet.json'))
    const result = importPetFromDirectory(join(source, 'cat'), makeTarget())
    expect(result.ok).toBe(false)
    expect(result.code).toBe('no-pet-json')
    rmSync(source, { recursive: true, force: true })
  })

  it('rejects a malformed manifest', () => {
    const source = makeSourceDir('cat')
    writeFileSync(join(source, 'cat', 'pet.json'), '{not json')
    const result = importPetFromDirectory(join(source, 'cat'), makeTarget())
    expect(result.ok).toBe(false)
    expect(result.code).toBe('invalid-manifest')
    rmSync(source, { recursive: true, force: true })
  })

  it('rejects a missing spritesheet file', () => {
    const source = makeSourceDir('cat')
    rmSync(join(source, 'cat', 'sheet.webp'))
    const result = importPetFromDirectory(join(source, 'cat'), makeTarget())
    expect(result.ok).toBe(false)
    expect(result.code).toBe('missing-spritesheet-file')
    rmSync(source, { recursive: true, force: true })
  })

  it('rejects a spritesheet path escaping the directory', () => {
    const source = makeSourceDir('cat')
    writeFileSync(join(source, 'cat', 'pet.json'), JSON.stringify({ id: 'cat', spritesheetPath: '../escape.webp' }))
    const result = importPetFromDirectory(join(source, 'cat'), makeTarget())
    expect(result.ok).toBe(false)
    expect(result.code).toBe('unsafe-spritesheet-path')
    rmSync(source, { recursive: true, force: true })
  })

  it('adopts an existing valid pet as already-present (catalog re-publish)', () => {
    const source = makeSourceDir('cat')
    const target = makeTarget()
    // A prior import left a VALID pet directory behind (e.g. its catalog
    // write-back was lost); re-importing should succeed and re-publish it.
    mkdirSync(join(target, 'cat'))
    writeFileSync(join(target, 'cat', 'pet.json'), JSON.stringify({ id: 'cat', displayName: 'Cat', spritesheetPath: 'sheet.webp' }))
    writeFileSync(join(target, 'cat', 'sheet.webp'), Buffer.from([9, 9, 9, 9]))
    const result = importPetFromDirectory(join(source, 'cat'), target)
    expect(result.ok).toBe(true)
    expect(result.code).toBe('already-present')
    expect(result.petId).toBe('cat')
    rmSync(source, { recursive: true, force: true })
    rmSync(target, { recursive: true, force: true })
  })

  it('rejects an existing broken directory as duplicate-id', () => {
    const source = makeSourceDir('cat')
    const target = makeTarget()
    // The existing directory is present but NOT a valid pet (no spritesheet).
    mkdirSync(join(target, 'cat'))
    writeFileSync(join(target, 'cat', 'pet.json'), JSON.stringify({ id: 'cat' }))
    const result = importPetFromDirectory(join(source, 'cat'), target)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('duplicate-id')
    rmSync(source, { recursive: true, force: true })
    rmSync(target, { recursive: true, force: true })
  })
})

describe('importPetFromPetdex', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails fast on an empty slug', async () => {
    const result = await importPetFromPetdex('   ', makeTarget())
    expect(result.ok).toBe(false)
    expect(result.code).toBe('petdex-not-found')
  })

  it('reports petdex-failed when the CLI exits non-zero', async () => {
    vi.stubEnv('HOME', mkdtempSync(join(tmpdir(), 'dsh-home-')))
    const result = await importPetFromPetdex('nope', makeTarget(), fakeChild(1))
    expect(result.ok).toBe(false)
    expect(result.code).toBe('petdex-failed')
  })

  it('reports petdex-not-found when the CLI succeeds but no pet dir appears', async () => {
    vi.stubEnv('HOME', mkdtempSync(join(tmpdir(), 'dsh-home-')))
    const result = await importPetFromPetdex('ghost', makeTarget(), fakeChild(0))
    expect(result.ok).toBe(false)
    expect(result.code).toBe('petdex-not-found')
  })
})
