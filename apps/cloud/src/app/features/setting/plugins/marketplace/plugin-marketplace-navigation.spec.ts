import {
  pluginMarketplaceDetailCommands,
  pluginMarketplaceRouteParts,
  pluginNameFromMarketplaceRoute
} from './plugin-marketplace-navigation'

describe('plugin marketplace navigation', () => {
  it('maps scoped npm package names to readable route segments', () => {
    expect(pluginMarketplaceRouteParts('@xpert-ai/plugin-canvas')).toEqual(['xpert-ai', 'plugin-canvas'])
    expect(pluginMarketplaceDetailCommands('@xpert-ai/plugin-canvas')).toEqual([
      '/plugins/marketplace',
      'xpert-ai',
      'plugin-canvas'
    ])
    expect(pluginNameFromMarketplaceRoute('xpert-ai', 'plugin-canvas')).toBe('@xpert-ai/plugin-canvas')
  })

  it('maps unscoped package names to a single route segment', () => {
    expect(pluginMarketplaceRouteParts('e2b')).toEqual(['e2b'])
    expect(pluginMarketplaceDetailCommands('e2b', '/plugins')).toEqual(['/plugins/marketplace', 'e2b'])
    expect(pluginNameFromMarketplaceRoute(null, 'e2b')).toBe('e2b')
  })
})
