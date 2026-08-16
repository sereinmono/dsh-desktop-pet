import { describe, expect, it, vi } from 'vitest'
import { TaskInfoRegistry, isRunningTaskState } from '../src/core/TaskInfoRegistry'
import type { NormalizedEvent } from '../src/core/types'
import { createFakeClock } from './helpers/fakeClock'

function evt(type: NormalizedEvent['type'], sessionId?: string, extra: Partial<NormalizedEvent> = {}): NormalizedEvent {
  const e: NormalizedEvent = { type, timestamp: 0, ...extra }
  if (sessionId) e.sessionId = sessionId
  return e
}

describe('isRunningTaskState', () => {
  it('counts activity states as running', () => {
    for (const s of ['THINKING', 'WORKING', 'CODING', 'RUNNING_COMMAND', 'WAITING_FOR_USER'] as const) {
      expect(isRunningTaskState(s)).toBe(true)
    }
  })

  it('excludes transient and idle states', () => {
    for (const s of ['STARTING', 'SUCCESS', 'ERROR', 'IDLE', 'SLEEPING'] as const) {
      expect(isRunningTaskState(s)).toBe(false)
    }
  })
})

describe('TaskInfoRegistry', () => {
  it('adds a running task and emits it (coalesced)', () => {
    const { clock, advance } = createFakeClock()
    const onChange = vi.fn()
    const reg = new TaskInfoRegistry({ clock, emitIntervalMs: 250, onChange })

    reg.onEvent(evt('tool.started', 's1'))
    expect(reg.snapshot()).toHaveLength(1)
    // Emission is deferred by emitIntervalMs.
    expect(onChange).not.toHaveBeenCalled()
    advance(250)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toHaveLength(1)
    expect(onChange.mock.calls[0][0][0].taskId).toBe('s1')
  })

  it('aggregates reasoning deltas and keeps only the tail', () => {
    const { clock, advance } = createFakeClock()
    const reg = new TaskInfoRegistry({ clock })
    reg.onEvent(evt('agent.thinking', 's1', { thinking: 'a'.repeat(300) }))
    reg.onEvent(evt('agent.thinking', 's1', { thinking: 'tail' }))
    const [task] = reg.snapshot()
    expect(task.thinking.length).toBeLessThanOrEqual(200)
    expect(task.thinking.endsWith('tail')).toBe(true)
  })

  it('folds a title onto a running task without perturbing state', () => {
    const { clock } = createFakeClock()
    const reg = new TaskInfoRegistry({ clock })
    reg.onEvent(evt('tool.started', 's1'))
    reg.setTitle('s1', 'My session')
    expect(reg.snapshot()[0].title).toBe('My session')
    expect(reg.snapshot()[0].state).toBe('WORKING')
  })

  it('removes a task on a terminal event', () => {
    const { clock } = createFakeClock()
    const reg = new TaskInfoRegistry({ clock })
    reg.onEvent(evt('tool.started', 's1'))
    reg.onEvent(evt('task.completed', 's1'))
    expect(reg.snapshot()).toHaveLength(0)
  })

  it('removes a task on idle', () => {
    const { clock } = createFakeClock()
    const reg = new TaskInfoRegistry({ clock })
    reg.onEvent(evt('tool.started', 's1'))
    reg.onEvent(evt('session.idle', 's1'))
    expect(reg.snapshot()).toHaveLength(0)
  })

  it('deduplicates onChange when the visible text does not change', () => {
    const { clock, advance } = createFakeClock()
    const onChange = vi.fn()
    const reg = new TaskInfoRegistry({ clock, emitIntervalMs: 250, onChange })
    reg.onEvent(evt('tool.started', 's1'))
    advance(250)
    expect(onChange).toHaveBeenCalledTimes(1)
    // Another tool.started with no new text → same signature → no emit.
    reg.onEvent(evt('tool.started', 's1'))
    advance(250)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
