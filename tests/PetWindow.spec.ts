import { describe, expect, it } from 'vitest'
import { PetWindow } from '../src/renderer/PetWindow'
import type { WindowBackend, WindowBackendOptions, WindowHandle } from '../src/renderer/backend/WindowBackend'
import type { FrameDirective } from '../src/renderer/FrameDecoder'

function makeBackend() {
  const handles: FakeHandle[] = []
  const backend: WindowBackend = {
    name: 'fake',
    isSupported: () => true,
    async create(opts: WindowBackendOptions): Promise<WindowHandle> {
      const h = new FakeHandle(opts)
      handles.push(h)
      return h
    },
  }
  return { backend, handles }
}

class FakeHandle implements WindowHandle {
  shown = true
  destroyed = false
  constructor(readonly opts: WindowBackendOptions) {}
  present(_directive: FrameDirective): void {}
  move(): void {}
  setAlwaysOnTop(): void {}
  show(): void { this.shown = true }
  hide(): void { this.shown = false }
  destroy(): void { this.destroyed = true }
}

const pet = { petId: 'text', spritesheetPath: 'spritesheet.webp' }

describe('PetWindow live settings', () => {
  it('setVisible shows/hides without destroying', async () => {
    const { backend, handles } = makeBackend()
    const w = new PetWindow({ backend, pet, scale: 1, alwaysOnTop: true, animationEnabled: false, idleFrequencySec: 20 })
    await w.open()
    expect(handles[0].shown).toBe(true)

    w.setVisible(false)
    expect(handles[0].shown).toBe(false)
    expect(handles[0].destroyed).toBe(false)

    w.setVisible(true)
    expect(handles[0].shown).toBe(true)
    await w.destroy()
  })

  it('setScale rebuilds the window at the new size', async () => {
    const { backend, handles } = makeBackend()
    const w = new PetWindow({ backend, pet, scale: 1, alwaysOnTop: true, animationEnabled: false, idleFrequencySec: 20 })
    await w.open()
    expect(handles).toHaveLength(1)
    expect(handles[0].opts.width).toBe(192)

    await w.setScale(2)
    expect(handles).toHaveLength(2)
    expect(handles[0].destroyed).toBe(true)
    expect(handles[1].opts.width).toBe(384)
    await w.destroy()
  })

  it('loadPet rebuilds the window with the new pet', async () => {
    const { backend, handles } = makeBackend()
    const w = new PetWindow({ backend, pet, scale: 1, alwaysOnTop: true, animationEnabled: false, idleFrequencySec: 20 })
    await w.open()

    const pet2 = { petId: 'dog', spritesheetPath: 'sheet.webp' }
    await w.loadPet(pet2)
    expect(handles).toHaveLength(2)
    expect(handles[0].destroyed).toBe(true)
    await w.destroy()
  })
})

describe('PetWindow drag animations', () => {
  it('plays running-left / running-right on drag move', async () => {
    const { backend, handles } = makeBackend()
    const w = new PetWindow({ backend, pet, scale: 1, alwaysOnTop: true, animationEnabled: true, idleFrequencySec: 20 })
    await w.open()
    expect(w.currentPose).toBe('idle')

    handles[0].opts.onDragMove?.('left')
    expect(w.currentPose).toBe('running-left')

    handles[0].opts.onDragMove?.('right')
    expect(w.currentPose).toBe('running-right')
    await w.destroy()
  })

  it('returns to the semantic pose on drag end', async () => {
    const { backend, handles } = makeBackend()
    const w = new PetWindow({ backend, pet, scale: 1, alwaysOnTop: true, animationEnabled: true, idleFrequencySec: 20 })
    await w.open()
    w.setState('THINKING')
    expect(w.currentPose).toBe('running')

    handles[0].opts.onDragMove?.('left')
    expect(w.currentPose).toBe('running-left')

    handles[0].opts.onDragEnd?.()
    expect(w.currentPose).toBe('running') // THINKING → running
    await w.destroy()
  })

  it('defers a semantic state change until drag ends', async () => {
    const { backend, handles } = makeBackend()
    const w = new PetWindow({ backend, pet, scale: 1, alwaysOnTop: true, animationEnabled: true, idleFrequencySec: 20 })
    await w.open()

    handles[0].opts.onDragMove?.('right')
    expect(w.currentPose).toBe('running-right')

    // A task event lands mid-drag; the pose must not be clobbered yet.
    w.setState('WAITING_FOR_USER')
    expect(w.currentPose).toBe('running-right')

    handles[0].opts.onDragEnd?.()
    expect(w.currentPose).toBe('waiting') // WAITING_FOR_USER → waiting
    await w.destroy()
  })
})
