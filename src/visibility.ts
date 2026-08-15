/**
 * Window visibility decision.
 *
 * Pure and harness-independent so the auto-hide rule is unit-testable: the
 * window is hidden when disabled, when the debug override is absent and the
 * pet has no active task (IDLE or the long-quiet SLEEPING state) and
 * hideWhenIdle is on. Activity states (THINKING/WORKING/WAITING…) keep it
 * visible.
 */

import type { SemanticState } from './core/types'

export function shouldBeVisible(
  state: SemanticState | undefined,
  enabled: boolean,
  hideWhenIdle: boolean,
  debugState: SemanticState | undefined,
): boolean {
  if (!enabled) return false
  // Debug override keeps the pet visible so `/pet <state>` is inspectable.
  if (debugState !== undefined) return true
  // Auto-hide whenever the pet has no active task: both the settled SLEEPING
  // state (a long quiet period) and plain IDLE (turn finished, nothing
  // running). Sub-250ms IDLE blips inside an active turn are suppressed by the
  // state machine's minStateMs, so enabling this does not flicker during
  // tool-call gaps.
  if (hideWhenIdle && (state === 'IDLE' || state === 'SLEEPING')) return false
  return true
}
