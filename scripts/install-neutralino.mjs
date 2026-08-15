/**
 * Downloads the Neutralino runtime binary for the current platform into
 * `runtime/` (git-ignored). Runs from `postinstall` so consumers get the
 * binary without shipping it in the npm tarball.
 *
 * Failures are intentionally non-fatal: the plugin still loads and simply
 * reports "no supported window backend" when the binary is absent.
 */

import { createWriteStream, existsSync, mkdirSync, statSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { get } from 'node:https'
import { inflateRawSync } from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const VERSION = '6.9.0'
const RELEASE_URL = `https://github.com/neutralinojs/neutralinojs/releases/download/v${VERSION}/neutralinojs-v${VERSION}.zip`

/** Runtime binary name per `process.platform-process.arch`. */
const BINARIES = {
  'win32-x64': 'neutralino-win_x64.exe',
  'linux-x64': 'neutralino-linux_x64',
  'linux-arm64': 'neutralino-linux_arm64',
  'linux-arm': 'neutralino-linux_armhf',
  'darwin-x64': 'neutralino-mac_x64',
  'darwin-arm64': 'neutralino-mac_arm64',
}

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const runtimeDir = join(packageRoot, 'runtime')

function warn(message) {
  console.warn(`[desktop-pet] ${message}`)
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    const req = get(url, { headers: { 'User-Agent': 'dsh-desktop-pet-installer' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        resolve(download(res.headers.location, dest))
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        reject(new Error(`download failed with status ${res.statusCode}`))
        return
      }
      pipeline(res, file).then(resolve, reject)
    })
    req.on('error', reject)
    req.setTimeout(120_000, () => req.destroy(new Error('download timed out')))
  })
}

/**
 * Minimal ZIP reader: extracts a single entry by name. Supports stored (0)
 * and deflate (8) methods via Node's zlib. Dependency-free.
 */
function extractEntry(zip, entryName) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const u16 = (o) => dv.getUint16(o, true)
  const u32 = (o) => dv.getUint32(o, true)

  // Locate End Of Central Directory (0x06054b50) scanning backwards.
  let eocd = -1
  for (let i = zip.length - 22; i >= 0; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not a valid zip archive')

  const totalEntries = u16(eocd + 10)
  let offset = u32(eocd + 16)

  for (let n = 0; n < totalEntries; n++) {
    if (u32(offset) !== 0x02014b50) throw new Error('corrupt central directory')
    const method = u16(offset + 10)
    const compressedSize = u32(offset + 20)
    const uncompressedSize = u32(offset + 24)
    const nameLen = u16(offset + 28)
    const extraLen = u16(offset + 30)
    const commentLen = u16(offset + 32)
    const localOffset = u32(offset + 42)
    const name = zip.subarray(offset + 46, offset + 46 + nameLen).toString('utf8')

    if (name === entryName) {
      // Parse the local file header at `localOffset`.
      const dataStart = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28)
      const data = zip.subarray(dataStart, dataStart + compressedSize)
      if (method === 0) return data
      if (method === 8) {
        const out = inflateRawSync(data)
        if (out.length !== uncompressedSize) throw new Error(`size mismatch extracting ${entryName}`)
        return out
      }
      throw new Error(`unsupported compression method ${method} for ${entryName}`)
    }

    offset += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`entry not found in zip: ${entryName}`)
}

async function main() {
  const key = `${process.platform}-${process.arch}`
  const binaryName = BINARIES[key]
  if (!binaryName) {
    warn(`no Neutralino binary for platform ${key}; desktop pet window disabled`)
    return
  }

  const target = join(runtimeDir, binaryName)
  if (existsSync(target) && statSync(target).size > 0) {
    return // already installed
  }

  mkdirSync(runtimeDir, { recursive: true })
  const zipPath = join(runtimeDir, `.neutralino-v${VERSION}.zip`)

  try {
    warn(`downloading Neutralino runtime v${VERSION} for ${key}…`)
    await download(RELEASE_URL, zipPath)

    const { readFile } = await import('node:fs/promises')
    const zip = await readFile(zipPath)
    const binary = extractEntry(zip, binaryName)

    const { writeFile, rm } = await import('node:fs/promises')
    await writeFile(target, binary)
    if (process.platform !== 'win32') chmodSync(target, 0o755)
    await rm(zipPath, { force: true })

    console.log(`[desktop-pet] Neutralino runtime installed: ${target}`)
  } catch (error) {
    warn(`Neutralino runtime download failed (${error?.message ?? error}); pet window disabled`)
    // Leave any partial zip for a retry on the next install.
  }
}

main()
