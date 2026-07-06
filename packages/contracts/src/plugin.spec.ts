import {
  PluginMarketplaceItem,
  PluginMarketplaceRegistryItem,
  PluginMarketplaceRegistryItemInput,
  PluginMeta,
  XpertPluginBundleManifest
} from './plugin'

describe('plugin artifact namespace contracts', () => {
  it('accepts artifactNamespace on public plugin contracts', () => {
    const meta: PluginMeta = {
      name: '@xpert-ai/plugin-office-editor',
      version: '0.1.0',
      artifactNamespace: 'office_editor',
      category: 'tools',
      displayName: 'Office Editor',
      description: 'Office editor plugin',
      author: 'XpertAI'
    }
    const manifest: XpertPluginBundleManifest = {
      name: '@xpert-ai/plugin-office-editor',
      artifactNamespace: 'office_editor'
    }
    const registryInput: PluginMarketplaceRegistryItemInput = {
      packageName: '@xpert-ai/plugin-office-editor',
      artifactNamespace: 'office_editor'
    }
    const registryItem: PluginMarketplaceRegistryItem = {
      id: 'office-editor',
      packageName: '@xpert-ai/plugin-office-editor',
      artifactNamespace: 'office_editor',
      displayName: 'Office Editor',
      description: 'Office editor plugin',
      category: 'app',
      author: 'XpertAI',
      keywords: [],
      targetApps: ['xpert'],
      targetAppMeta: {},
      enabled: true,
      priority: 0,
      section: 'marketplace'
    }
    const marketplaceItem: PluginMarketplaceItem = {
      name: '@xpert-ai/plugin-office-editor',
      artifactNamespace: 'office_editor'
    }

    expect([
      meta.artifactNamespace,
      manifest.artifactNamespace,
      registryInput.artifactNamespace,
      registryItem.artifactNamespace,
      marketplaceItem.artifactNamespace
    ]).toEqual(['office_editor', 'office_editor', 'office_editor', 'office_editor', 'office_editor'])
  })
})
