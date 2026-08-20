const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000'
const SAME_ORIGIN_API_BASE_URLS = new Set(['same-origin', 'self', '/'])

function resolveProxyTarget() {
  const configuredClientUrl = process.env.VITE_API_BASE_URL?.trim()
  const configured =
    !configuredClientUrl || SAME_ORIGIN_API_BASE_URLS.has(configuredClientUrl.toLowerCase())
      ? process.env.API_BASE_URL || DEFAULT_API_BASE_URL
      : configuredClientUrl
  const parsed = new URL(configured)
  if (parsed.hostname === 'localhost') {
    parsed.hostname = '127.0.0.1'
  }
  const pathname = parsed.pathname.replace(/\/+$/, '').replace(/\/api$/, '')
  parsed.pathname = pathname || '/'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

const target = resolveProxyTarget()
const sharedProxy = {
  target,
  secure: false,
  xfwd: true,
  changeOrigin: true
}

module.exports = {
  '/api': sharedProxy,
  '/artifacts/share': sharedProxy
}
