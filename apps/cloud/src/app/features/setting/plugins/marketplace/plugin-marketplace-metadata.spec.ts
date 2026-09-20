import { IPluginDescriptor, PLUGIN_LEVEL } from '@cloud/app/@core/state'
import { PluginMarketplaceItem } from '@xpert-ai/contracts'
import { resolvePluginMarketplaceGrouping } from './plugin-marketplace-categories'
import {
  buildMarketplacePluginMetadataLookup,
  enrichInstalledPluginWithMarketplaceMetadata,
  mergeMarketplaceContributions
} from './plugin-marketplace-metadata'

function installedPlugin(
  overrides: Omit<Partial<IPluginDescriptor>, 'meta'> & { meta?: Partial<IPluginDescriptor['meta']> } = {}
): IPluginDescriptor {
  const { meta, ...rest } = overrides
  return {
    name: '@xpert-ai/plugin-finance',
    packageName: '@xpert-ai/plugin-finance',
    isGlobal: false,
    level: PLUGIN_LEVEL.ORGANIZATION,
    effectiveInCurrentScope: true,
    meta: {
      name: '@xpert-ai/plugin-finance',
      version: '1.0.0',
      category: 'integration',
      displayName: 'Finance plugin',
      description: 'Finance plugin',
      author: 'XpertAI',
      ...meta
    },
    ...rest
  }
}

describe('plugin marketplace metadata', () => {
  it('enriches installed plugin grouping from marketplace target app metadata', () => {
    const marketplaceItems: PluginMarketplaceItem[] = [
      {
        name: '@xpert-ai/plugin-finance',
        packageName: '@xpert-ai/plugin-finance',
        targetAppMeta: {
          xpert: {
            marketplace: {
              category: 'finance'
            }
          }
        }
      }
    ]

    const enriched = enrichInstalledPluginWithMarketplaceMetadata(
      installedPlugin(),
      buildMarketplacePluginMetadataLookup(marketplaceItems)
    )

    expect(
      resolvePluginMarketplaceGrouping({
        category: enriched.meta.category,
        targetAppMeta: enriched.meta.targetAppMeta
      })
    ).toEqual({
      category: 'finance',
      subcategory: undefined
    })
  })

  it('keeps explicit installed metadata ahead of marketplace fallback metadata', () => {
    const marketplaceItems: PluginMarketplaceItem[] = [
      {
        name: '@xpert-ai/plugin-finance',
        targetAppMeta: {
          xpert: {
            marketplace: {
              category: 'finance'
            }
          }
        }
      }
    ]

    const enriched = enrichInstalledPluginWithMarketplaceMetadata(
      installedPlugin({
        meta: {
          displayName: 'Communication plugin',
          description: 'Communication plugin',
          targetAppMeta: {
            xpert: {
              marketplace: {
                category: 'communication'
              }
            }
          }
        }
      }),
      buildMarketplacePluginMetadataLookup(marketplaceItems)
    )

    expect(
      resolvePluginMarketplaceGrouping({
        category: enriched.meta.category,
        targetAppMeta: enriched.meta.targetAppMeta
      })
    ).toEqual({
      category: 'communication',
      subcategory: undefined
    })
  })

  it('uses installed marketplace contents as the authoritative set', () => {
    const marketplaceItems: PluginMarketplaceItem[] = [
      {
        name: '@xpert-ai/plugin-finance',
        targetAppMeta: {
          xpert: {
            marketplace: {
              contents: [
                {
                  type: 'tool',
                  name: 'cut-ir-mcp',
                  displayName: 'Cut IR MCP Tools'
                },
                {
                  type: 'mcp',
                  name: 'cut',
                  displayName: 'Catalog Cut MCP',
                  icon: {
                    type: 'font',
                    value: 'ri-server-line'
                  }
                }
              ]
            }
          }
        }
      }
    ]

    const enriched = enrichInstalledPluginWithMarketplaceMetadata(
      installedPlugin({
        meta: {
          targetAppMeta: {
            xpert: {
              marketplace: {
                contents: [
                  {
                    type: 'mcp',
                    name: 'cut',
                    displayName: 'Cut MCP Capabilities'
                  }
                ]
              }
            }
          }
        }
      }),
      buildMarketplacePluginMetadataLookup(marketplaceItems)
    )

    expect(enriched.meta.targetAppMeta?.['xpert']?.marketplace?.contents).toEqual([
      {
        type: 'mcp',
        name: 'cut',
        displayName: 'Cut MCP Capabilities',
        icon: {
          type: 'font',
          value: 'ri-server-line'
        }
      }
    ])
  })

  it('dedupes assistant template contributions by their effective template id', () => {
    const contributions = mergeMarketplaceContributions(
      [
        {
          type: 'assistant-template',
          name: 'docx-editor-assistant',
          displayName: 'DOCX Editor Assistant Template'
        }
      ],
      [
        {
          type: 'assistant-template',
          name: 'docx-editor-assistant-template',
          displayName: 'DOCX Editor Assistant',
          metadata: {
            templateId: 'docx-editor-assistant'
          }
        }
      ]
    )

    expect(contributions).toHaveLength(1)
    expect(contributions[0]).toMatchObject({
      type: 'assistant-template',
      name: 'docx-editor-assistant-template',
      displayName: 'DOCX Editor Assistant'
    })
  })

  it('dedupes repeated target app content by type and name', () => {
    const contributions = mergeMarketplaceContributions(
      [
        {
          type: 'assistant-template',
          name: 'docx-editor-assistant',
          displayName: 'DOCX Editor Assistant Template'
        }
      ],
      [
        {
          type: 'assistant-template',
          name: 'docx-editor-assistant',
          displayName: 'DOCX Editor Assistant'
        }
      ]
    )

    expect(contributions).toEqual([
      {
        type: 'assistant-template',
        name: 'docx-editor-assistant',
        displayName: 'DOCX Editor Assistant'
      }
    ])
  })
})
