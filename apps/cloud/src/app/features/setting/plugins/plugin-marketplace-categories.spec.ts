import { PluginTargetAppMeta } from '@xpert-ai/contracts'
import {
  groupPluginsByMarketplaceCategory,
  LEGACY_DEVELOPER_TOOL_CATEGORIES,
  matchesPluginMarketplaceCategoryFilters,
  PluginMarketplaceCategorizedItem,
  resolvePluginMarketplaceGrouping
} from './plugin-marketplace-categories'

type TestPlugin = PluginMarketplaceCategorizedItem & {
  name: string
}

function targetAppMeta(
  marketplace: NonNullable<PluginTargetAppMeta['data-xpert']>['marketplace'],
  targetApp: 'xpert' | 'data-xpert' = 'data-xpert'
): PluginTargetAppMeta {
  const meta: PluginTargetAppMeta = {}
  meta[targetApp] = { marketplace }
  return meta
}

describe('plugin marketplace categories', () => {
  it('uses explicit marketplace category from data-xpert target app metadata', () => {
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

  it('falls back to xpert marketplace category for legacy metadata', () => {
    const grouping = resolvePluginMarketplaceGrouping({
      category: 'integration',
      targetAppMeta: targetAppMeta(
        {
          category: 'finance'
        },
        'xpert'
      )
    })

    expect(grouping).toEqual({
      category: 'finance',
      subcategory: undefined
    })
  })

  it('prefers data-xpert marketplace category over xpert metadata', () => {
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
      category: 'communication',
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

  it('filters Developer Tools subcategories without hiding other marketplace categories', () => {
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

    expect(groups.map((group) => group.value)).toEqual(['developer-tools', 'finance'])
    expect(groups.find((group) => group.value === 'developer-tools')?.plugins.map((plugin) => plugin.name)).toEqual([
      'database'
    ])
    expect(groups.find((group) => group.value === 'finance')?.plugins.map((plugin) => plugin.name)).toEqual(['finance'])
  })
})
