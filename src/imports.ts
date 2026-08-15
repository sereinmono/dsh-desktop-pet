/**
 * Pet import: validate a pet directory, copy it into the per-user pets
 * directory, and drive the third-party Petdex CLI (`npx petdex install`).
 *
 * Import targets are user-owned (`~/.dsh/desktop-pet/pets/<id>/`), so imported
 * pets survive npm upgrades of the plugin. All failures surface as
 * machine-readable error codes the client translates into UI copy — the host
 * never mixes display language into its results.
 */

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { USER_PETS_DIR } from './paths'

/** Spawn signature narrowed for injection (tests swap in a fake). */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { cwd: string; shell?: boolean; stdio: ['ignore', 'pipe', 'pipe'] },
) => ChildProcess

/** Machine-readable import outcomes; the client maps these to UI copy. */
export type ImportCode =
  | 'ok'
  | 'already-present'
  | 'source-not-directory'
  | 'no-pet-json'
  | 'invalid-manifest'
  | 'missing-id'
  | 'missing-spritesheet-path'
  | 'unsafe-spritesheet-path'
  | 'missing-spritesheet-file'
  | 'duplicate-id'
  | 'copy-failed'
  | 'petdex-failed'
  | 'petdex-not-found'
  | 'no-folder-picker'

export interface ImportResult {
  ok: boolean
  code: ImportCode
  /** Optional human detail (e.g. a CLI stderr snippet) for logging. */
  detail?: string
  /** The imported pet id (present on success). */
  petId?: string
  /** The imported pet's display name (present on success). */
  displayName?: string
}

/** Where the Petdex CLI downloads pets (`~/.petdex/pets/<slug>/`). */
function petdexInstallDir(): string {
  return join(homedir(), '.petdex', 'pets')
}

/** Legacy install location documented by older guides (`~/.codex/pets/<slug>/`). */
function codexInstallDir(): string {
  return join(homedir(), '.codex', 'pets')
}

/** Read and validate a pet directory's manifest, returning its key fields. */
function readManifest(directory: string): { id: string; displayName: string; spritesheetPath: string } {
  const manifestPath = join(directory, 'pet.json')
  let raw: string
  try {
    raw = readFileSync(manifestPath, 'utf8')
  } catch {
    throw importFailure('no-pet-json')
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw importFailure('invalid-manifest')
  }
  if (typeof value !== 'object' || value === null) throw importFailure('invalid-manifest')
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) throw importFailure('missing-id')
  if (typeof record.spritesheetPath !== 'string' || record.spritesheetPath.length === 0) {
    throw importFailure('missing-spritesheet-path')
  }
  // Only a plain file name is acceptable: a path escaping the pet directory
  // would break the mount URL and could read outside assets on the frontend.
  if (basename(record.spritesheetPath) !== record.spritesheetPath) throw importFailure('unsafe-spritesheet-path')
  const displayName = typeof record.displayName === 'string' && record.displayName.length > 0
    ? record.displayName
    : record.id
  return { id: record.id, displayName, spritesheetPath: record.spritesheetPath }
}

/** Validate that `spritesheetPath` exists next to `pet.json` and is an image. */
function assertSpritesheet(directory: string, spritesheetPath: string): void {
  const file = join(directory, spritesheetPath)
  let stat
  try {
    stat = statSync(file)
  } catch {
    throw importFailure('missing-spritesheet-file')
  }
  if (!stat.isFile()) throw importFailure('missing-spritesheet-file')
  const ext = basename(spritesheetPath).toLowerCase()
  if (!ext.endsWith('.webp') && !ext.endsWith('.png')) {
    throw importFailure('missing-spritesheet-file')
  }
}

/** Copy only the pet files (manifest + sprite sheet) into a target root. */
function copyIntoPetsRoot(id: string, source: string, spritesheetPath: string, targetRoot: string): void {
  const dest = join(targetRoot, id)
  if (existsSync(dest)) {
    // A directory may already exist from an earlier import whose catalog
    // write-back was lost (e.g. a settings write race). If it is a valid pet,
    // adopt it instead of failing — the caller re-publishes the catalog so the
    // pet shows up in the list. Only a broken existing directory is refused.
    let valid = false
    try {
      const existing = readManifest(dest)
      assertSpritesheet(dest, existing.spritesheetPath)
      valid = true
    } catch { /* invalid existing directory */ }
    if (valid) throw importFailure('already-present')
    throw importFailure('duplicate-id')
  }
  try {
    mkdirSync(dest, { recursive: true })
    copyFileSync(join(source, 'pet.json'), join(dest, 'pet.json'))
    copyFileSync(join(source, spritesheetPath), join(dest, spritesheetPath))
  } catch (error) {
    // Roll back a partial copy so a failed import never leaves a broken pet.
    try { rmSync(dest, { recursive: true, force: true }) } catch { /* best-effort */ }
    throw importFailure('copy-failed', (error as Error)?.message)
  }
}

function importFailure(code: ImportCode, detail?: string): Error {
  return Object.assign(new Error(code), { code, detail })
}

/**
 * Import a pet from a local directory: validate the manifest and sprite sheet,
 * then copy the pet files into the target pets root.
 *
 * @param sourceDir - directory containing `pet.json` + a sprite sheet.
 * @param targetRoot - destination pets root (defaults to the user pets dir).
 * @returns the imported pet's id and display name.
 */
export function importPetFromDirectory(sourceDir: string, targetRoot: string = USER_PETS_DIR): ImportResult {
  let stat
  try {
    stat = statSync(sourceDir)
  } catch {
    return { ok: false, code: 'source-not-directory' }
  }
  if (!stat.isDirectory()) return { ok: false, code: 'source-not-directory' }

  let manifest
  try {
    manifest = readManifest(sourceDir)
    assertSpritesheet(sourceDir, manifest.spritesheetPath)
  } catch (error) {
    const failure = error as { code: ImportCode; detail?: string }
    return { ok: false, code: failure.code, detail: failure.detail }
  }

  try {
    copyIntoPetsRoot(manifest.id, sourceDir, manifest.spritesheetPath, targetRoot)
  } catch (error) {
    const failure = error as { code: ImportCode; detail?: string }
    if (failure.code === 'already-present') {
      // The pet is already installed (and valid): not an error — the caller
      // re-publishes the catalog so the pet shows up in the picker.
      return { ok: true, code: 'already-present', petId: manifest.id, displayName: manifest.displayName }
    }
    return { ok: false, code: failure.code, detail: failure.detail }
  }

  return { ok: true, code: 'ok', petId: manifest.id, displayName: manifest.displayName }
}

/** Locate a downloaded Petdex pet directory (new + legacy install locations). */
function findPetdexPet(slug: string): string | undefined {
  for (const root of [petdexInstallDir(), codexInstallDir()]) {
    const candidate = join(root, slug)
    if (existsSync(join(candidate, 'pet.json'))) return candidate
  }
  return undefined
}

/**
 * Import a pet from the Petdex community CLI. Runs `npx --yes petdex install
 * <slug>` (the CLI confirms the slug exists and downloads the pet), then
 * copies the downloaded directory into the target pets root.
 *
 * The slug is passed as a plain argv entry (no shell), so it cannot inject
 * shell commands.
 */
export function importPetFromPetdex(
  slug: string,
  targetRoot: string = USER_PETS_DIR,
  spawnFn: SpawnFn = nodeSpawn as SpawnFn,
): Promise<ImportResult> {
  const trimmed = slug.trim()
  if (trimmed.length === 0) {
    return Promise.resolve({ ok: false, code: 'petdex-not-found', detail: 'empty slug' })
  }

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    let child: ChildProcess
    try {
      // On Windows, `.cmd` shims cannot be spawned directly — Node throws
      // EINVAL unless `shell: true` (which routes through cmd.exe). The args
      // array is still quoted by Node, so the slug cannot inject shell syntax.
      child = spawnFn(isWindows ? 'npx.cmd' : 'npx', ['--yes', 'petdex', 'install', trimmed], {
        cwd: tmpdir(),
        shell: isWindows,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      // A synchronous spawn failure (e.g. EINVAL on an unusual platform) must
      // surface as a failure result, never as a thrown/rejected import.
      resolve({ ok: false, code: 'petdex-failed', detail: (error as Error)?.message })
      return
    }
    let stderr = ''
    let timedOut = false
    child.stdout?.on('data', () => { /* CLI progress; diagnostic only */ })
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, 120_000)

    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, code: 'petdex-failed', detail: error?.message })
    })

    child.on('exit', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        resolve({ ok: false, code: 'petdex-failed', detail: 'timed out after 120s' })
        return
      }
      if (code !== 0) {
        resolve({ ok: false, code: 'petdex-failed', detail: stderr.trim().slice(0, 300) || `exit code ${code}` })
        return
      }
      const downloaded = findPetdexPet(trimmed)
      if (!downloaded) {
        resolve({ ok: false, code: 'petdex-not-found' })
        return
      }
      // Reuse the directory import path (validation + copy + conflict rules).
      resolve(importPetFromDirectory(downloaded))
    })
  })
}

/**
 * Look up a slug in the local Petdex install directory without running the
 * CLI (used to check "already downloaded" before offering a re-install).
 */
export function isPetdexPetPresent(slug: string): boolean {
  return findPetdexPet(slug) !== undefined
}

/** List slugs already downloaded by the Petdex CLI (diagnostics). */
export function listPetdexPets(): string[] {
  const roots = [petdexInstallDir(), codexInstallDir()]
  const slugs: string[] = []
  for (const root of roots) {
    let names
    try {
      names = readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const dirent of names) {
      if (dirent.isDirectory() && existsSync(join(root, dirent.name, 'pet.json')) && !slugs.includes(dirent.name)) {
        slugs.push(dirent.name)
      }
    }
  }
  return slugs
}
