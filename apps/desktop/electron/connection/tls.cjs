// Invariants: certificate exceptions are opt-in and limited to configured service
// hosts. Each policy gets a fresh Chromium session: verifier decisions and live
// TLS connections must not survive disabling an exception or changing services.
const { randomUUID } = require('node:crypto')

function connectionPolicyKey(config) {
  return JSON.stringify([config.apiUrl, config.webUrl, config.frameUrl, config.allowUntrustedCertificates === true])
}

function createConnectionSession(sessions, config) {
  const hosts = new Set(
    [config.apiUrl, config.webUrl, config.frameUrl]
      .map((value) => new URL(value))
      .filter((url) => url.protocol === 'https:')
      .map((url) => url.hostname.toLowerCase().replace(/^\[|\]$/g, ''))
  )
  const allow = config.allowUntrustedCertificates === true
  const connection = sessions.fromPartition(`bosi-connection-${randomUUID()}`)
  connection.setCertificateVerifyProc((request, callback) => {
    const hostname = request.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    callback(allow && hosts.has(hostname) ? 0 : -3)
  })
  return connection
}

function connectionErrorKey(error) {
  const codes = []
  for (let cause = error, depth = 0; cause && depth < 4; cause = cause.cause, depth++) {
    codes.push(cause.code, cause.name, cause.message)
  }
  const message = codes.filter((value) => typeof value === 'string').join(' ')
  if (/CERT_HAS_EXPIRED|CERT_NOT_YET_VALID|ERR_CERT_DATE_INVALID/.test(message))
    return 'The service certificate has expired or is not yet valid. Check the device clock and certificate. For a trusted private service, you can enable "Allow untrusted service certificates" in Connection settings.'
  if (/ERR_TLS_CERT_ALTNAME_INVALID|ERR_CERT_COMMON_NAME_INVALID/.test(message))
    return 'The service certificate does not match this address. Check the service URL. For a trusted private service, you can enable "Allow untrusted service certificates" in Connection settings.'
  if (/SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|ERR_CERT_/.test(message))
    return 'The service certificate is not trusted. For a trusted private service, enable "Allow untrusted service certificates" in Connection settings, save, and sign in again.'
  if (/TimeoutError|ETIMEDOUT|ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT/.test(message))
    return 'The connection to Xpert timed out. Check the service address and network, then retry.'
  if (/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED/.test(message))
    return 'The Xpert service hostname could not be resolved. Check the address and DNS settings.'
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/.test(message))
    return 'The Xpert service refused the connection. Check the service address, port, and whether the server is running.'
  return null
}

module.exports = { connectionPolicyKey, createConnectionSession, connectionErrorKey }
