/**
 * Neutralinojs window backend.
 *
 * Replaces the koffi-based Win32/X11 backends with a system-webview overlay:
 * the host spawns the Neutralino runtime binary, connects to it over the
 * official extension WebSocket protocol, and drives a small frontend that
 * slices the pet's sprite sheet on a transparent canvas.
 *
 * Platform coverage comes from Neutralino itself (WebView2 on Windows,
 * WebKitGTK on Linux, WKWebView on macOS); this backend contains no
 * platform-specific code beyond picking the right runtime binary.
 *
 * Static-resource model: the runtime serves files from its `--path` working
 * directory only. The tiny frontend bundle is copied there per launch, and the
 * pet sprite sheets (in `assets/pets/`) are exposed via a runtime
 * `server.mount` of `/pets` so no pet assets are duplicated.
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WindowBackend, WindowBackendOptions, WindowHandle } from './WindowBackend'
import type { FrameDirective } from '../FrameDecoder'
import { NEUTRALINO_APP_DIR, PETS_DIR, RUNTIME_DIR, USER_PETS_DIR } from '../../paths'

/** Frontend files copied into the per-launch working directory. */
const FRONTEND_DIR = join(NEUTRALINO_APP_DIR, 'resources')

/** Runtime binary names per platform/arch (Neutralino v6 release assets). */
const BINARY_NAMES: Record<string, string | undefined> = {
  'win32-x64': 'neutralino-win_x64.exe',
  'linux-x64': 'neutralino-linux_x64',
  'linux-arm64': 'neutralino-linux_arm64',
  'linux-arm': 'neutralino-linux_armhf',
  'darwin-x64': 'neutralino-mac_x64',
  'darwin-arm64': 'neutralino-mac_arm64',
}

/** How long to wait for the runtime to write `.tmp/auth_info.json`. */
const AUTH_TIMEOUT_MS = 15_000
/** How long to wait for the frontend to report its sprite atlas loaded. */
const UI_READY_TIMEOUT_MS = 15_000

interface AuthInfo {
  nlPort: number | string
  nlToken: string
  nlConnectToken: string
  nlExtensionId?: string
}

/** Locate the Neutralino runtime binary for this platform, or `undefined`. */
export function resolveRuntimeBinary(): string | undefined {
  const name = BINARY_NAMES[`${process.platform}-${process.arch}`]
  if (!name) return undefined
  // Env override first (development/testing), then the package `runtime/`
  // directory populated by the postinstall download script.
  if (process.env.DSH_PET_NEUTRALINO_BIN && existsSync(process.env.DSH_PET_NEUTRALINO_BIN)) {
    return process.env.DSH_PET_NEUTRALINO_BIN
  }
  const packaged = join(RUNTIME_DIR, name)
  return existsSync(packaged) ? packaged : undefined
}

/** A tiny JSON-RPC-style helper over the Neutralino extension WebSocket. */
class NeutralinoConnection {
  private ws: WebSocket | undefined
  private readonly pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private readonly listeners = new Map<string, Set<(data: unknown) => void>>()
  private auth: AuthInfo | undefined
  private closed = false

  connect(auth: AuthInfo): Promise<void> {
    this.auth = auth
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${auth.nlPort}?extensionId=petHost&connectToken=${auth.nlConnectToken}`
      const ws = new WebSocket(url)
      this.ws = ws
      const failTimer = setTimeout(() => reject(new Error('neutralino websocket connect timeout')), 8_000)
      ws.addEventListener('open', () => {
        clearTimeout(failTimer)
        resolve()
      })
      ws.addEventListener('error', () => {
        clearTimeout(failTimer)
        reject(new Error('neutralino websocket connection failed'))
      })
      ws.addEventListener('close', () => {
        this.closed = true
        for (const { reject: rej } of this.pending.values()) rej(new Error('neutralino connection closed'))
        this.pending.clear()
      })
      ws.addEventListener('message', (ev) => this.onMessage(String(ev.data)))
    })
  }

  private onMessage(raw: string): void {
    let msg: { id?: string; event?: string; data?: unknown }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)!
      this.pending.delete(msg.id)
      const data = msg.data as { error?: unknown; returnValue?: unknown } | undefined
      if (data?.error) reject(new Error(JSON.stringify(data.error)))
      else resolve(data?.returnValue ?? data)
      return
    }
    if (msg.event) {
      const set = this.listeners.get(msg.event)
      if (set) for (const listener of set) listener(msg.data)
    }
  }

  /** Invoke a Neutralino native API method (e.g. `window.move`). */
  call(method: string, data?: unknown): Promise<unknown> {
    if (this.closed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('neutralino connection not open'))
    }
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`neutralino call timeout: ${method}`))
      }, 5_000)
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      this.ws!.send(JSON.stringify({ id, method, data, accessToken: this.auth!.nlToken }))
    })
  }

  /** Push an event to the window (frontend `Neutralino.events.on`). */
  broadcast(event: string, data: unknown): void {
    // Fire-and-forget: animation frames must never block the host loop.
    void this.call('app.broadcast', { event, data }).catch(() => {})
  }

  on(event: string, listener: (data: unknown) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return () => { set!.delete(listener) }
  }

  close(): void {
    this.closed = true
    try { this.ws?.close() } catch { /* already closed */ }
    this.ws = undefined
    this.listeners.clear()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Read `.tmp/auth_info.json`, retrying while the runtime is starting up. */
async function waitForAuthInfo(workDir: string): Promise<AuthInfo> {
  const authPath = join(workDir, '.tmp', 'auth_info.json')
  const deadline = Date.now() + AUTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (existsSync(authPath)) {
      try {
        const parsed = JSON.parse(readFileSync(authPath, 'utf8')) as AuthInfo
        if (parsed.nlPort !== undefined && parsed.nlToken && parsed.nlConnectToken) return parsed
      } catch { /* partial write; retry */ }
    }
    await delay(150)
  }
  throw new Error('neutralino runtime did not export auth info in time')
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

export class NeutralinoBackend implements WindowBackend {
  readonly name = 'neutralino'

  isSupported(): boolean {
    return resolveRuntimeBinary() !== undefined
  }

  async create(options: WindowBackendOptions): Promise<WindowHandle> {
    const binary = resolveRuntimeBinary()
    if (!binary) throw new Error('neutralino runtime binary not found (run `npm run postinstall`)')

    // Per-launch working directory: the runtime serves its static files from
    // here, and writes `.tmp/auth_info.json` next to its config.
    const workDir = join(tmpdir(), `dsh-desktop-pet-${process.pid}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(workDir, { recursive: true })

    // Copy the tiny frontend bundle into the serve root. The config declares
    // `documentRoot: "/resources/"`, which the runtime prefixes onto request
    // paths (see Neutralino `handleHTTP`), so the bundle must live in a
    // `resources/` subdirectory of the working directory.
    const serveRoot = join(workDir, 'resources')
    mkdirSync(serveRoot, { recursive: true })
    for (const name of readdirSync(FRONTEND_DIR)) {
      copyFileSync(join(FRONTEND_DIR, name), join(serveRoot, name))
    }

    const config = JSON.parse(readFileSync(join(NEUTRALINO_APP_DIR, 'neutralino.config.json'), 'utf8'))
    config.modes.window.width = options.width
    config.modes.window.height = options.height
    config.modes.window.x = options.x
    config.modes.window.y = options.y
    config.modes.window.alwaysOnTop = options.alwaysOnTop
    writeFileSync(join(workDir, 'neutralino.config.json'), JSON.stringify(config, null, 2))

    // Run in directory resource mode: the runtime would otherwise try to open
    // `resources.neu`, log a `NE_RS_TREEGER` error, and only then fall back to
    // serving the directory. The frontend bundle is served straight from disk,
    // so opting into directory mode skips that probe entirely (and the noise).
    const child: ChildProcess = spawn(binary, [`--path=${workDir}`, '--res-mode=directory'], {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let childExited = false
    child.on('exit', () => { childExited = true })
    // Neutralino logs are diagnostic-only; never let them throw.
    child.stdout?.on('data', () => {})
    child.stderr?.on('data', () => {})

    const killChild = (): void => {
      if (childExited || child.pid === undefined) return
      try { child.kill() } catch { /* already gone */ }
      if (process.platform === 'win32') {
        // Windows GUI processes can survive SIGTERM; force-kill shortly after
        // if the process is still around (teardown path only).
        const pid = child.pid
        setTimeout(() => {
          if (!childExited) {
            try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }) } catch { /* already gone */ }
          }
        }, 500).unref?.()
      }
    }

    let conn: NeutralinoConnection | undefined
    try {
      const auth = await waitForAuthInfo(workDir)
      conn = new NeutralinoConnection()
      await conn.connect(auth)
    } catch (error) {
      killChild()
      rmSync(workDir, { recursive: true, force: true })
      throw error
    }

    // Expose the pet asset roots to the frontend: bundled pets under `/pets`,
    // user-imported pets under `/user-pets` (they live outside the package).
    try {
      await conn.call('server.mount', { path: '/pets', target: PETS_DIR })
      await conn.call('server.mount', { path: '/user-pets', target: USER_PETS_DIR })
    } catch (error) {
      killChild()
      conn.close()
      rmSync(workDir, { recursive: true, force: true })
      throw new Error(`failed to mount pet directory: ${(error as Error)?.message ?? String(error)}`)
    }

    // Wire frontend events to the backend callbacks.
    const offHover = conn.on('pet.hover', () => options.onHover?.())
    const offUnhover = conn.on('pet.unhover', () => options.onUnhover?.())
    const offDragMove = conn.on('pet.dragMove', (data) => {
      const direction = (data as { direction?: string } | undefined)?.direction
      if (direction === 'left' || direction === 'right') options.onDragMove?.(direction)
    })
    const offDragEnd = conn.on('pet.dragEnd', () => options.onDragEnd?.())
    const offDrag = conn.on('pet.drag', (data) => {
      const pos = data as { x?: number; y?: number } | undefined
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) options.onDrag?.(pos.x!, pos.y!)
    })
    const offClose = conn.on('pet.close', () => options.onClose?.())

    // Handshake: wait for the frontend to register listeners, then push the
    // initial pet, then wait for the sprite atlas to load.
    const frontendReady = new Promise<void>((resolve) => {
      const off = conn!.on('pet.frontendReady', () => { off(); resolve() })
    })
    conn.broadcast('pet.handshakeQuery', {})
    await withTimeout(frontendReady, UI_READY_TIMEOUT_MS, 'frontend did not become ready')

    const spritesheetUrl = `${options.petRoot === 'user' ? '/user-pets' : '/pets'}/${options.petId}/${options.spritesheetPath}`
    conn.broadcast('pet.init', {
      scale: options.scale,
      spritesheetUrl,
      x: options.x,
      y: options.y,
    })

    const uiReady = new Promise<void>((resolve, reject) => {
      const offReady = conn!.on('pet.uiReady', () => { offReady(); offError(); resolve() })
      const offError = conn!.on('pet.uiError', (data) => {
        offReady(); offError()
        reject(new Error((data as { message?: string } | undefined)?.message ?? 'pet frontend failed to load'))
      })
    })
    await withTimeout(uiReady, UI_READY_TIMEOUT_MS, 'pet sprite atlas did not load in time')

    let destroyed = false

    const handle: WindowHandle = {
      present: (directive: FrameDirective) => {
        if (destroyed) return
        conn!.broadcast('pet.frame', directive)
      },
      move: (x: number, y: number) => {
        if (destroyed) return
        void conn!.call('window.move', { x, y }).catch(() => {})
      },
      setAlwaysOnTop: (value: boolean) => {
        if (destroyed) return
        void conn!.call('window.setAlwaysOnTop', { enabled: value }).catch(() => {})
      },
      show: () => {
        if (destroyed) return
        void conn!.call('window.show').catch(() => {})
      },
      hide: () => {
        if (destroyed) return
        void conn!.call('window.hide').catch(() => {})
      },
      destroy: () => {
        if (destroyed) return
        destroyed = true
        offHover(); offUnhover(); offDragMove(); offDragEnd(); offDrag(); offClose()
        conn!.close()
        killChild()
        rmSync(workDir, { recursive: true, force: true })
      },
    }

    // Surface unexpected runtime death as a close request so the host can
    // react (the pet window is gone either way).
    child.on('exit', () => {
      if (!destroyed) options.onClose?.()
    })

    return handle
  }
}
