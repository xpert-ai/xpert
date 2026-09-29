// Diagnose with normal Chromium verification, independently of the user's TLS
// exception. Never send login credentials, follow redirects, or reuse an allowed session.
const { randomUUID } = require('node:crypto')

function certificateFailure(error) {
  const message = typeof error?.message === 'string' ? error.message : ''
  if (/ERR_CERT_DATE_INVALID/.test(message)) return 'date'
  if (/ERR_CERT_COMMON_NAME_INVALID/.test(message)) return 'hostname'
  if (/ERR_CERT_AUTHORITY_INVALID/.test(message)) return 'authority'
  if (/ERR_CERT_/.test(message)) return 'other'
  return null
}

async function probeCertificate(sessions, origin) {
  const network = sessions.fromPartition(`bosi-certificate-check-${randomUUID()}`, { cache: false })
  try {
    await network.fetch(`${origin}/`, {
      method: 'HEAD',
      credentials: 'omit',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000)
    })
    // HTTP status is unrelated to certificate trust (e.g. HEAD may return 405).
    return { status: 'trusted' }
  } catch (error) {
    const reason = certificateFailure(error)
    return reason ? { status: 'untrusted', reason } : { status: 'unreachable' }
  } finally {
    await network.closeAllConnections()
  }
}

module.exports = { probeCertificate, certificateFailure }
