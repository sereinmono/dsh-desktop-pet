/**
 * The window backend contract.
 *
 * A backend owns a single transparent, frameless, always-on-top overlay and
 * presents finished frames into it. The Neutralino backend receives render
 * directives (not pixels); the koffi backends have been retired. Platform
 * details stay behind this interface; the renderer only knows
 * {@link WindowBackend}.
 */

import type { FrameDirective } from '../FrameDecoder'

export interface WindowBackendOptions {
  width: number
  height: number
  x: number
  y: number
  alwaysOnTop: boolean
  /** Pet directory id (for locating the sprite sheet URL). */
  petId: string
  /** Manifest `spritesheetPath`, relative to the pet directory. */
  spritesheetPath: string
  /** Display scale applied to the 192×208 cell. */
  scale: number
  /** When true the window ignores pointer input (unsupported by Neutralino). */
  clickThrough?: boolean
  /** Invoked after the user drags the window to a new position. */
  onDrag?: (x: number, y: number) => void
  /** Invoked repeatedly during a drag with the horizontal direction. */
  onDragMove?: (direction: 'left' | 'right') => void
  /** Invoked when a drag ends. */
  onDragEnd?: () => void
  /** Invoked when the pointer hovers over the pet (rate-limited by the backend). */
  onHover?: () => void
  /** Invoked when the pointer leaves the pet. */
  onUnhover?: () => void
  /** Invoked when the user chooses the context menu's "close pet" item. */
  onClose?: () => void
}

export interface WindowHandle {
  /** Present a render directive (the frontend draws the corresponding cell). */
  present(directive: FrameDirective): void
  move(x: number, y: number): void
  setAlwaysOnTop(value: boolean): void
  show(): void
  hide(): void
  destroy(): void
}

export interface WindowBackend {
  /** Human-readable backend name for diagnostics. */
  readonly name: string
  /** Whether this backend can run in the current process/platform. */
  isSupported(): boolean
  /** Create and map the overlay window. Resolves once it is ready. */
  create(options: WindowBackendOptions): Promise<WindowHandle>
}

export type { FrameDirective }
