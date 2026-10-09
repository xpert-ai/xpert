// Templates embed avatars as Data URLs; use the same 5 MiB limit as avatar uploads.
const MAX_INLINE_BYTES = 5 * 1024 * 1024
const MAX_INLINE_LENGTH = 4 * Math.ceil(MAX_INLINE_BYTES / 3)

function parseAvatarUrl(value) {
  if (typeof value !== 'string') return null
  const source = value.trim()
  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source)
      return url.username || url.password ? null : url.href
    } catch {
      return null
    }
  }

  const header = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,/i.exec(source)
  if (!header) return null
  const payload = source.slice(header[0].length)
  if (!payload || payload.length > MAX_INLINE_LENGTH || payload.length % 4 || /[^A-Za-z0-9+/=]/.test(payload))
    return null
  const bytes = Buffer.from(payload, 'base64')
  if (bytes.length > MAX_INLINE_BYTES || bytes.toString('base64') !== payload) return null
  return source
}

module.exports = { parseAvatarUrl }
