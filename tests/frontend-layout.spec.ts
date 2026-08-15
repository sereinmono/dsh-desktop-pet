import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

/**
 * Load the frontend's dependency-free render math (`pet-render.js`) into a
 * sandbox so its layout rules can be tested on the host without a browser.
 */
const renderSource = readFileSync(
  fileURLToPath(new URL('../assets/neutralino/resources/pet-render.js', import.meta.url)),
  'utf8',
)

function loadRenderer(): {
  layoutForScale(scale: number): { width: number; height: number; petX: number; petY: number; petW: number; petH: number }
  cssSizeFor(layout: { width: number; height: number }, dpr: number): { width: number; height: number }
  clampDragTarget(x: number, y: number, layout: unknown, sw: number, sh: number): { x: number; y: number }
  sourceRect(d: { sx?: number; sy?: number }): { sx: number; sy: number; sw: number; sh: number }
} {
  const sandbox = {} as Record<string, unknown>
  vm.runInNewContext(renderSource, sandbox)
  return sandbox as never
}

describe('frontend layout (pet-render.js)', () => {
  it('keeps the pet in the top 75% of the window (bottom pad)', () => {
    const { layoutForScale } = loadRenderer()
    const s1 = layoutForScale(1)
    // pet is 192×208; height must reserve a bottom pad of 25%.
    expect(s1.petW).toBe(192)
    expect(s1.petH).toBe(208)
    expect(s1.height).toBe(Math.round(208 / 0.75))
    expect(s1.petY).toBe(0)

    const s2 = layoutForScale(2)
    expect(s2.petW).toBe(384)
    expect(s2.petH).toBe(416)
    expect(s2.height).toBe(Math.round(416 / 0.75))
  })

  it('clamps drag targets so the pet sprite stays fully on screen', () => {
    const { layoutForScale, clampDragTarget } = loadRenderer()
    const layout = layoutForScale(1)
    // Screen 1920×1080; pet is 192 wide, 208 tall at the window top.
    const clamped = clampDragTarget(99999, 99999, layout, 1920, 1080)
    expect(clamped.x).toBe(1920 - 192)
    expect(clamped.y).toBe(1080 - 208)
  })

  it('scales the CSS size down by the device pixel ratio', () => {
    const { layoutForScale, cssSizeFor } = loadRenderer()
    const layout = layoutForScale(1)
    expect(cssSizeFor(layout, 1)).toEqual({ width: layout.width, height: layout.height })
    // 150% DPI: CSS size is 2/3 of the physical size; the buffer stays physical.
    expect(cssSizeFor(layout, 1.5).width).toBeCloseTo(layout.width / 1.5, 5)
    expect(cssSizeFor(layout, 1.5).height).toBeCloseTo(layout.height / 1.5, 5)
    // A missing/invalid DPR must fall back to identity, not divide by zero.
    expect(cssSizeFor(layout, 0)).toEqual({ width: layout.width, height: layout.height })
    expect(cssSizeFor(layout, NaN)).toEqual({ width: layout.width, height: layout.height })
  })

  it('defaults a malformed directive to the idle cell', () => {
    const { sourceRect } = loadRenderer()
    expect(sourceRect({})).toEqual({ sx: 0, sy: 0, sw: 192, sh: 208 })
    expect(sourceRect({ sx: NaN, sy: 208 })).toEqual({ sx: 0, sy: 208, sw: 192, sh: 208 })
  })
})
