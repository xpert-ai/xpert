import {
  PLUGIN_MARKETPLACE_CATEGORIES,
  PLUGIN_MARKETPLACE_SUBCATEGORIES,
  PluginTargetAppMeta
} from '@xpert-ai/contracts'
import {
  groupPluginsByMarketplaceCategory,
  LEGACY_DEVELOPER_TOOL_CATEGORIES,
  marketplaceSubcategoryOptionsFor,
  matchesPluginMarketplaceCategoryFilters,
  normalizePluginMarketplaceCategory,
  PLUGIN_MARKETPLACE_CATEGORY_DEFINITIONS,
  PLUGIN_MARKETPLACE_SUBCATEGORY_DEFINITIONS,
  PluginMarketplaceCategorizedItem,
  resolvePluginMarketplaceGrouping
} from './plugin-marketplace-categories'

type TestPlugin = PluginMarketplaceCategorizedItem & {
  name: string
}

function targetAppMeta(
  marketplace: NonNullable<PluginTargetAppMeta['xpert']>['marketplace'],
  targetApp: 'xpert' | 'data-xpert' = 'xpert'
): PluginTargetAppMeta {
  const meta: PluginTargetAppMeta = {}
  meta[targetApp] = { marketplace }
  return meta
}

describe('plugin marketplace categories', () => {
  it('keeps visible category tabs aligned with the shared marketplace taxonomy', () => {
    expect(PLUGIN_MARKETPLACE_CATEGORY_DEFINITIONS.map(({ value }) => value)).toEqual(PLUGIN_MARKETPLACE_CATEGORIES)
  })

  it('keeps technical subcategory options aligned with the shared marketplace taxonomy', () => {
    expect(PLUGIN_MARKETPLACE_SUBCATEGORY_DEFINITIONS.map(({ value }) => value)).toEqual(
      PLUGIN_MARKETPLACE_SUBCATEGORIES
    )
  })

  it('uses explicit marketplace category from xpert target app metadata', () => {
    const grouping = resolvePluginMarketplaceGrouping({
      category: 'integration',
      targetAppMeta: targetAppMeta({
        category: 'finance'
      })
    })

    expect(grouping).toEqual({
      category: 'finance',
      subcategory: undefined
    })
  })

  it('falls back to data-xpert marketplace category for legacy metadata', () => {
    const grouping = resolvePluginMarketplaceGrouping({
      category: 'integration',
      targetAppMeta: targetAppMeta(
        {
          category: 'finance'
        },
        'data-xpert'
      )
    })

    expect(grouping).toEqual({
      category: 'finance',
      subcategory: undefined
    })
  })

  it('prefers xpert marketplace category over data-xpert metadata', () => {
    const grouping = resolvePluginMarketplaceGrouping({
      category: 'integration',
      targetAppMeta: {
        'data-xpert': {
          marketplace: {
            category: 'communication'
          }
        },
        xpert: {
          marketplace: {
            category: 'finance'
          }
        }
      }
    })

    expect(grouping).toEqual({
      category: 'finance',
      subcategory: undefined
    })
  })

  it('maps every legacy technical category into Developer Tools subcategories', () => {
    LEGACY_DEVELOPER_TOOL_CATEGORIES.forEach((category) => {
      expect(resolvePluginMarketplaceGrouping({ category })).toEqual({
        category: 'developer-tools',
        subcategory: category
      })
    })
  })

  it('falls back to Other for missing or unknown categories', () => {
    expect(resolvePluginMarketplaceGrouping({})).toEqual({
      category: 'other',
      subcategory: undefined
    })
    expect(resolvePluginMarketplaceGrouping({ category: 'unknown-category' })).toEqual({
      category: 'other',
      subcategory: undefined
    })
  })

  it('treats marketplace featured metadata as Featured when no explicit category exists', () => {
    expect(
      resolvePluginMarketplaceGrouping({
        category: 'integration',
        targetAppMeta: targetAppMeta({
          featured: true
        })
      })
    ).toEqual({
      category: 'featured',
      subcategory: undefined
    })
  })

  it('matches explicit communication metadata instead of legacy integration fallback', () => {
    const plugin = {
      category: 'integration',
      targetAppMeta: targetAppMeta({
        category: 'communication'
      })
    }

    expect(matchesPluginMarketplaceCategoryFilters(plugin, ['communication'], [])).toBe(true)
    expect(matchesPluginMarketplaceCategoryFilters(plugin, ['developer-tools'], [])).toBe(false)
  })

  it('normalizes legacy design marketplace category to Creativity', () => {
    expect(normalizePluginMarketplaceCategory('design')).toBe('creativity')
    expect(normalizePluginMarketplaceCategory('creative design')).toBe('creativity')
  })

  it('groups filtered plugins by visible marketplace category', () => {
    const plugins: TestPlugin[] = [
      {
        name: 'finance',
        category: 'integration',
        targetAppMeta: targetAppMeta({ category: 'finance' })
      },
      {
        name: 'database',
        category: 'database'
      },
      {
        name: 'middleware',
        category: 'middleware'
      },
      {
        name: 'communication',
        category: 'integration',
        targetAppMeta: targetAppMeta({ category: 'communication' })
      }
    ]

    const filtered = plugins.filter((plugin) =>
      matchesPluginMarketplaceCategoryFilters(plugin, ['developer-tools'], ['database'])
    )
    const groups = groupPluginsByMarketplaceCategory(filtered)

    expect(groups.map((group) => group.value)).toEqual(['developer-tools'])
    expect(groups[0].plugins.map((plugin) => plugin.name)).toEqual(['database'])
  })

  it('filters plugins by technical subcategory across marketplace categories', () => {
    const plugins: TestPlugin[] = [
      {
        name: 'finance',
        category: 'integration',
        targetAppMeta: targetAppMeta({ category: 'finance' })
      },
      {
        name: 'database',
        category: 'database'
      },
      {
        name: 'middleware',
        category: 'middleware'
      }
    ]

    const filtered = plugins.filter((plugin) => matchesPluginMarketplaceCategoryFilters(plugin, [], ['database']))
    const groups = groupPluginsByMarketplaceCategory(filtered)

    expect(groups.map((group) => group.value)).toEqual(['developer-tools'])
    expect(groups[0].plugins.map((plugin) => plugin.name)).toEqual(['database'])
  })

  it('keeps connector subcategory under a business category', () => {
    const grouping = resolvePluginMarketplaceGrouping({
      category: 'middleware',
      targetAppMeta: targetAppMeta({
        category: 'communication',
        subcategory: 'connector'
      })
    })

    expect(grouping).toEqual({
      category: 'communication',
      subcategory: 'connector'
    })
  })

  it('matches connector subcategory filters across business categories', () => {
    const plugins: TestPlugin[] = [
      {
        name: 'dingtalk-connector',
        category: 'middleware',
        targetAppMeta: targetAppMeta({ category: 'communication', subcategory: 'connector' })
      },
      {
        name: 'github-connector',
        category: 'middleware',
        targetAppMeta: targetAppMeta({ category: 'developer-tools', subcategory: 'connector' })
      },
      {
        name: 'wecom-app',
        category: 'middleware',
        targetAppMeta: targetAppMeta({ category: 'communication', subcategory: 'middleware' })
      }
    ]

    const filtered = plugins.filter((plugin) => matchesPluginMarketplaceCategoryFilters(plugin, [], ['connector']))
    const groups = groupPluginsByMarketplaceCategory(filtered)

    expect(groups.map((group) => group.value)).toEqual(['communication', 'developer-tools'])
    expect(groups.find((group) => group.value === 'communication')?.plugins.map((plugin) => plugin.name)).toEqual([
      'dingtalk-connector'
    ])
    expect(groups.find((group) => group.value === 'developer-tools')?.plugins.map((plugin) => plugin.name)).toEqual([
      'github-connector'
    ])
  })

  it('exposes connector in the technical subcategory options', () => {
    const options = marketplaceSubcategoryOptionsFor([
      {
        name: 'dingtalk-connector',
        category: 'middleware',
        targetAppMeta: targetAppMeta({ category: 'communication', subcategory: 'connector' })
      },
      {
        name: 'database',
        category: 'database'
      }
    ])

    expect(options.map((option) => option.value)).toEqual(['connector', 'database'])
  })
})
