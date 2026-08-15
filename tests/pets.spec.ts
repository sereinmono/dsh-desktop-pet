import { describe, expect, it, vi, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanPets, scanPetsRoots, resolvePetManifest, sameCatalog } from '../src/pets'

function makePetDir(id: string, displayName?: string, manifestId = id) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pets-'))
  const dir = join(root, id)
  mkdirSync(dir, { recursive: true })
  const manifest: Record<string, unknown> = { id: manifestId }
  if (displayName !== undefined) manifest.displayName = displayName
  writeFileSync(join(dir, 'pet.json'), JSON.stringify(manifest))
  return root
}

describe('scanPets', () => {
  it('returns the fallback text entry when the directory is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pets-'))
    const entries = scanPets(root)
    expect(entries).toEqual([{ id: 'text', displayName: 'Text (test)' }])
  })

  it('returns the fallback when the directory does not exist', () => {
    const entries = scanPets(join(tmpdir(), 'does-not-exist'))
    expect(entries).toEqual([{ id: 'text', displayName: 'Text (test)' }])
  })

  it('scans valid pet directories and reads their manifests', () => {
    const root = makePetDir('cat', 'Cat')
    mkdirSync(join(root, 'dog'))
    writeFileSync(join(root, 'dog', 'pet.json'), JSON.stringify({ id: 'dog', displayName: 'Dog' }))
    const entries = scanPets(root)
    expect(entries).toContainEqual({ id: 'cat', displayName: 'Cat' })
    expect(entries).toContainEqual({ id: 'dog', displayName: 'Dog' })
  })

  it('skips invalid directories', () => {
    const root = makePetDir('good', 'Good')
    // A directory without pet.json, and a directory with an id-less manifest.
    mkdirSync(join(root, 'empty'))
    mkdirSync(join(root, 'bad'))
    writeFileSync(join(root, 'bad', 'pet.json'), JSON.stringify({ displayName: 'No id' }))
    const entries = scanPets(root)
    expect(entries).toEqual([{ id: 'good', displayName: 'Good' }])
  })
})

describe('scanPetsRoots multi-root', () => {
  it('merges entries from all roots, deduplicating by id with the first root winning', () => {
    const user = makePetDir('cat', 'User Cat')
    const bundled = makePetDir('dog', 'Bundled Dog')
    makePetDir('cat', 'Bundled Cat') // duplicate id in the second root

    const entries = scanPetsRoots([user, bundled])
    // cat comes from the user root (first); dog from the bundled root.
    expect(entries).toEqual([
      { id: 'cat', displayName: 'User Cat' },
      { id: 'dog', displayName: 'Bundled Dog' },
    ])
  })

  it('returns an empty list (raw merge) when every root is empty; scanPets wraps the fallback', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pets-'))
    expect(scanPetsRoots([root])).toEqual([])
    // The fallback lives on the scanPets wrapper, not the raw multi-root merge.
    expect(scanPets(root)).toEqual([{ id: 'text', displayName: 'Text (test)' }])
  })
})

describe('sameCatalog', () => {
  const scan: Array<{ id: string; displayName: string }> = [
    { id: 'boxcat', displayName: 'Boxcat' },
    { id: 'text', displayName: 'Text (test)' },
  ]

  it('matches an identical list', () => {
    expect(sameCatalog(scan, scan)).toBe(true)
  })

  it('flags a list containing a removed pet', () => {
    const stale = [...scan, { id: 'ghost', displayName: 'Ghost' }]
    expect(sameCatalog(stale, scan)).toBe(false)
  })

  it('flags a missing/undefined list', () => {
    expect(sameCatalog(undefined, scan)).toBe(false)
  })
})

describe('resolvePetManifest root attribution', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('attributes a pet in the user directory to the user root', async () => {
    vi.stubEnv('HOME', mkdtempSync(join(tmpdir(), 'dsh-home-')))
    const { userPetsDir } = await import('../src/pets')
    const dir = userPetsDir()
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(dir, 'cat'))
    writeFileSync(join(dir, 'cat', 'pet.json'), JSON.stringify({ id: 'cat', spritesheetPath: 'sheet.webp' }))
    // Move the real bundled pets out of the way so the stub env wins.
    const ref = await resolvePetManifest('cat')
    expect(ref.root).toBe('user')
    expect(ref.petId).toBe('cat')
    rmSync(dir, { recursive: true, force: true })
  })
})
