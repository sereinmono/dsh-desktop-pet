/**
 * Host-side pet catalog: scans the bundled `assets/pets/` directory plus the
 * per-user `~/.dsh/desktop-pet/pets/` directory (where imported pets live) and
 * resolves a pet directory into a sprite-sheet reference.
 *
 * User-imported pets shadow bundled pets with the same id: the user directory
 * is scanned first so a user override wins, and imported pets survive npm
 * upgrades (they live outside the installed package).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PetCatalogEntry } from './config'
import { PETS_DIR, USER_PETS_DIR } from './paths'

/** Fallback entry used when no pet directory can be found on disk. */
const FALLBACK_ENTRY: PetCatalogEntry = { id: 'text', displayName: 'Text (test)' }

/** Scan one pets directory for valid pet directories (helper, test-friendly). */
function scanDirectory(directory: string): PetCatalogEntry[] {
  const entries: PetCatalogEntry[] = []
  let names
  try {
    names = readdirSync(directory, { withFileTypes: true })
  } catch {
    // Directory missing entirely; nothing to scan.
    return entries
  }
  for (const dirent of names) {
    if (!dirent.isDirectory()) continue
    const id = dirent.name
    try {
      const raw = readFileSync(join(directory, id, 'pet.json'), 'utf8')
      const manifest = JSON.parse(raw) as Record<string, unknown>
      if (typeof manifest.id !== 'string' || manifest.id.length === 0) continue
      const displayName = typeof manifest.displayName === 'string' && manifest.displayName.length > 0
        ? manifest.displayName
        : id
      entries.push({ id, displayName })
    } catch {
      // Not a valid pet directory; skip it.
    }
  }
  return entries
}

/**
 * Scan a set of pets roots for valid pet directories, deduplicating by id with
 * earlier roots winning. Used by {@link scanPets} and directly by tests.
 */
export function scanPetsRoots(roots: readonly string[]): PetCatalogEntry[] {
  const entries: PetCatalogEntry[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    for (const entry of scanDirectory(root)) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      entries.push(entry)
    }
  }
  return entries
}

/**
 * Scan the pet catalog: the bundled `assets/pets/` directory plus the
 * per-user imported-pets directory. The user directory wins on id conflicts
 * (imported pets shadow bundled ones).
 *
 * A directory is a pet if it contains a readable `pet.json` with a string
 * `id`. The directory name is the pet id. Invalid directories are skipped so
 * one broken pet never takes down the catalog. Returns the fallback `text`
 * entry when nothing valid is found.
 *
 * Synchronous so the settings namespace can be registered with the complete
 * catalog as its `base` during the plugin's synchronous startup.
 *
 * @param directory - when given, scans only that directory (used by tests and
 *   keeps the bundled path injectable); otherwise scans both roots.
 */
export function scanPets(directory?: string): PetCatalogEntry[] {
  const roots = directory !== undefined ? [directory] : [USER_PETS_DIR, PETS_DIR]
  const entries = scanPetsRoots(roots)
  return entries.length > 0 ? entries : [FALLBACK_ENTRY]
}

/** The manifest fields the renderer needs to point the frontend at a sprite sheet. */
export interface PetManifestRef {
  petId: string
  /** Manifest `spritesheetPath`, relative to the pet directory. */
  spritesheetPath: string
  /** Which root the pet resolves from (drives the frontend asset URL). */
  root: PetRoot
}

/** Where a pet id can live on disk. */
export type PetRoot = 'bundled' | 'user'

/** Resolve a pet id to its on-disk directory and root (user first). */
export function petSource(petId: string): { directory: string; root: PetRoot } {
  const userDir = join(USER_PETS_DIR, petId)
  if (existsSync(join(userDir, 'pet.json'))) return { directory: userDir, root: 'user' }
  return { directory: join(PETS_DIR, petId), root: 'bundled' }
}

/** The on-disk directory a pet id resolves to (user root first). */
export function petDirectory(petId: string): string {
  return petSource(petId).directory
}

/**
 * Resolve a pet by id into its sprite sheet reference. The user directory is
 * checked first, then the bundled one; the manifest is read live from disk.
 * No pixel decoding happens here — the frontend loads the sheet itself.
 * Throws if the directory or manifest is unreadable.
 */
export async function resolvePetManifest(petId: string): Promise<PetManifestRef> {
  const { directory, root } = petSource(petId)
  const raw = readFileSync(join(directory, 'pet.json'), 'utf8')
  const manifest = JSON.parse(raw) as Record<string, unknown>
  if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
    throw new Error(`pet.json in "${petId}" is missing a string "id" field`)
  }
  if (typeof manifest.spritesheetPath !== 'string' || manifest.spritesheetPath.length === 0) {
    throw new Error(`pet.json in "${petId}" is missing a string "spritesheetPath" field`)
  }
  return { petId, spritesheetPath: manifest.spritesheetPath, root }
}

/** The per-user imported-pets directory (used by tests). */
export function userPetsDir(): string {
  return USER_PETS_DIR
}

/**
 * Whether a settings-side pet list matches a disk scan (same ids, same order).
 * Used to detect a stale `availablePets` user layer (e.g. a pet whose
 * directory was removed) so the host can write the scan back.
 */
export function sameCatalog(a: readonly PetCatalogEntry[] | undefined, b: readonly PetCatalogEntry[]): boolean {
  if (!Array.isArray(a)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
  }
  return true
}
