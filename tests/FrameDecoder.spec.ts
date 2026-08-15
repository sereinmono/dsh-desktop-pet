import { describe, expect, it } from 'vitest'
import { sliceFrame, scaleFrame, rgbaToPremultipliedBgra, frameDirective } from '../src/renderer/FrameDecoder'
import type { AtlasBuffer } from '../src/renderer/FrameDecoder'

/** Build a minimal atlas where every byte is deterministically set. */
function makeAtlas(width: number, height: number, fill: (i: number) => number = i => i % 256): AtlasBuffer {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < rgba.length; i++) rgba[i] = fill(i)
  return { width, height, rgba }
}

describe('sliceFrame', () => {
  it('slices the idle frame 0 cell', () => {
    const atlas = makeAtlas(1536, 1872)
    const frame = sliceFrame(atlas, 'idle', 0)
    expect(frame.width).toBe(192)
    expect(frame.height).toBe(208)
    expect(frame.rgba.length).toBe(192 * 208 * 4)
  })

  it('slices frame 1 of idle from the second column', () => {
    const atlas = makeAtlas(1536, 1872)
    // Put a marker at the second cell's first pixel.
    const secondColFirstPixel = (0 * 1536 + 192) * 4
    atlas.rgba[secondColFirstPixel] = 200
    const frame = sliceFrame(atlas, 'idle', 1)
    expect(frame.rgba[0]).toBe(200)
  })
})

describe('scaleFrame', () => {
  it('is identity at scale 1', () => {
    const frame = { width: 2, height: 2, rgba: new Uint8Array(16) }
    expect(scaleFrame(frame, 1)).toBe(frame)
  })

  it('nearest-neighbor scales up', () => {
    const frame = { width: 2, height: 2, rgba: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]) }
    const out = scaleFrame(frame, 2)
    expect(out.width).toBe(4)
    expect(out.height).toBe(4)
    expect(out.rgba.length).toBe(4 * 4 * 4)
    // Top-left source pixel is red → top-left 2×2 output block is red.
    expect([out.rgba[0], out.rgba[1], out.rgba[2]]).toEqual([255, 0, 0])
  })
})

describe('frameDirective', () => {
  it('carries the idle frame 0 source rectangle', () => {
    const d = frameDirective('idle', 0)
    expect(d.pose).toBe('idle')
    expect(d.frameIndex).toBe(0)
    expect(d).toMatchObject({ sx: 0, sy: 0, sw: 192, sh: 208 })
  })

  it('advances the column for idle frame 1', () => {
    const d = frameDirective('idle', 1)
    expect(d.sx).toBe(192)
    expect(d.sy).toBe(0)
  })

  it('wraps the frame index by the row frame count', () => {
    // idle has 6 frames; index 6 wraps back to column 0.
    const d = frameDirective('idle', 6)
    expect(d.sx).toBe(0)
  })
})

describe('rgbaToPremultipliedBgra', () => {
  it('premultiplies and swaps to BGRA', () => {
    // One pixel: red 255, green 0, blue 0, alpha 128.
    const frame = { width: 1, height: 1, rgba: new Uint8Array([255, 0, 0, 128]) }
    const out = rgbaToPremultipliedBgra(frame)
    // BGRA: B = 0, G = 0, R = premult(255 * 128/255) = 128, A = 128.
    expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, 128, 128])
  })

  it('leaves opaque pixels unchanged in channel order (B,G,R)', () => {
    const frame = { width: 1, height: 1, rgba: new Uint8Array([10, 20, 30, 255]) }
    const out = rgbaToPremultipliedBgra(frame)
    expect([out[0], out[1], out[2], out[3]]).toEqual([30, 20, 10, 255])
  })
})
