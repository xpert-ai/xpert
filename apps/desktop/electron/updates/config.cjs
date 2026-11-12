const repository = 'xpert-ai/xpert'
const channel = (arch) => `desktop-${arch}`
function metadataName(platform, arch) {
  const suffix =
    platform === 'darwin' ? '-mac' : platform === 'linux' ? `-linux${arch === 'x64' ? '' : `-${arch}`}` : ''
  return `${channel(arch)}${suffix}.yml`
}
function mirrorBase(domain) {
  if (!domain) return undefined
  if (
    typeof domain !== 'string' ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/.test(domain)
  )
    throw new Error('BOSI_OSS_DOMAIN must be a lowercase hostname')
  return `https://${domain}/bosi`
}
function feedFor(tag, arch, base = `https://github.com/${repository}/releases/download`) {
  return {
    provider: 'generic',
    url: `${base}/${tag}/`,
    channel: channel(arch),
    useMultipleRangeRequest: false
  }
}
module.exports = { repository, metadataName, mirrorBase, feedFor }
