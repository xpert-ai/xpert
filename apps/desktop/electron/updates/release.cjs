// Desktop shares a release repository with the platform. Only stable desktop tags
// with this architecture's metadata can supply an update.
const semver = require('semver')
const { repository, metadataName, mirrorBase, feedFor } = require('./config.cjs')

const stableTag = /^desktop-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/

async function exitCountry(fetcher) {
  try {
    const response = await fetcher('https://www.cloudflare.com/cdn-cgi/trace', {
      signal: AbortSignal.timeout(2500),
      redirect: 'error',
      cache: 'no-store'
    })
    if (!response.ok) return null
    const trace = await response.text()
    if (!/^h=www\.cloudflare\.com\r?$/m.test(trace)) return null
    const country = /^loc=([A-Z]{2})\r?$/m.exec(trace)?.[1]
    return country && country !== 'XX' ? country : null
  } catch {
    return null
  }
}

async function mirrorTag(base, metadata, fetcher) {
  const response = await fetcher(`${base}/latest.json`, { signal: AbortSignal.timeout(6000), redirect: 'error' })
  if (!response.ok) throw new Error('Mirror lookup failed')
  const index = await response.json()
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
  return tag
}

async function githubTag(metadata, fetcher) {
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
      const match = stableTag.exec(release.tag_name)
      if (!match || !semver.valid(match[1]) || !Array.isArray(release.assets)) continue
      if (!release.assets.some((asset) => asset?.name === metadata)) continue
      if (!latest || semver.gt(match[1], latest.slice(9))) latest = release.tag_name
    }
    if (releases.length < 100) return latest
  }
}

async function getReleaseSources({ platform, arch, mirrorDomain, fetcher = fetch }) {
  if (!['darwin', 'win32', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) return []
  const metadata = metadataName(platform, arch)
  const github = { name: 'github', latest: () => githubTag(metadata, fetcher), feed: (tag) => feedFor(tag, arch) }
  const base = mirrorBase(mirrorDomain)
  if (!base) return [github]
  const aliyun = {
    name: 'aliyun',
    latest: () => mirrorTag(base, metadata, fetcher),
    feed: (tag) => feedFor(tag, arch, base)
  }
  const country = await exitCountry(fetcher)
  return !country || country === 'CN' ? [aliyun, github] : [github, aliyun]
}

async function checkReleaseSources(sources, { checkFeed, isManual, currentVersion }) {
  let failure
  for (const source of sources) {
    try {
      const tag = await source.latest()
      if (!tag) continue
      const feed = source.feed(tag)
      const result = await checkFeed(feed)
      if (result?.updateInfo?.version !== tag.slice(9)) throw new Error('Update feed does not match release tag')
      if (result.isUpdateAvailable) {
        const alternate = sources.find((other) => other !== source)
        return { info: result.updateInfo, feed, alternate: alternate?.feed(tag) }
      }
      if (
        source === sources[0] &&
        source.name === 'aliyun' &&
        isManual() &&
        semver.lte(result.updateInfo.version, currentVersion)
      )
        continue
      return null
    } catch (error) {
      failure = error
    }
  }
  if (failure) throw failure
  return null
}

module.exports = { getReleaseSources, checkReleaseSources }
