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
      displayName: {
        en_US: 'Office Editor',
        zh_Hans: 'Office 编辑器'
      },
      description: {
        en_US: 'Office editor plugin',
        zh_Hans: 'Office 文档编辑插件'
      },
      author: 'XpertAI'
    }
    const manifest: XpertPluginBundleManifest = {
      name: '@xpert-ai/plugin-office-editor',
      artifactNamespace: 'office_editor'
    }
    const registryInput: PluginMarketplaceRegistryItemInput = {
      packageName: '@xpert-ai/plugin-office-editor',
      artifactNamespace: 'office_editor',
      displayName: {
        en_US: 'Office Editor',
        zh_Hans: 'Office 编辑器'
      }
    }
    const registryItem: PluginMarketplaceRegistryItem = {
      id: 'office-editor',
      packageName: '@xpert-ai/plugin-office-editor',
      artifactNamespace: 'office_editor',
      displayName: {
        en_US: 'Office Editor',
        zh_Hans: 'Office 编辑器'
      },
      description: {
        en_US: 'Office editor plugin',
        zh_Hans: 'Office 文档编辑插件'
      },
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
    expect(meta.displayName).toEqual({ en_US: 'Office Editor', zh_Hans: 'Office 编辑器' })
    expect(registryInput.displayName).toEqual({ en_US: 'Office Editor', zh_Hans: 'Office 编辑器' })
    expect(registryItem.description).toEqual({
      en_US: 'Office editor plugin',
      zh_Hans: 'Office 文档编辑插件'
    })
  })
})
