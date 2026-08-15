/**
 * Package-root-relative asset paths.
 *
 * This module lives exactly one directory below the package root in both
 * source (`src/`) and built output (`lib/`), so a single relative URL resolves
 * identically before and after bundling. Do NOT compute asset paths from
 * deeper modules: their `import.meta.url` depth changes once inlined into
 * `lib/index.js`.
 */

import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Bundled assets directory (`assets/`). */
export const ASSETS_DIR = join(PACKAGE_ROOT, 'assets')
/** Pet directories (`assets/pets/<id>/`). */
export const PETS_DIR = join(ASSETS_DIR, 'pets')
/** Neutralino frontend app (`assets/neutralino/`). */
export const NEUTRALINO_APP_DIR = join(ASSETS_DIR, 'neutralino')
/** Downloaded Neutralino runtime binaries (`runtime/`, git-ignored). */
export const RUNTIME_DIR = join(PACKAGE_ROOT, 'runtime')

/**
 * Per-user data directory (`~/.dsh/desktop-pet/`), shared with the window
 * position persistence so user-owned state lives outside the installed
 * package and survives npm upgrades/reinstalls.
 */
export const USER_DATA_DIR = join(homedir(), '.dsh', 'desktop-pet')
/** User-imported pets (`~/.dsh/desktop-pet/pets/<id>/`). */
export const USER_PETS_DIR = join(USER_DATA_DIR, 'pets')
