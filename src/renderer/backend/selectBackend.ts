/**
 * Backend selection. The renderer asks for a backend without knowing the OS;
 * this module returns the Neutralino backend when its runtime binary is
 * present, otherwise `undefined` so the plugin can degrade gracefully
 * (no window, still loaded).
 */

import { NeutralinoBackend } from './NeutralinoBackend'
import type { WindowBackend } from './WindowBackend'

const BACKENDS: readonly WindowBackend[] = [new NeutralinoBackend()]

export function selectBackend(): WindowBackend | undefined {
  return BACKENDS.find(backend => {
    try {
      return backend.isSupported()
    } catch {
      return false
    }
  })
}

export function listBackends(): ReadonlyArray<{ name: string; supported: boolean }> {
  return BACKENDS.map(backend => ({ name: backend.name, supported: backend.isSupported() }))
}
