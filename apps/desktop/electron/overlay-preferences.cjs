const { island, dock, limits } = require('./overlay-defaults.json')

const flag = (v, fallback) => (typeof v === 'boolean' ? v : fallback)
const percent = (v, key) =>
  Number.isFinite(v) ? Math.max(limits[key][0], Math.min(limits[key][1], Math.round(v))) : 100

function islandPreferences(value) {
  return {
    enabled: flag(value?.enabled, island.enabled),
    idle: flag(value?.idle, island.idle),
    external: flag(value?.external, island.external),
    haptics: flag(value?.haptics, island.haptics),
    width: percent(value?.width, 'width'),
    height: percent(value?.height, 'height')
  }
}

function dockPreferences(value) {
  return {
    enabled: flag(value?.enabled, dock.enabled),
    autoHide: flag(value?.autoHide, dock.autoHide),
    edge: value?.edge === 'left' ? 'left' : 'right',
    strip: flag(value?.strip, dock.strip),
    results: flag(value?.results, dock.results),
    placement: value?.placement === 'window' ? 'window' : 'screen',
    display:
      ['primary', 'all'].includes(value?.display) ||
      (typeof value?.display === 'string' && /^-?\d+$/.test(value.display))
        ? value.display
        : 'window',
    size: percent(value?.size, 'size')
  }
}
module.exports = { islandPreferences, dockPreferences }
