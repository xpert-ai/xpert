// Desktop shares a release repository with the platform. Never use /releases/latest:
// only published desktop-v tags with this architecture's metadata are update sources.
const semver = require('semver')
const { repository, metadataName, mirrorBase, feedFor } = require('./config.cjs')
async function findRelease({ platform, arch, mirrorDomain, fetcher = fetch }) {
  if (!['darwin', 'win32', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) return null
  const metadata = metadataName(platform, arch)
  const base = mirrorBase(mirrorDomain)
  if (base) {
    try {
      const response = await fetcher(`${base}/latest.json`, { signal: AbortSignal.timeout(6000), redirect: 'error' })
      if (!response.ok) throw new Error('Mirror lookup failed')
      const index = await response.json()
      const stableTag = /^desktop-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/
      if (
        index?.schema !== 1 ||
        !stableTag.test(index.tag) ||
        !index.feeds ||
        typeof index.feeds !== 'object' ||
        Array.isArray(index.feeds)
      )
        throw new Error('Invalid mirror index')
      const tag = index.feeds[metadata]
      if (tag === undefined) return null
      const match = typeof tag === 'string' && stableTag.exec(tag)
      if (!match || !semver.valid(match[1]) || semver.gt(match[1], index.tag.slice(9)))
        throw new Error('Invalid mirror update tag')
      return feedFor(tag, arch, base)
    } catch {
      // Keep the official GitHub discovery path available during mirror outages.
    }
  }
  let latest = null
  for (let page = 1; ; page++) {
    const response = await fetcher(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) throw new Error('Release lookup failed')
    const releases = await response.json()
    if (!Array.isArray(releases)) throw new Error('Invalid release list')
    for (const release of releases) {
      if (!release || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string')
        continue
      const match = /^desktop-v(\d+\.\d+\.\d+)$/.exec(release.tag_name)
      if (!match || !semver.valid(match[1]) || !Array.isArray(release.assets)) continue
      if (!release.assets.some((asset) => asset?.name === metadata)) continue
      if (!latest || semver.gt(match[1], latest.version)) latest = { tag: release.tag_name, version: match[1] }
    }
    if (releases.length < 100) return latest ? feedFor(latest.tag, arch) : null
  }
}
module.exports = { metadataName, feedFor, findRelease }
