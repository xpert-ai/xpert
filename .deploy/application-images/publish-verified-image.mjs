// Invariants: publish the saved, health-checked image, never a rebuild. Existing
// version/SHA tags must identify that same image; only channel aliases may move.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const digestPattern = /^sha256:[a-f0-9]{64}$/
const docker = (args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15 * 60_000
  }).trim()

function remoteImageId(tag, run) {
  let manifest
  try {
    manifest = JSON.parse(run(['buildx', 'imagetools', 'inspect', '--raw', tag]))
  } catch (error) {
    const message = String(error.stderr || error.message)
    if (
      typeof error.status === 'number' &&
      (/manifest unknown|MANIFEST_UNKNOWN/i.test(message) || message.includes(`${tag}: not found`))
    )
      return null
    throw error
  }
  if (manifest.config?.digest) {
    assert.match(manifest.config.digest, digestPattern)
    return manifest.config.digest
  }
  // Earlier Buildx releases may have attached provenance to a single-platform index.
  const linux = manifest.manifests?.filter(
    (entry) => entry.platform?.os === 'linux' && entry.platform?.architecture === 'amd64'
  )
  assert.equal(linux?.length, 1, `Cannot verify existing image ${tag}`)
  assert.match(linux[0].digest, digestPattern)
  const repository = tag.includes('@') ? tag.split('@')[0] : tag.slice(0, tag.lastIndexOf(':'))
  const child = JSON.parse(run(['buildx', 'imagetools', 'inspect', '--raw', `${repository}@${linux[0].digest}`]))
  assert.match(child.config?.digest ?? '', digestPattern)
  return child.config.digest
}

export function publishVerifiedImage({ image, verifiedId, tags, version, sha, run = docker }) {
  assert.match(verifiedId, digestPattern)
  assert.match(sha, /^[a-f0-9]{40}$/)
  assert.match(version, /^\d+\.\d+\.\d+(?:-candidate\.(?:develop|main)\.[a-f0-9]{12})?$/)
  const [local] = JSON.parse(run(['image', 'inspect', image]))
  assert.equal(local.Id, verifiedId, 'Loaded image differs from the health-checked artifact')
  assert.equal(local.Config?.Labels?.['org.opencontainers.image.revision'], sha)
  assert.equal(local.Config?.Labels?.['org.opencontainers.image.version'], version)
  const candidate = version.match(/-candidate\.(develop|main)\./)
  const immutable = new Set([version, `sha-${sha}`])
  const aliases = new Set(candidate ? [`${candidate[1]}-candidate`] : ['main', 'latest'])
  assert.ok(tags.length, 'No image tags selected')
  const planned = [...new Set(tags)].map((tag) => {
    assert.match(tag, /^[a-z0-9][a-z0-9._/-]*:[A-Za-z0-9_.-]+$/)
    const value = tag.slice(tag.lastIndexOf(':') + 1)
    assert.ok(immutable.has(value) || aliases.has(value), `Unexpected release tag: ${tag}`)
    if (aliases.has(value)) return { tag, alias: true, exists: false }
    const existingId = remoteImageId(tag, run)
    assert.ok(existingId === null || existingId === verifiedId, `Refusing to overwrite immutable image ${tag}`)
    return { tag, alias: false, exists: existingId !== null }
  })
  // Check every immutable target before writing; move aliases only after all mirrors succeed.
  for (const entry of [...planned.filter((entry) => !entry.alias), ...planned.filter((entry) => entry.alias)]) {
    if (entry.exists) continue
    run(['tag', image, entry.tag])
    run(['push', entry.tag])
    console.log(`Published ${entry.tag}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishVerifiedImage({
    image: process.env.LOCAL_IMAGE,
    verifiedId: readFileSync(process.env.VERIFIED_IMAGE_ID_FILE, 'utf8').trim(),
    tags: (process.env.IMAGE_TAGS ?? '').split('\n').filter(Boolean),
    version: process.env.IMAGE_VERSION,
    sha: process.env.IMAGE_SHA
  })
}
