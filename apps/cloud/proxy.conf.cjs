const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000'

function resolveProxyTarget() {
  const configured = process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || DEFAULT_API_BASE_URL
  const parsed = new URL(configured)
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
  changeOrigin: true
}

module.exports = {
  '/api': sharedProxy,
  '/artifacts/share': sharedProxy
}
