/**
 * Pure translation from raw harness payloads to normalized events.
 *
 * Every function here is side-effect free and reads raw payloads defensively
 * (unknown shapes are tolerated and ignored). This is the only layer that
 * knows raw harness event names; it never imports harness packages.
 */

import type { NormalizedEvent, NormalizedEventType } from '../core/types'

export type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readSessionId(session: unknown): string | undefined {
  const record = asRecord(session)
  if (!record) return undefined
  const id = readString(record.id) ?? readString(record.sessionId)
  return id
}

function readEventType(event: unknown): string | undefined {
  return readString(asRecord(event)?.type)
}

function event(
  timestamp: number,
  type: NormalizedEventType,
  sessionId?: string,
  metadata?: UnknownRecord,
  title?: string,
  thinking?: string,
): NormalizedEvent {
  const normalized: NormalizedEvent = { type, timestamp }
  if (sessionId !== undefined) normalized.sessionId = sessionId
  if (metadata !== undefined) normalized.metadata = metadata
  if (title !== undefined) normalized.title = title
  if (thinking !== undefined) normalized.thinking = thinking
  return normalized
}

function turnEndReason(event: UnknownRecord): string | undefined {
  const data = asRecord(event.data)
  const reason = asRecord(data?.reason) ?? data?.reason
  if (typeof reason === 'string') return reason
  const kind = readString(asRecord(reason)?.kind)
  return kind
}

/**
 * Map one `session/event` payload into a normalized event, or `null` when the
 * event is not activity-relevant.
 *
 * @param session - the raw session object (read for `id` only).
 * @param rawEvent - the raw `SessionEvent` envelope (`{ type, data, ... }`).
 */
export function mapSessionEvent(session: unknown, rawEvent: unknown, timestamp = Date.now()): NormalizedEvent | null {
  const eventRecord = asRecord(rawEvent)
  if (!eventRecord) return null
  const type = readEventType(rawEvent)
  if (!type) return null
  const sessionId = readSessionId(session)

  switch (type) {
    case 'turn/end': {
      const reason = turnEndReason(eventRecord)
      if (reason === 'completed') return event(timestamp, 'task.completed', sessionId)
      if (reason && reason !== 'blocked' && reason !== 'interrupted') {
        return event(timestamp, 'task.failed', sessionId, { reason })
      }
      return null
    }

    // A step is one model request: entering it means the model is (about to be)
    // reasoning, so the pet responds immediately at task start instead of
    // waiting for the first assistant chunk.
    case 'step/start':
      return event(timestamp, 'agent.thinking', sessionId)

    case 'tool/call': {
      const data = asRecord(eventRecord.data)
      const toolName = readString(data?.name)
      return event(timestamp, 'tool.started', sessionId, toolName !== undefined ? { toolName } : undefined)
    }

    // A completed tool is not "the whole task is idle": the model usually
    // continues with more chunks or another tool call. Do NOT emit a state
    // change here; the next chunk / turn-end / agent-status drives the pet.
    case 'tool/result':
      return null

    case 'command/run':
      return event(timestamp, 'tool.started', sessionId, { toolName: 'command' })

    case 'command/done':
      return null

    case 'assistant/chunk': {
      const data = asRecord(eventRecord.data)
      const chunk = asRecord(data?.chunk)
      const chunkType = readString(chunk?.type)
      if (chunkType === 'reasoning-delta') {
        // Reasoning text is the bubble's light body; carried as an incremental
        // delta for the registry to aggregate. Never persisted or network-sent.
        const text = readString(chunk?.text)
        return event(timestamp, 'agent.thinking', sessionId, undefined, undefined, text)
      }
      if (chunkType === 'text-delta' || chunkType === 'tool-call-delta') {
        return event(timestamp, 'agent.thinking', sessionId)
      }
      return null
    }

    case 'session/title': {
      // The session-title service appends this last-wins title event; the
      // registry folds it onto the task as the bubble's bold line.
      const data = asRecord(eventRecord.data)
      const title = readString(data?.title)
      if (title !== undefined) {
        return event(timestamp, 'session.title', sessionId, undefined, title)
      }
      return null
    }

    case 'approval/asked':
      return event(timestamp, 'user_input.required', sessionId)

    case 'approval/decided':
      return event(timestamp, 'user_input.resolved', sessionId)

    default:
      return null
  }
}

/**
 * Map an `agent/status` payload (`{ agent, status }`) into a normalized event.
 */
export function mapAgentStatus(payload: unknown, timestamp = Date.now()): NormalizedEvent | null {
  const record = asRecord(payload)
  if (!record) return null
  const status = readString(record.status)
  if (status !== 'idle' && status !== 'running') return null
  if (status === 'running') return null // activity is observed via chunks/tools
  const agent = asRecord(record.agent)
  const sessionId = readSessionId(agent) ?? readString(agent?.id)
  return event(timestamp, 'session.idle', sessionId)
}
