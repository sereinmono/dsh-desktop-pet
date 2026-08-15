/**
 * deepseek-harness desktop-pet plugin entry point.
 *
 * The `apply` function is the only surface Cordis calls. Everything here is
 * assembled through the compatibility boundary: the bridge (harness events)
 * feeds the state machine, which drives the renderer, which owns a native
 * overlay window. Any failure in the window/renderer path is contained so it
 * never propagates into harness execution.
 *
 * When the optional settings service exists, a `desktop-pet` namespace is
 * registered and the Web configuration page can change `enabled` (show/hide),
 * `petScale` (size), and `petId` (which bundled pet) at runtime.
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

import { registerPetCommand } from './commands'
import { Config, type PetAction, type PetConfig } from './config'
import { PetStateMachine } from './core/PetStateMachine'
import type { NormalizedEvent, SemanticState } from './core/types'
import { importPetFromDirectory, importPetFromPetdex } from './imports'
import { createHarnessBridge, type HarnessBridge, type HarnessContext } from './integration/HarnessBridge'
import { loadPosition, savePosition } from './persistence'
import { resolvePetManifest, scanPets } from './pets'
import { installPetSettings, type PetSettingsHandle, type PetSettingsRegistrar, type PetSettingsSnapshot } from './settings'
import { shouldBeVisible } from './visibility'
import { PetWindow } from './renderer/PetWindow'
import { selectBackend } from './renderer/backend/selectBackend'

export const name = 'desktop-pet'
export const inject: string[] = []

export { Config }
export type { PetConfig }

/** A disposer may be sync or async; Cordis awaits async disposers on unload. */
type Disposer = () => void | Promise<void>

interface PetContext extends HarnessContext {
  effect(execute: () => Disposer, label?: string): Disposer
  inject(deps: string[], callback: (ctx: HarnessContext) => void): unknown
}

export function apply(ctx: Context, config: PetConfig): void {
  const petCtx = ctx as unknown as PetContext
  const log = petCtx.logger('desktop-pet')

  if (!config.enabled) {
    log.info('disabled by config; not starting')
    return
  }

  petCtx.effect(() => {
    // Shared teardown state, populated as setup completes.
    let disposed = false
    let bridge: HarnessBridge | undefined
    let window: PetWindow | undefined
    let machine: PetStateMachine | undefined
    let unsubscribe: (() => void) | undefined
    let unregisterCommand: (() => void) | undefined
    let debugState: SemanticState | undefined
    let settingsHandle: PetSettingsHandle | undefined

    let currentSettings: PetSettingsSnapshot = {
      enabled: config.enabled,
      petScale: config.petScale,
      petId: config.petId,
      hideWhenIdle: config.hideWhenIdle,
      availablePets: [],
    }
    // The catalog is a scan-time fact, not a user setting: remember it here so
    // settings callbacks never adopt a stale/overridden `availablePets`.
    let catalog: PetSettingsSnapshot['availablePets'] = []
    let loadedPetKey: string | null = null
    let reconcileSeq = 0
    // Serializes import requests so a slow import never re-enters itself.
    let importSeq = 0
    // Resolved lazily from the optional `directoryPicker` service.
    let directoryPicker: { capability(): { kind: string; pick?(signal: AbortSignal): Promise<string | null> } } | undefined

    /** Whether the window should be visible given the current state + settings. */
    function shouldBeVisibleFor(state: SemanticState | undefined): boolean {
      return shouldBeVisible(state, currentSettings.enabled, currentSettings.hideWhenIdle, debugState)
    }

    function applyVisibility(state: SemanticState | undefined): void {
      window?.setVisible(shouldBeVisibleFor(state))
    }

    /**
     * Resolve the pet id to actually load. A persisted petId may reference a
     * directory that has since been removed; fall back to the first available
     * catalog entry instead of failing the whole renderer.
     */
    function effectivePetId(petId: string): string {
      if (catalog.some(entry => entry.id === petId)) return petId
      return catalog[0]?.id ?? 'text'
    }

    /** Apply a resolved settings snapshot to the window (idempotent). */
    async function reconcile(settings: PetSettingsSnapshot): Promise<void> {
      const seq = ++reconcileSeq
      const petId = effectivePetId(settings.petId)
      const petKey = petId

      if (window) {
        applyVisibility(machine?.state)
        await window.setScale(settings.petScale)
        if (petKey !== loadedPetKey) {
          loadedPetKey = petKey
          try {
            const pet = await resolvePetManifest(petId)
            if (disposed || seq !== reconcileSeq) return
            await window.loadPet(pet)
          } catch (error) {
            log.warn('failed to switch pet; keeping current: %s', (error as Error)?.message ?? String(error))
          }
        }
        return
      }

      // Create the window with the current resolved settings.
      loadedPetKey = petKey
      let pet
      try {
        pet = await resolvePetManifest(petId)
      } catch (error) {
        log.warn('failed to load pet assets; renderer disabled: %s', (error as Error)?.message ?? String(error))
        return
      }
      if (disposed || seq !== reconcileSeq) return

      const backend = selectBackend()
      if (!backend) {
        log.warn('no supported window backend on %s; renderer disabled', process.platform)
        return
      }

      try {
        window = new PetWindow({
          backend,
          pet,
          scale: settings.petScale,
          alwaysOnTop: config.alwaysOnTop,
          animationEnabled: config.animationEnabled,
          idleFrequencySec: config.idleFrequencySec,
          clickThrough: config.clickThrough,
          position: loadPosition(),
          onDrag: (x, y) => savePosition({ x, y }),
          onHover: () => { window?.playJump() },
          onUnhover: () => { window?.endHover() },
          onClose: () => {
            // Persist "closed" through the settings seam when available, else
            // hide in place. Either path stops the pet until re-enabled.
            if (settingsHandle) {
              void settingsHandle.update({ enabled: false })
            } else {
              currentSettings.enabled = false
              applyVisibility(machine?.state)
            }
          },
        })
        await window.open()
        if (disposed) {
          await window.destroy()
          window = undefined
          return
        }
        const initialState: SemanticState = config.startSleeping ? 'SLEEPING' : 'IDLE'
        window.setState(initialState)
        applyVisibility(initialState)
        log.info('pet window created via %s backend (%s)', backend.name, petKey)
      } catch (error) {
        log.warn('failed to create pet window; renderer disabled: %s', (error as Error)?.message ?? String(error))
        window = undefined
      }
    }

    // Debug override plumbing (developer mode, /pet <state>).
    const debugHost = {
      setDebugState(state: SemanticState): void {
        debugState = state
        window?.setState(state)
        applyVisibility(state)
      },
      resetDebugState(): void {
        debugState = undefined
        if (machine) applyVisibility(machine.state)
      },
    }

    // Sync: start the bridge (subscriptions are installed synchronously).
    bridge = createHarnessBridge(petCtx)
    void bridge.start().catch((error) => {
      log.warn('bridge start failed: %s', (error as Error)?.message ?? String(error))
    })

    // Sync: build the state machine and wire events → window.
    machine = new PetStateMachine({
      onChange: (state) => {
        if (disposed) return
        if (debugState === undefined) {
          window?.setState(state)
        }
        // Auto-hide reacts to the machine's SLEEPING transitions.
        applyVisibility(state)
      },
    })
    unsubscribe = bridge.subscribe((event: NormalizedEvent) => {
      if (disposed) return
      machine?.onEvent(event)
    })

    // Register the optional /pet debug command.
    unregisterCommand = registerPetCommand({ commands: petCtx.get('commands') } as never, debugHost)

    // Scan the bundled pet directory synchronously so the catalog is part of
    // the settings base snapshot registered below.
    catalog = scanPets()
    currentSettings.availablePets = catalog

    // Optional settings integration: wait for the settings service, then
    // register the namespace and react to committed changes.
    petCtx.inject(['settings'], (sctx) => {
      const registrar = sctx.get('settings') as PetSettingsRegistrar | undefined
      settingsHandle = installPetSettings(registrar, currentSettings, (settings) => {
        if (disposed) return
        // `availablePets` is always the host's scan result, never whatever
        // the settings round-trip resolved (a stale user layer must not
        // shadow the directory facts). Everything else follows settings.
        currentSettings = { ...settings, availablePets: catalog }
        if (settings.petAction) void handlePetAction(settings.petAction)
        void reconcile(currentSettings).catch((error) => {
          log.warn('settings reconcile failed: %s', (error as Error)?.message ?? String(error))
        })
      })
    })

    // Optional folder-picker service: lets the card's "add from folder" button
    // open a native OS chooser. Absent (e.g. no host picker backend), the
    // client is told to fall back to a manual copy.
    petCtx.inject(['directoryPicker'], (sctx) => {
      directoryPicker = sctx.get('directoryPicker') as typeof directoryPicker
    })

    /** Execute a one-shot import request from the settings card. */
    async function handlePetAction(action: PetAction): Promise<void> {
      const seq = ++importSeq
      const requestId = action.requestId
      const writeResult = async (patch: Partial<PetSettingsSnapshot>) => {
        if (seq !== importSeq) return // a newer import superseded this one
        try {
          await settingsHandle?.update(patch)
        } catch (error) {
          log.warn('import result write failed: %s', (error as Error)?.message ?? String(error))
        }
      }
      // Report an import outcome; on failure keep the request cleared so it
      // cannot replay and the card surfaces an error row.
      const fail = async (code: string, detail?: string) => {
        await writeResult({
          petAction: null,
          importResult: { ok: false, code, requestId, at: Date.now(), detail },
        })
      }

      try {
        let result: Awaited<ReturnType<typeof importPetFromDirectory>>
        if (action.kind === 'importFolder') {
          const capability = directoryPicker?.capability()
          if (!capability || capability.kind !== 'native' || !capability.pick) {
            await fail('no-folder-picker')
            return
          }
          let chosen: string | null
          try {
            chosen = await capability.pick(new AbortController().signal)
          } catch (error) {
            await fail('copy-failed', (error as Error)?.message)
            return
          }
          if (!chosen) {
            // User cancelled the chooser; clear the request without an outcome.
            await writeResult({ petAction: null })
            return
          }
          result = importPetFromDirectory(chosen)
        } else {
          const slug = action.payload?.slug ?? ''
          result = await importPetFromPetdex(slug)
        }

        if (result.ok && result.petId) {
          // The catalog is a scan-time fact: re-scan so the new pet appears in
          // the picker, then switch to it so the user sees the result.
          catalog = scanPets()
          await writeResult({
            petAction: null,
            availablePets: catalog,
            petId: result.petId,
            importResult: { ok: true, code: 'ok', requestId, petId: result.petId, at: Date.now() },
          })
        } else {
          await fail(result.code)
        }
      } catch (error) {
        // A synchronous failure inside the import (e.g. the Petdex CLI could
        // not be spawned) must become a visible outcome, never an unhandled
        // rejection that takes down the harness.
        log.warn('pet import failed: %s', (error as Error)?.message ?? String(error))
        await fail('petdex-failed', (error as Error)?.message)
      }
    }

    // Initial window creation (runs even when no settings service exists).
    void reconcile(currentSettings).catch((error) => {
      log.warn('desktop-pet startup failed: %s', (error as Error)?.message ?? String(error))
    })

    // Teardown (async so Cordis awaits window/native cleanup).
    return async () => {
      disposed = true
      settingsHandle?.dispose()
      unsubscribe?.()
      unregisterCommand?.()
      machine?.dispose()
      await bridge?.stop().catch(() => {})
      await window?.destroy().catch(() => {})
      bridge = undefined
      window = undefined
      machine = undefined
    }
  })
}
