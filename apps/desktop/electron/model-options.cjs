const { localizedText } = require('./i18n/index.mjs')
const { parseAvatarUrl } = require('./avatar-url.cjs')

// IPC exposes display metadata only. Selection IDs stay opaque; model bindings and credentials stay in the host.
function modelOptions(value, locale, ClientError) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new ClientError('Invalid installation check response.', 502)
  return value.map((item) => {
    if (typeof item?.id !== 'string' || !item.id.trim())
      throw new ClientError('Invalid installation check response.', 502)
    const model = typeof item.model === 'string' ? item.model : item.copilotModel?.model
    const provider = item.provider
    const iconUrl = parseAvatarUrl(provider?.iconUrl)
    return {
      id: item.id,
      label: localizedText(item.label, locale) || (typeof model === 'string' ? model : ''),
      ...(typeof model === 'string' ? { model } : {}),
      ...(typeof provider?.id === 'string' && provider.id
        ? {
            provider: {
              id: provider.id,
              label: localizedText(provider.label, locale) || provider.id,
              ...(iconUrl ? { iconUrl } : {})
            }
          }
        : {}),
      ...(typeof item.connectionName === 'string' ? { connectionName: item.connectionName } : {}),
      ...(Array.isArray(item.features) && item.features.every((feature) => typeof feature === 'string')
        ? { features: [...item.features] }
        : {}),
      ...(typeof item.contextWindow === 'number' && Number.isFinite(item.contextWindow) && item.contextWindow >= 1
        ? { contextWindow: Math.floor(item.contextWindow) }
        : {})
    }
  })
}

module.exports = { modelOptions }
