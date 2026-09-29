const repository = 'xpert-ai/xpert'
const channel = (arch) => `desktop-${arch}`
function metadataName(platform, arch) {
  const suffix =
    platform === 'darwin' ? '-mac' : platform === 'linux' ? `-linux${arch === 'x64' ? '' : `-${arch}`}` : ''
  return `${channel(arch)}${suffix}.yml`
}
function feedFor(tag, arch) {
  return {
    provider: 'generic',
    url: `https://github.com/${repository}/releases/download/${tag}/`,
    channel: channel(arch),
    useMultipleRangeRequest: false
  }
}
module.exports = { repository, metadataName, feedFor }
