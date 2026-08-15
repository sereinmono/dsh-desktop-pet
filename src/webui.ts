/**
 * The dsh WebUI URL the pet opens when clicked.
 *
 * Harness prints "dsh web: http://127.0.0.1:<webServer.port>" from the
 * web-app bundle; this mirrors that construction exactly. The `webServer`
 * service exists only in web profiles, so a missing port yields undefined
 * (the click-to-open action is then disabled).
 */

/** Loopback host used by the web-app bundle for the local Web runtime. */
const LOOPBACK_HOST = '127.0.0.1'

/** Build the WebUI URL from the live web server port, or undefined. */
export function webUiUrl(port: number | undefined): string | undefined {
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0) return undefined
  return `http://${LOOPBACK_HOST}:${port}`
}
