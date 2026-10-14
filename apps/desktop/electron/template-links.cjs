// Links select a template on the already configured platform; they never change servers,
// carry credentials, select an organization, or install without the user's normal setup flow.
const fs = require('node:fs')
const path = require('node:path')
function parseTemplateLink(value, configuredWebUrl) {
  try {
    if (typeof value !== 'string' || value.length > 2000) return null
    const url = new URL(value),
      configured = new URL(configuredWebUrl)
    if (
      url.protocol !== 'xpert:' ||
      url.hostname !== 'template' ||
      url.pathname !== '/import' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return null
    if ([...url.searchParams.keys()].sort().join(',') !== 'id,origin') return null
    const origin = new URL(url.searchParams.get('origin'))
    if (
      origin.href !== origin.origin + '/' ||
      origin.origin !== configured.origin ||
      origin.username ||
      origin.password
    )
      return null
    const id = url.searchParams.get('id')
    if (!id || id.length > 500 || /[\s?#\\]/.test(id)) return null
    return { id, origin: origin.origin }
  } catch {
    return null
  }
}
function createTemplateLinks({ directory, getService, notify }) {
  const file = path.join(directory, 'pending-template-link.json')
  function read() {
    try {
      const item = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!Number.isFinite(item.at) || Date.now() - item.at > 86400000) return null
      const service = getService()
      if (!service?.profile?.organizationId) return null
      return parseTemplateLink(item.url, service.config.webUrl)
    } catch {
      return null
    }
  }
  return {
    receive(value) {
      const service = getService()
      if (!parseTemplateLink(value, service?.config.webUrl)) return false
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
      const temporary = file + '.tmp'
      fs.writeFileSync(temporary, JSON.stringify({ url: value, at: Date.now() }), { mode: 0o600 })
      fs.renameSync(temporary, file)
      notify()
      return true
    },
    read,
    dismiss(id) {
      if (read()?.id !== id) return false
      fs.rmSync(file, { force: true })
      return true
    }
  }
}
module.exports = { parseTemplateLink, createTemplateLinks }
