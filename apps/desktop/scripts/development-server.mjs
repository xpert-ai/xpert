import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

/** Share the API's root .env; shell overrides win. Never expose its other values to Vite. */
export function desktopDevelopmentServer(
  env = process.env,
  envFile = fileURLToPath(new URL('../../../.env', import.meta.url))
) {
  let local = {}
  try {
    local = parseEnv(readFileSync(envFile, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const url = new URL(env.XPERT_DESKTOP_DEV_URL ?? local.XPERT_DESKTOP_DEV_URL ?? 'http://127.0.0.1:4390/')
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('XPERT_DESKTOP_DEV_URL must be an HTTP loopback URL without credentials, a path or query.')
  }
  return { host: url.hostname === '[::1]' ? '::1' : url.hostname, port: Number(url.port || 80), strictPort: true }
}
