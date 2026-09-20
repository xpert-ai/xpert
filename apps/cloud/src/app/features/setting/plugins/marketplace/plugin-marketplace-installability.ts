import { PluginMarketplaceContribution } from '@xpert-ai/contracts'

const INSTALLABLE_MARKETPLACE_CONTENT_TYPES = new Set(['assistant-template', 'skill', 'hook'])

export function hasInstallableMarketplaceContribution(content: PluginMarketplaceContribution) {
  return INSTALLABLE_MARKETPLACE_CONTENT_TYPES.has(content.type)
}
