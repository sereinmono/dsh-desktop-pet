/**
 * Per-task bubble text registry.
 *
 * Consumes the same NormalizedEvent stream as PetStateMachine but keeps a
 * parallel, harness-independent view for the status bubbles: one entry per
 * running task (bold title + light reasoning text). Unlike the state machine's
 * animation semantics (2s THINKING expiry, 250ms debounce, SLEEPING fallback),
 * this registry's lifecycle is plain: running states keep/update an entry,
 * terminal or idle events remove it.
 */

import { resolveEvent } from './PetStateResolver'
import type { NormalizedEvent, SemanticState } from './types'

export interface TaskInfo {
  taskId: string
  /** Bold bubble line (session title); falls back to a task id fragment. */
  title: string | undefined
  /** Light bubble line (aggregated reasoning tail). */
  thinking: string
  state: SemanticState
  startedAt: number
  updatedAt: number
}

/** States that keep a task visible as "running" in the bubble list. */
export const RUNNING_STATES: ReadonlySet<SemanticState> = new Set([
  'THINKING', 'WORKING', 'CODING', 'RUNNING_COMMAND', 'WAITING_FOR_USER',
])

/** Whether a resolved state counts as an active task for the bubble list. */
export function isRunningTaskState(state: SemanticState): boolean {
  return RUNNING_STATES.has(state)
}

/** Keep only the most recent reasoning tail so the bubble stays short. */
const MAX_THINKING_CHARS = 200

export interface TaskInfoClock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

const realClock: TaskInfoClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface TaskInfoRegistryOptions {
  clock?: TaskInfoClock
  /** Minimum interval between onChange emissions (coalesces token bursts). */
  emitIntervalMs?: number
  onChange?: (tasks: TaskInfo[]) => void
}

export class TaskInfoRegistry {
  private readonly clock: TaskInfoClock
  private readonly emitIntervalMs: number
  private readonly onChange: ((tasks: TaskInfo[]) => void) | undefined

  private readonly tasks = new Map<string, TaskInfo>()
  private lastEmittedSignature: string | null = null
  private dirty = false
  private emitTimer: unknown | undefined
  private disposed = false

  constructor(options: TaskInfoRegistryOptions = {}) {
    this.clock = options.clock ?? realClock
    this.emitIntervalMs = options.emitIntervalMs ?? 250
    this.onChange = options.onChange
  }

  private taskIdOf(event: NormalizedEvent): string {
    return event.taskId ?? event.sessionId ?? 'default'
  }

  onEvent(event: NormalizedEvent): void {
    if (this.disposed) return
    const { state } = resolveEvent(event)
    const taskId = this.taskIdOf(event)

    if (!isRunningTaskState(state)) {
      // Terminal or idle: the task is no longer running.
      if (this.tasks.delete(taskId)) this.markDirty()
      return
    }

    const existing = this.tasks.get(taskId)
    const now = event.timestamp
    const entry: TaskInfo = {
      taskId,
      title: event.title ?? existing?.title,
      thinking: this.appendThinking(existing?.thinking, event.thinking),
      state,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
    }
    this.tasks.set(taskId, entry)
    this.markDirty()
  }

  /** Fold a title onto a running task without touching its activity state. */
  setTitle(sessionId: string | undefined, title: string | undefined): void {
    if (this.disposed) return
    const taskId = sessionId ?? 'default'
    const existing = this.tasks.get(taskId)
    if (!existing || existing.title === title) return
    this.tasks.set(taskId, { ...existing, title })
    this.markDirty()
  }

  private appendThinking(current: string | undefined, delta: string | undefined): string {
    if (!delta) return current ?? ''
    const next = (current ?? '') + delta
    return next.length > MAX_THINKING_CHARS ? next.slice(next.length - MAX_THINKING_CHARS) : next
  }

  private markDirty(): void {
    this.dirty = true
    if (this.emitTimer !== undefined) return
    this.emitTimer = this.clock.setTimeout(() => {
      this.emitTimer = undefined
      this.flush()
    }, this.emitIntervalMs)
  }

  private flush(): void {
    if (!this.dirty || this.disposed) return
    this.dirty = false
    const tasks = this.snapshot()
    const signature = this.signature(tasks)
    if (signature === this.lastEmittedSignature) return
    this.lastEmittedSignature = signature
    this.onChange?.(tasks)
  }

  private signature(tasks: TaskInfo[]): string {
    return tasks.map(t => `${t.taskId}|${t.title ?? ''}|${t.thinking}|${t.state}`).join('\n')
  }

  /** Current running tasks, oldest first. */
  snapshot(): TaskInfo[] {
    return [...this.tasks.values()].sort((a, b) => a.startedAt - b.startedAt)
  }

  dispose(): void {
    this.disposed = true
    if (this.emitTimer !== undefined) {
      this.clock.clearTimeout(this.emitTimer)
      this.emitTimer = undefined
    }
    this.tasks.clear()
  }
}
