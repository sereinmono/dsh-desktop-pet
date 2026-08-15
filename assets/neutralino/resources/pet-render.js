/**
 * Pure renderer math for the Neutralino frontend.
 *
 * Deliberately DOM-free so it can be unit-tested on the host side. The DOM
 * wiring lives in index.html and references these functions as globals.
 */

/** Fixed Codex sprite cell (mirrors src/renderer/codex-pet/PetContract.ts). */
const CELL_WIDTH = 192
const CELL_HEIGHT = 208

/**
 * Layout of the pet inside the window canvas.
 *
 * The pet is drawn at the TOP of the window; `bottomPadFrac` of the window
 * height below it is kept empty. Neutralino transparent windows on Windows
 * have a known dead zone in the bottom ~20% where pointer input never arrives
 * (neutralinojs#1482), so no interactive content may live there.
 */
const BOTTOM_PAD_FRAC = 0.25

/**
 * Compute the window canvas size for a given scale.
 * @param scale - display scale applied to the 192×208 cell.
 */
function layoutForScale(scale) {
  const petW = Math.max(1, Math.round(CELL_WIDTH * scale))
  const petH = Math.max(1, Math.round(CELL_HEIGHT * scale))
  const width = petW
  const height = Math.max(petH + 1, Math.round((petH / (1 - BOTTOM_PAD_FRAC))))
  return { width, height, petX: 0, petY: 0, petW, petH }
}

/**
 * Clamp a drag target so the pet sprite stays fully on screen.
 * `winX/winY` is the window's top-left; the pet offset inside the window is
 * (petX, petY). Returns the clamped window position.
 */
function clampDragTarget(x, y, layout, screenW, screenH) {
  const minX = -layout.petX
  const minY = -layout.petY
  const maxX = Math.max(minX, screenW - layout.petX - layout.petW)
  const maxY = Math.max(minY, screenH - layout.petY - layout.petH)
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  }
}

/**
 * CSS display size for a layout under a device pixel ratio.
 *
 * The host creates the window in physical pixels, and the webview maps them to
 * CSS pixels by dividing by `devicePixelRatio` (e.g. 150% scaling halves the
 * logical size). The canvas pixel buffer must stay at the physical size so it
 * fills the window exactly; only its CSS size is scaled down.
 */
function cssSizeFor(layout, dpr) {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  return {
    width: layout.width / ratio,
    height: layout.height / ratio,
  }
}

/**
 * Derive the atlas source rectangle for a frame directive sent by the host.
 * The host owns the sprite contract; directives carry (sx, sy) directly, so
 * this only validates and falls back to the idle cell on malformed input.
 */
function sourceRect(directive) {
  const sx = Number.isFinite(directive?.sx) ? directive.sx : 0
  const sy = Number.isFinite(directive?.sy) ? directive.sy : 0
  return { sx, sy, sw: CELL_WIDTH, sh: CELL_HEIGHT }
}
