import { describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

// The real engine store depends on a browser runtime; a tiny in-memory
// substitute is all the controller needs.
vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  createSnapshotStore: (init: unknown) => {
    let state = init
    return {
      get: () => state,
      set: (next: unknown) => { state = next },
      update: () => {},
    }
  },
}))

import { DesktopPetCardController, type DesktopPetSettings, type ImportMessage } from '../src/client/desktop-pet-controller'

/** The fake engine store exposes a `get` the real SnapshotStore lacks. */
type FakeStore = { get(): { importing: boolean; importMessage: ImportMessage | null } }
const storeOf = (controller: DesktopPetCardController): FakeStore => controller['store'] as unknown as FakeStore

/** A controllable fake of the client SettingsScope (vi.fn keeps mock types). */
function makeScope(init: Partial<DesktopPetSettings> = {}) {
  let value: DesktopPetSettings = init
  let user: Partial<DesktopPetSettings> = {}
  let writable = true
  const listeners = new Set<() => void>()
  const set = vi.fn(async (field: string, v: unknown) => {
    value = { ...value, [field]: v }
    user = { ...user, [field]: v } as Partial<DesktopPetSettings>
    for (const l of listeners) l()
  })
  const unset = vi.fn(async (field: string) => {
    value = { ...value, [field]: undefined }
    delete (user as Record<string, unknown>)[field]
    for (const l of listeners) l()
  })
  const scope = {
    getSnapshot: () => ({ status: 'ready', writable, value, user }) as SettingsScopeSnapshot<DesktopPetSettings>,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set,
    unset,
  }
  const notify = () => { for (const l of listeners) l() }
  const asScope = scope as unknown as SettingsScope<DesktopPetSettings>
  return { scope: asScope, raw: scope, set, unset, notify }
}

describe('DesktopPetCardController imports', () => {
  it('importFromFolder writes a petAction request with a requestId', async () => {
    const { scope, raw } = makeScope()
    const controller = new DesktopPetCardController(scope)
    const face = controller.inject()

    face.importFromFolder()

    expect(raw.set).toHaveBeenCalledTimes(1)
    const [field, action] = raw.set.mock.calls[0] as [string, { kind: string; requestId: string }]
    expect(field).toBe('petAction')
    expect(action.kind).toBe('importFolder')
    expect(typeof action.requestId).toBe('string')
    expect(action.requestId.length).toBeGreaterThan(0)
  })

  it('importFromPetdex writes the slug in the request payload', () => {
    const { scope, raw } = makeScope()
    const controller = new DesktopPetCardController(scope)
    controller.inject().importFromPetdex('boba')

    const [, action] = raw.set.mock.calls[0] as [string, { kind: string; payload?: { slug?: string } }]
    expect(action.kind).toBe('importPetdex')
    expect(action.payload?.slug).toBe('boba')
  })

  it('surfaces an importResult matching the request and clears it from the wire', async () => {
    const { scope, raw, notify } = makeScope()
    const controller = new DesktopPetCardController(scope)
    const face = controller.inject()

    face.importFromPetdex('boba')
    const [, action] = raw.set.mock.calls[0] as [string, { requestId: string }]
    expect(controller['importing']).toBe(true)

    // The host writes back an outcome for this request.
    const scopeAny = scope as unknown as { getSnapshot(): { value: DesktopPetSettings } }
    scopeAny.getSnapshot = () => ({
      status: 'ready', writable: true, user: {},
      value: { importResult: { ok: true, code: 'ok', requestId: action.requestId, petId: 'boba', at: 1 } },
    })
    notify()

    const state = storeOf(controller).get()
    expect(state.importing).toBe(false)
    expect(state.importMessage).toEqual({ ok: true, code: 'ok', petId: 'boba' })
    expect(raw.unset).toHaveBeenCalledWith('importResult')
  })

  it('clears an importMessage via clearImportMessage', async () => {
    const { scope, raw, notify } = makeScope()
    const controller = new DesktopPetCardController(scope)
    const face = controller.inject()
    face.importFromFolder()
    const [, action] = raw.set.mock.calls[0] as [string, { requestId: string }]
    const scopeAny = scope as unknown as { getSnapshot(): { value: DesktopPetSettings } }
    scopeAny.getSnapshot = () => ({
      status: 'ready', writable: true, user: {},
      value: { importResult: { ok: false, code: 'duplicate-id', requestId: action.requestId, at: 1 } },
    })
    notify()

    expect(storeOf(controller).get().importMessage).toEqual({ ok: false, code: 'duplicate-id' })
    face.clearImportMessage()
    expect(storeOf(controller).get().importMessage).toBeNull()
  })
})
