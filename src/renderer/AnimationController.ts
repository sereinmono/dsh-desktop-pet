/**
 * Data-driven frame scheduler.
 *
 * Owns the current Codex animation state and its frame index, and emits a
 * render directive per animation step via `onFrame`. The frontend does the
 * actual pixel drawing; this controller only knows the sprite-sheet contract
 * timings. The timer runs only while playing; when stopped, no work is
 * scheduled (near-zero idle CPU).
 */

import type { CodexPetState } from '../core/types'
import { animationRowFor } from './codex-pet/PetContract'
import { frameDirective, type FrameDirective } from './FrameDecoder'

export interface AnimationClock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

const realClock: AnimationClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export interface AnimationControllerOptions {
  clock?: AnimationClock
  onFrame?: (directive: FrameDirective) => void
}

export class AnimationController {
  private readonly clock: AnimationClock
  private readonly onFrame: ((directive: FrameDirective) => void) | undefined

  private state: CodexPetState = 'idle'
  private frameIndex = 0
  private playing = false
  private timer: unknown | undefined
  private resumeState: CodexPetState | undefined
  private disposed = false

  constructor(options: AnimationControllerOptions = {}) {
    this.clock = options.clock ?? realClock
    this.onFrame = options.onFrame
  }

  get currentState(): CodexPetState {
    return this.state
  }

  /** Switch the looping animation. Restarts from the first frame. */
  setState(state: CodexPetState): void {
    if (this.state === state && this.playing) return
    this.state = state
    this.frameIndex = 0
    this.resumeState = undefined
    this.scheduleNext()
  }

  /** Play a transient state once, then return to `resume` (used for idle variations). */
  playTransient(state: CodexPetState, resume: CodexPetState): void {
    this.state = state
    this.frameIndex = 0
    this.resumeState = resume
    this.scheduleNext()
  }

  start(): void {
    if (this.playing || this.disposed) return
    this.playing = true
    this.frameIndex = 0
    this.scheduleNext()
  }

  stop(): void {
    this.playing = false
    if (this.timer !== undefined) {
      this.clock.clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  private emitCurrent(): void {
    try {
      this.onFrame?.(frameDirective(this.state, this.frameIndex))
    } catch (error) {
      // A bad frame must not kill the animation loop.
      if (typeof console !== 'undefined') console.warn('[desktop-pet] frame error:', (error as Error)?.message)
    }
  }

  private scheduleNext(): void {
    if (!this.playing || this.disposed) return
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer)

    const row = animationRowFor(this.state)
    if (!row) return
    const durations = row.durations
    const duration = durations[this.frameIndex % durations.length] ?? 150

    this.emitCurrent()

    const frameCount = durations.length
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined
      if (!this.playing || this.disposed) return

      this.frameIndex = (this.frameIndex + 1) % frameCount
      if (this.resumeState !== undefined && this.frameIndex === 0) {
        // The transient has looped once; return to the resume pose.
        this.state = this.resumeState
        this.resumeState = undefined
      }
      this.scheduleNext()
    }, duration)
  }

  dispose(): void {
    this.disposed = true
    this.stop()
  }
}
