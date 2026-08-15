/**
 * The renderer's orchestrator: owns a {@link WindowBackend} handle and an
 * {@link AnimationController}, maps semantic states to Codex poses, and feeds
 * render directives into the frontend.
 *
 * The frontend draws the sprite; this class only drives which pose/frame is
 * active. Idle "alive" behavior lives here: when idle, a low-frequency
 * randomized transient (a wave) plays so the pet never looks frozen, without
 * driving aggressive continuous animation.
 *
 * Live settings changes (scale / pet swap / visibility) rebuild the window
 * in place: the backend handle and animation controller are torn down and
 * recreated, while the current position is preserved.
 */

import type { CodexPetState, SemanticState } from '../core/types'
import { SEMANTIC_TO_CODEX } from '../core/types'
import type { PetRoot } from '../pets'
import { AnimationController, type AnimationClock } from './AnimationController'
import type { FrameDirective } from './FrameDecoder'
import type { WindowBackend, WindowBackendOptions, WindowHandle } from './backend/WindowBackend'

/** A pet the window can display: its catalog id, sprite-sheet file, and root. */
export interface PetWindowPet {
  petId: string
  /** Manifest `spritesheetPath`, relative to the pet directory. */
  spritesheetPath: string
  /** Whether the pet lives in the user pets directory or the bundled one. */
  root: PetRoot
}

export interface PetWindowOptions {
  backend: WindowBackend
  pet: PetWindowPet
  scale: number
  alwaysOnTop: boolean
  animationEnabled: boolean
  /** Seconds between idle variations (transient wave). */
  idleFrequencySec: number
  position?: { x: number; y: number } | null
  clickThrough?: boolean
  clock?: AnimationClock
  random?: () => number
  onDrag?: (x: number, y: number) => void
  /** Invoked repeatedly during a drag with the horizontal direction. */
  onDragMove?: (direction: 'left' | 'right') => void
  /** Invoked when a drag ends. */
  onDragEnd?: () => void
  /** Invoked when the pointer hovers over the pet (backend rate-limits it). */
  onHover?: () => void
  /** Invoked when the pointer leaves the pet. */
  onUnhover?: () => void
  /** Invoked when the user chooses the context menu's "close pet" item. */
  onClose?: () => void
  /** Resolve the WebUI URL to open when the pet is clicked (undefined disables). */
  resolveWebuiUrl?: () => string | undefined
}

const BASE_WIDTH = 192
const BASE_HEIGHT = 208
const DEFAULT_POSITION = { x: 40, y: 40 } as const
// `jumping` is reserved for pointer-hover; idle variations use only `waving`.
const IDLE_TRANSIENTS: readonly CodexPetState[] = ['waving']

/**
 * Fraction of the window height below the pet that stays empty. Neutralino
 * transparent windows on Windows have a dead zone in the bottom ~20% where
 * pointer input never arrives (neutralinojs#1482); keeping the pet in the top
 * 75% keeps drag/hover/click working.
 */
const BOTTOM_PAD_FRAC = 0.25

/** Window size for a scale, matching the frontend's `layoutForScale`. */
function windowSizeForScale(scale: number): { width: number; height: number } {
  const petW = Math.max(1, Math.round(BASE_WIDTH * scale))
  const petH = Math.max(1, Math.round(BASE_HEIGHT * scale))
  return { width: petW, height: Math.max(petH + 1, Math.round(petH / (1 - BOTTOM_PAD_FRAC))) }
}

export class PetWindow {
  private readonly backend: WindowBackend
  private readonly animationEnabled: boolean
  private readonly idleFrequencySec: number
  private readonly clickThrough: boolean
  private readonly clock: AnimationClock
  private readonly random: () => number
  private readonly onDrag: ((x: number, y: number) => void) | undefined
  private readonly onDragMove: ((direction: 'left' | 'right') => void) | undefined
  private readonly onDragEnd: (() => void) | undefined
  private readonly onHover: (() => void) | undefined
  private readonly onUnhover: (() => void) | undefined
  private readonly onClose: (() => void) | undefined
  private readonly resolveWebuiUrl: (() => string | undefined) | undefined

  private pet: PetWindowPet
  private scale: number
  private currentX: number
  private currentY: number

  private handle: WindowHandle | undefined
  private controller: AnimationController | undefined
  private idleTimer: unknown | undefined
  private semantic: SemanticState = 'IDLE'
  private visible = true
  private opened = false
  private destroyed = false
  private hovered = false
  private dragging = false

  constructor(options: PetWindowOptions) {
    this.backend = options.backend
    this.pet = options.pet
    this.scale = options.scale
    this.animationEnabled = options.animationEnabled
    this.idleFrequencySec = options.idleFrequencySec
    this.clickThrough = options.clickThrough ?? false
    this.clock = options.clock ?? { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }
    this.random = options.random ?? Math.random
    this.onDrag = options.onDrag
    this.onDragMove = options.onDragMove
    this.onDragEnd = options.onDragEnd
    this.onHover = options.onHover
    this.onUnhover = options.onUnhover
    this.onClose = options.onClose
    this.resolveWebuiUrl = options.resolveWebuiUrl

    const position = options.position ?? DEFAULT_POSITION
    this.currentX = position.x
    this.currentY = position.y
  }

  /** Create the overlay window and start the animation loop. */
  async open(): Promise<void> {
    if (this.destroyed || this.opened) return
    this.opened = true

    const { width, height } = windowSizeForScale(this.scale)

    const opts: WindowBackendOptions = {
      width,
      height,
      x: this.currentX,
      y: this.currentY,
      alwaysOnTop: true,
      petId: this.pet.petId,
      spritesheetPath: this.pet.spritesheetPath,
      petRoot: this.pet.root,
      scale: this.scale,
      clickThrough: this.clickThrough,
      onDrag: (x, y) => {
        this.currentX = x
        this.currentY = y
        this.onDrag?.(x, y)
      },
      onDragMove: (direction) => {
        this.beginDrag(direction)
      },
      onDragEnd: () => {
        this.endDrag()
      },
      onHover: () => {
        this.onHover?.()
      },
      onUnhover: () => {
        this.onUnhover?.()
      },
      onClose: () => {
        this.onClose?.()
      },
      resolveWebuiUrl: () => this.resolveWebuiUrl?.(),
    }
    this.handle = await this.backend.create(opts)

    this.controller = new AnimationController({
      clock: this.clock,
      onFrame: (directive) => this.present(directive),
    })
    if (this.animationEnabled) this.controller.start()
    this.applyState(this.semantic)
    if (!this.visible) this.handle.hide()
  }

  /** The current renderer pose (for diagnostics/tests). */
  get currentPose(): CodexPetState | undefined {
    return this.controller?.currentState
  }

  /** Set the semantic state; the pose is derived, not caller-decided. */
  setState(state: SemanticState): void {
    this.semantic = state
    if (!this.controller || this.destroyed) return
    // While dragging, defer the pose switch so it does not interrupt the
    // direction animation; endDrag applies the latest semantic state.
    if (this.dragging) return
    this.applyState(state)
  }

  /** Enter the drag animation, playing the direction pose. */
  private beginDrag(direction: 'left' | 'right'): void {
    if (this.destroyed || !this.controller) return
    this.dragging = true
    this.cancelIdleVariation()
    this.controller.setState(direction === 'left' ? 'running-left' : 'running-right')
  }

  /** Exit the drag animation and return to the current semantic pose. */
  private endDrag(): void {
    if (this.destroyed || !this.controller) return
    this.dragging = false
    this.applyState(this.semantic)
  }

  /** Show or hide the pet without disposing it. */
  setVisible(visible: boolean): void {
    this.visible = visible
    if (this.destroyed || !this.handle) return
    if (visible) this.handle.show()
    else this.handle.hide()
  }

  /** Resize the pet by rebuilding the window to the new scale. */
  async setScale(scale: number): Promise<void> {
    if (this.destroyed || scale === this.scale) return
    this.scale = scale
    await this.recreate()
  }

  /** Swap the displayed pet by rebuilding the window. */
  async loadPet(pet: PetWindowPet): Promise<void> {
    if (this.destroyed || (pet.petId === this.pet.petId && pet.spritesheetPath === this.pet.spritesheetPath)) return
    this.pet = pet
    await this.recreate()
  }

  private async recreate(): Promise<void> {
    if (!this.opened || this.destroyed) return
    this.teardownWindow()
    this.opened = false
    await this.open()
  }

  private applyState(state: SemanticState): void {
    const pose = SEMANTIC_TO_CODEX[state] ?? 'idle'
    this.controller?.setState(pose)
    if (pose === 'idle') this.scheduleIdleVariation()
    else this.cancelIdleVariation()
  }

  /** Play the hover reaction (`jumping`) once, then return to the current state. */
  playJump(): void {
    if (this.destroyed || !this.controller) return
    // Pointer enter can fire repeatedly; only react on the hover edge,
    // otherwise the transient never completes.
    if (this.hovered) return
    this.hovered = true
    this.controller.playTransient('jumping', SEMANTIC_TO_CODEX[this.semantic] ?? 'idle')
  }

  /** End the hover reaction and return to the current semantic pose. */
  endHover(): void {
    if (this.destroyed || !this.controller) return
    this.hovered = false
    this.controller.setState(SEMANTIC_TO_CODEX[this.semantic] ?? 'idle')
  }

  private scheduleIdleVariation(): void {
    this.cancelIdleVariation()
    const ms = Math.max(8, this.idleFrequencySec) * 1000 * (0.7 + this.random() * 0.6)
    this.idleTimer = this.clock.setTimeout(() => {
      this.idleTimer = undefined
      if (this.destroyed || !this.controller) return
      const transient = IDLE_TRANSIENTS[Math.floor(this.random() * IDLE_TRANSIENTS.length)]
      this.controller.playTransient(transient, 'idle')
      // Re-arm the next idle variation once the transient settles.
      this.idleTimer = this.clock.setTimeout(() => {
        this.idleTimer = undefined
        if (this.semantic === 'IDLE') this.scheduleIdleVariation()
      }, 1500)
    }, ms)
  }

  private cancelIdleVariation(): void {
    if (this.idleTimer !== undefined) {
      this.clock.clearTimeout(this.idleTimer)
      this.idleTimer = undefined
    }
  }

  private present(directive: FrameDirective): void {
    if (this.destroyed || !this.handle) return
    try {
      this.handle.present(directive)
    } catch {
      // A failed directive must not propagate into the harness. Swallow and
      // keep the loop; the next frame may succeed.
    }
  }

  show(): void {
    this.setVisible(true)
  }

  hide(): void {
    this.setVisible(false)
  }

  private teardownWindow(): void {
    this.cancelIdleVariation()
    this.controller?.dispose()
    this.controller = undefined
    try {
      this.handle?.destroy()
    } catch {
      // Best-effort native teardown.
    }
    this.handle = undefined
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return
    this.destroyed = true
    this.teardownWindow()
  }
}
