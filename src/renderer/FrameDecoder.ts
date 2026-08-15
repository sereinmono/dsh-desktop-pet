/**
 * Pure frame slicing and scaling.
 *
 * Converts a decoded Codex atlas into individual frames at the requested
 * display scale. Everything here is deterministic and unit-testable; the
 * window backends only receive a finished {@link PetFrame} to present.
 */

import { CELL_HEIGHT, CELL_WIDTH, frameRect } from './codex-pet/PetContract'
import type { CodexPetState } from '../core/types'

export interface AtlasBuffer {
  width: number
  height: number
  /** RGBA bytes, `width * height * 4` in length. */
  rgba: Uint8Array
}

export interface PetFrame {
  width: number
  height: number
  /** RGBA bytes, `width * height * 4` in length. */
  rgba: Uint8Array
}

/**
 * A render instruction sent to the frontend instead of raw pixels.
 *
 * The frontend loads the pet's sprite sheet itself and draws the cell
 * identified by `(sx, sy, sw, sh)`; the host only owns timing and state.
 * `pose` + `frameIndex` are retained for diagnostics.
 */
export interface FrameDirective {
  pose: CodexPetState
  frameIndex: number
  /** Source rectangle inside the sprite sheet (unscaled contract pixels). */
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * Derive the render directive for a given pose and frame index. Pure and
 * unit-testable; mirrors {@link sliceFrame} but carries coordinates instead
 * of copied pixels.
 */
export function frameDirective(state: CodexPetState, index: number): FrameDirective {
  const rect = frameRect(state, index)
  return { pose: state, frameIndex: index, sx: rect.x, sy: rect.y, sw: rect.width, sh: rect.height }
}

/**
 * Extract one cell (a single animation frame) from an atlas.
 */
export function sliceFrame(atlas: AtlasBuffer, state: CodexPetState, index: number): PetFrame {
  const rect = frameRect(state, index)
  if (rect.x + rect.width > atlas.width || rect.y + rect.height > atlas.height) {
    throw new Error(`Frame ${state}:${index} is outside atlas bounds`)
  }
  const out = new Uint8Array(rect.width * rect.height * 4)
  for (let row = 0; row < rect.height; row++) {
    const srcStart = ((rect.y + row) * atlas.width + rect.x) * 4
    const dstStart = row * rect.width * 4
    out.set(atlas.rgba.subarray(srcStart, srcStart + rect.width * 4), dstStart)
  }
  return { width: rect.width, height: rect.height, rgba: out }
}

/**
 * Nearest-neighbor scale an RGBA frame to a new integer size.
 * Keeps the backend dumb: it receives pixels already at display size.
 */
export function scaleFrame(frame: PetFrame, scale: number): PetFrame {
  if (scale <= 0) throw new Error(`Invalid scale: ${scale}`)
  if (scale === 1) return frame
  const width = Math.max(1, Math.round(frame.width * scale))
  const height = Math.max(1, Math.round(frame.height * scale))
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(frame.height - 1, Math.floor((y * frame.height) / height))
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(frame.width - 1, Math.floor((x * frame.width) / width))
      const src = (srcY * frame.width + srcX) * 4
      const dst = (y * width + x) * 4
      out[dst] = frame.rgba[src]
      out[dst + 1] = frame.rgba[src + 1]
      out[dst + 2] = frame.rgba[src + 2]
      out[dst + 3] = frame.rgba[src + 3]
    }
  }
  return { width, height, rgba: out }
}

/** The Codex contract's fixed base dimensions. */
export const BASE_CELL = { width: CELL_WIDTH, height: CELL_HEIGHT } as const

/**
 * Convert straight (non-premultiplied) RGBA into premultiplied BGRA, the byte
 * order Win32 `UpdateLayeredWindow(ULW_ALPHA)` expects on little-endian.
 * This is a pure, testable transform kept out of the backend.
 */
export function rgbaToPremultipliedBgra(frame: PetFrame): Uint8Array {
  const out = new Uint8Array(frame.rgba.length)
  rgbaToPremultipliedBgraInto(frame, out)
  return out
}

/**
 * Same conversion, writing into a caller-provided `out` buffer (which must be
 * at least `frame.rgba.length` bytes). The backend pre-allocates `out` once and
 * reuses it across frames, so the hot render path performs no per-frame
 * allocation.
 */
export function rgbaToPremultipliedBgraInto(frame: PetFrame, out: Uint8Array): void {
  const pixels = frame.width * frame.height
  for (let i = 0; i < pixels; i++) {
    const src = i * 4
    const r = frame.rgba[src]
    const g = frame.rgba[src + 1]
    const b = frame.rgba[src + 2]
    const a = frame.rgba[src + 3]
    const premultiply = (v: number) => Math.round((v * a) / 255)
    out[src] = premultiply(b)
    out[src + 1] = premultiply(g)
    out[src + 2] = premultiply(r)
    out[src + 3] = a
  }
}
