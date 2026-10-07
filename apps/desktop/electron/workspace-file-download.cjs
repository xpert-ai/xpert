const { createWriteStream } = require('node:fs')
const { rename, rm } = require('node:fs/promises')
const { dirname, join, basename } = require('node:path')
const { randomUUID } = require('node:crypto')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

/** File grants stay scoped to the signed-in host; never send account credentials to a renderer URL. */
function isWorkspaceFileDownload(value, apiUrl) {
  try {
    const url = new URL(value)
    const api = new URL(apiUrl)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.origin === api.origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/api\/workspace-files\/content\/[\da-f-]{36}\/[\da-f-]{36}\/[^/]+$/i.test(url.pathname)
    )
  } catch {
    return false
  }
}

async function downloadWorkspaceFile(url, service, choosePath) {
  if (!isWorkspaceFileDownload(url, service.config.apiUrl)) throw new Error('Invalid file grant')
  const generation = service.generation
  const parts = new URL(url).pathname.split('/')
  const [sessionId, grantId, fileName] = parts.slice(-3)
  const destination = await choosePath(basename(decodeURIComponent(fileName)))
  if (!destination) return
  if (generation !== service.generation) throw new Error('Session changed')
  const response = await service.request(
    `/api/workspace-files/view-sessions/${sessionId}/grants/${grantId}/content/${fileName}`,
    { scope: 'organization', responseType: 'response', timeout: 120000 }
  )
  if (!response.body) throw new Error('Missing file content')
  const temporary = join(dirname(destination), `.xpert-download-${randomUUID()}`)
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
    if (generation !== service.generation) throw new Error('Session changed')
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}

module.exports = { isWorkspaceFileDownload, downloadWorkspaceFile }
