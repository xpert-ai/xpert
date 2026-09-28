function parseBusinessArea(value) {
  return typeof value?.id === 'string' && value.id.trim() && typeof value.name === 'string' && value.name.trim()
    ? { id: value.id.trim(), name: value.name.trim() }
    : null
}

module.exports = { parseBusinessArea }
