import { describe, expect, it } from 'vitest'
import { shouldBeVisible } from '../src/visibility'

describe('shouldBeVisible', () => {
  it('hides when disabled regardless of state', () => {
    expect(shouldBeVisible('WORKING', false, true, undefined)).toBe(false)
    expect(shouldBeVisible('IDLE', false, false, undefined)).toBe(false)
  })

  it('keeps the pet visible under the debug override even when auto-hidden', () => {
    expect(shouldBeVisible('IDLE', true, true, 'IDLE')).toBe(true)
  })

  it('hides IDLE and SLEEPING when hideWhenIdle is on', () => {
    expect(shouldBeVisible('IDLE', true, true, undefined)).toBe(false)
    expect(shouldBeVisible('SLEEPING', true, true, undefined)).toBe(false)
  })

  it('keeps activity states visible when hideWhenIdle is on', () => {
    for (const state of ['STARTING', 'THINKING', 'WORKING', 'CODING', 'RUNNING_COMMAND', 'WAITING_FOR_USER', 'SUCCESS', 'ERROR'] as const) {
      expect(shouldBeVisible(state, true, true, undefined)).toBe(true)
    }
  })

  it('keeps everything visible when hideWhenIdle is off', () => {
    expect(shouldBeVisible('IDLE', true, false, undefined)).toBe(true)
    expect(shouldBeVisible('SLEEPING', true, false, undefined)).toBe(true)
    expect(shouldBeVisible('WORKING', true, false, undefined)).toBe(true)
  })

  it('is visible for an undefined state', () => {
    expect(shouldBeVisible(undefined, true, true, undefined)).toBe(true)
  })
})
