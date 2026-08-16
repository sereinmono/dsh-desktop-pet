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
 * The pet is drawn with a fixed bubble area ABOVE it (`TOP_PAD_FRAC` of the
 * pet height) and a bottom pad (`BOTTOM_PAD_FRAC` of the content height).
 * Neutralino transparent windows on Windows have a known dead zone in the
 * bottom ~20% where pointer input never arrives (neutralinojs#1482), so no
 * interactive content may live there — the status bubbles go on TOP.
 */
const BOTTOM_PAD_FRAC = 0.25
const TOP_PAD_FRAC = 0.5
/** Bubble area is at least this multiple of the pet width (for title text). */
const BUBBLE_MIN_WIDTH_FACTOR = 1.25

/**
 * Compute the window canvas size for a given scale. All returned values are
 * physical pixels (the host creates the window at this size).
 * @param scale - display scale applied to the 192×208 cell.
 */
function layoutForScale(scale) {
  const petW = Math.max(1, Math.round(CELL_WIDTH * scale))
  const petH = Math.max(1, Math.round(CELL_HEIGHT * scale))
  const topPad = Math.round(petH * TOP_PAD_FRAC)
  const width = Math.max(petW, Math.round(petW * BUBBLE_MIN_WIDTH_FACTOR))
  const contentH = topPad + petH
  const height = Math.max(contentH + 1, Math.round(contentH / (1 - BOTTOM_PAD_FRAC)))
  return {
    width,
    height,
    topPad,
    petX: Math.round((width - petW) / 2),
    petY: topPad,
    petW,
    petH,
  }
}

/**
 * CSS display size/layout for a layout under a device pixel ratio.
 *
 * The host creates the window in physical pixels, and the webview maps them to
 * CSS pixels by dividing by `devicePixelRatio`. The canvas pixel buffer stays
 * at the physical size; DOM elements (bubbles) are laid out in CSS pixels.
 */
function cssLayoutFor(layout, dpr) {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const div = (v) => v / ratio
  return {
    width: div(layout.width),
    height: div(layout.height),
    topPad: div(layout.topPad),
    petX: div(layout.petX),
    petY: div(layout.petY),
    petW: div(layout.petW),
    petH: div(layout.petH),
  }
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
 * CSS display size for a layout under a device pixel ratio (legacy alias of
 * cssLayoutFor's width/height).
 */
function cssSizeFor(layout, dpr) {
  const css = cssLayoutFor(layout, dpr)
  return { width: css.width, height: css.height }
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
