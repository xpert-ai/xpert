import { PluginMarketplaceCategory, PluginTargetAppMarketplaceMetadata, PluginTargetAppMeta } from '@xpert-ai/contracts'

/** Target-app key used by the Xpert plugin marketplace UI. */
export const PLUGIN_MARKETPLACE_TARGET_APP = 'xpert'

/** Target-app metadata lookup order; keep data-xpert as a legacy fallback while xpert is the primary app. */
export const PLUGIN_MARKETPLACE_TARGET_APPS = [PLUGIN_MARKETPLACE_TARGET_APP, 'data-xpert'] as const

/** Minimal shape required to classify a marketplace or installed plugin into a visible marketplace group. */
export type PluginMarketplaceCategorizedItem = {
  /** Legacy technical plugin category, such as tools, model, middleware, or integration. */
  category?: string | null
  /** App-specific marketplace metadata, preferred over the legacy technical category. */
  targetAppMeta?: PluginTargetAppMeta | null
}

/** UI definition for one top-level marketplace category tab and group heading. */
export type PluginMarketplaceCategoryDefinition = {
  value: PluginMarketplaceCategory
  labelKey: string
  defaultLabel: string
  descriptionKey: string
  defaultDescription: string
}

/** A visible marketplace category plus the plugins resolved into that category. */
export type PluginMarketplaceCategoryGroup<T> = PluginMarketplaceCategoryDefinition & {
  plugins: T[]
}

/** Option shown in the Developer Tools subcategory filter. */
export type PluginDeveloperToolSubcategoryOption = {
  value: string
  labelKey: string
  defaultLabel: string
}

/** Normalized marketplace grouping result used by filters, grouping, and subcategory pickers. */
export type PluginMarketplaceGrouping = {
  category: PluginMarketplaceCategory
  subcategory?: string
}

/** Normalized holder for app-specific marketplace metadata entries. */
type PluginMarketplaceMetadataEntry = {
  marketplace: PluginTargetAppMarketplaceMetadata
}

/** Ordered list of marketplace groups; this order controls both tabs and rendered category sections. */
export const PLUGIN_MARKETPLACE_CATEGORY_DEFINITIONS: readonly PluginMarketplaceCategoryDefinition[] = [
  {
    value: 'featured',
    labelKey: 'PAC.Plugin.MarketplaceCategory_featured',
    defaultLabel: 'Featured',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_featured',
    defaultDescription: 'Classic and commonly used plugins.'
  },
  {
    value: 'business-operations',
    labelKey: 'PAC.Plugin.MarketplaceCategory_business-operations',
    defaultLabel: 'Business & Operations',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_business-operations',
    defaultDescription: 'B2B and operational business workflows.'
  },
  {
    value: 'communication',
    labelKey: 'PAC.Plugin.MarketplaceCategory_communication',
    defaultLabel: 'Communication',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_communication',
    defaultDescription: 'Meeting, messaging, and collaboration plugins.'
  },
  {
    value: 'creativity',
    labelKey: 'PAC.Plugin.MarketplaceCategory_creativity',
    defaultLabel: 'Creativity',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_creativity',
    defaultDescription: 'Video, page, and design creation.'
  },
  {
    value: 'data-analytics',
    labelKey: 'PAC.Plugin.MarketplaceCategory_data-analytics',
    defaultLabel: 'Data & Analytics',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_data-analytics',
    defaultDescription: 'Data analysis and reporting tools.'
  },
  {
    value: 'developer-tools',
    labelKey: 'PAC.Plugin.MarketplaceCategory_developer-tools',
    defaultLabel: 'Developer Tools',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_developer-tools',
    defaultDescription: 'Development, integration, database, middleware, and model tools.'
  },
  {
    value: 'education-research',
    labelKey: 'PAC.Plugin.MarketplaceCategory_education-research',
    defaultLabel: 'Education & Research',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_education-research',
    defaultDescription: 'Research, business intelligence, and scientific information tools.'
  },
  {
    value: 'finance',
    labelKey: 'PAC.Plugin.MarketplaceCategory_finance',
    defaultLabel: 'Finance',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_finance',
    defaultDescription: 'Financial research and analysis platforms.'
  },
  {
    value: 'productivity',
    labelKey: 'PAC.Plugin.MarketplaceCategory_productivity',
    defaultLabel: 'Productivity',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_productivity',
    defaultDescription: 'Work efficiency and automation plugins.'
  },
  {
    value: 'research',
    labelKey: 'PAC.Plugin.MarketplaceCategory_research',
    defaultLabel: 'Research',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_research',
    defaultDescription: 'Research efficiency plugins.'
  },
  {
    value: 'security',
    labelKey: 'PAC.Plugin.MarketplaceCategory_security',
    defaultLabel: 'Security',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_security',
    defaultDescription: 'Security and protection plugins.'
  },
  {
    value: 'travel',
    labelKey: 'PAC.Plugin.MarketplaceCategory_travel',
    defaultLabel: 'Travel',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_travel',
    defaultDescription: 'Travel planning and assistance plugins.'
  },
  {
    value: 'sales',
    labelKey: 'PAC.Plugin.MarketplaceCategory_sales',
    defaultLabel: 'Sales',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_sales',
    defaultDescription: 'Sales and revenue workflow plugins.'
  },
  {
    value: 'other',
    labelKey: 'PAC.Plugin.MarketplaceCategory_other',
    defaultLabel: 'Other',
    descriptionKey: 'PAC.Plugin.MarketplaceCategoryDescription_other',
    defaultDescription: 'Other plugins.'
  }
]

/**
 * Legacy plugin meta.category values describe technical plugin type.
 * The marketplace maps them under Developer Tools unless explicit app marketplace metadata overrides them.
 */
export const LEGACY_DEVELOPER_TOOL_CATEGORIES = [
  'set',
  'doc-source',
  'agent',
  'tools',
  'model',
  'vlm',
  'vector-store',
  'integration',
  'datasource',
  'database',
  'middleware'
] as const

const LEGACY_DEVELOPER_TOOL_CATEGORY_SET = new Set<string>(LEGACY_DEVELOPER_TOOL_CATEGORIES)

/** Stable display order for legacy technical categories inside the Developer Tools group. */
export const DEVELOPER_TOOL_SUBCATEGORY_DEFINITIONS: readonly PluginDeveloperToolSubcategoryOption[] = [
  { value: 'middleware', labelKey: 'PAC.Plugin.Category_middleware', defaultLabel: 'Middleware' },
  { value: 'integration', labelKey: 'PAC.Plugin.Category_integration', defaultLabel: 'System Integration' },
  { value: 'database', labelKey: 'PAC.Plugin.Category_database', defaultLabel: 'Database' },
  { value: 'tools', labelKey: 'PAC.Plugin.Category_tools', defaultLabel: 'Developer Tools' },
  { value: 'model', labelKey: 'PAC.Plugin.Category_model', defaultLabel: 'Language Models' },
  { value: 'vlm', labelKey: 'PAC.Plugin.Category_vlm', defaultLabel: 'Vision Models' },
  { value: 'vector-store', labelKey: 'PAC.Plugin.Category_vector-store', defaultLabel: 'Vector Stores' },
  { value: 'doc-source', labelKey: 'PAC.Plugin.Category_doc-source', defaultLabel: 'Document Sources' },
  { value: 'datasource', labelKey: 'PAC.Plugin.Category_datasource', defaultLabel: 'Data Sources' },
  { value: 'agent', labelKey: 'PAC.Plugin.Category_agent', defaultLabel: 'Agent' },
  { value: 'set', labelKey: 'PAC.Plugin.Category_set', defaultLabel: 'Bundle' }
]

/**
 * Accepted marketplace category aliases.
 * Keep aliases narrow and explicit so old registry values can be migrated without guessing from display text.
 */
const CATEGORY_ALIASES: ReadonlyArray<readonly [PluginMarketplaceCategory, readonly string[]]> = [
  ['featured', ['featured']],
  ['business-operations', ['business-operations', 'business-and-operations']],
  ['communication', ['communication']],
  ['creativity', ['creativity', 'design', 'creative-design']],
  ['data-analytics', ['data-analytics', 'data-and-analytics']],
  ['developer-tools', ['developer-tools']],
  ['education-research', ['education-research', 'education-and-research']],
  ['finance', ['finance']],
  ['productivity', ['productivity']],
  ['research', ['research']],
  ['security', ['security']],
  ['travel', ['travel']],
  ['sales', ['sales']],
  ['other', ['other']]
]

export function groupPluginsByMarketplaceCategory<T extends PluginMarketplaceCategorizedItem>(
  plugins: readonly T[]
): PluginMarketplaceCategoryGroup<T>[] {
  const grouped = new Map<PluginMarketplaceCategory, T[]>()

  plugins.forEach((plugin) => {
    const grouping = resolvePluginMarketplaceGrouping(plugin)
    const items = grouped.get(grouping.category) ?? []
    items.push(plugin)
    grouped.set(grouping.category, items)
  })

  return PLUGIN_MARKETPLACE_CATEGORY_DEFINITIONS.map((definition) => ({
    ...definition,
    plugins: grouped.get(definition.value) ?? []
  })).filter((group) => group.plugins.length > 0)
}

/** Builds select/tab options from the canonical marketplace category definitions. */
export function marketplaceCategoryOptions() {
  return PLUGIN_MARKETPLACE_CATEGORY_DEFINITIONS.map((definition) => ({
    labelKey: definition.labelKey,
    defaultLabel: definition.defaultLabel,
    value: definition.value
  }))
}

/** Returns only Developer Tools subcategories that are present in the current plugin list. */
export function developerToolSubcategoryOptionsFor(
  plugins: readonly PluginMarketplaceCategorizedItem[]
): PluginDeveloperToolSubcategoryOption[] {
  const available = new Set<string>()
  plugins.forEach((plugin) => {
    const grouping = resolvePluginMarketplaceGrouping(plugin)
    if (grouping.category === 'developer-tools' && grouping.subcategory) {
      available.add(grouping.subcategory)
    }
  })

  return DEVELOPER_TOOL_SUBCATEGORY_DEFINITIONS.filter((option) => available.has(option.value))
}

/** Applies top-level marketplace category filters plus optional Developer Tools subcategory filters. */
export function matchesPluginMarketplaceCategoryFilters(
  plugin: PluginMarketplaceCategorizedItem,
  selectedCategories: readonly PluginMarketplaceCategory[],
  selectedDeveloperToolSubcategories: readonly string[]
) {
  const grouping = resolvePluginMarketplaceGrouping(plugin)

  if (selectedCategories.length > 0 && !selectedCategories.includes(grouping.category)) {
    return false
  }

  if (grouping.category === 'developer-tools' && selectedDeveloperToolSubcategories.length > 0) {
    return !!grouping.subcategory && selectedDeveloperToolSubcategories.includes(grouping.subcategory)
  }

  return true
}

/**
 * Resolves the visible marketplace grouping for one plugin.
 * App marketplace metadata wins; featured is next; legacy technical category falls back to Developer Tools.
 */
export function resolvePluginMarketplaceGrouping(plugin: PluginMarketplaceCategorizedItem): PluginMarketplaceGrouping {
  const marketplaceEntries = getPluginMarketplaceMetadataEntries(plugin.targetAppMeta)
  const explicitEntry = findExplicitMarketplaceCategoryEntry(marketplaceEntries)

  if (explicitEntry) {
    return {
      category: explicitEntry.category,
      subcategory:
        explicitEntry.subcategory ??
        (explicitEntry.category === 'developer-tools'
          ? (normalizeLegacyDeveloperToolCategory(plugin.category) ?? undefined)
          : undefined)
    }
  }

  const featuredEntry = marketplaceEntries.find((entry) => entry.marketplace.featured === true)
  if (featuredEntry) {
    return {
      category: 'featured',
      subcategory: normalizeDeveloperToolSubcategory(featuredEntry.marketplace.subcategory) ?? undefined
    }
  }

  const marketplaceSubcategory = findDeveloperToolSubcategory(marketplaceEntries)
  const legacyDeveloperToolCategory = normalizeLegacyDeveloperToolCategory(plugin.category)
  if (legacyDeveloperToolCategory) {
    return {
      category: 'developer-tools',
      subcategory: marketplaceSubcategory ?? legacyDeveloperToolCategory
    }
  }

  return {
    category: 'other',
    subcategory: marketplaceSubcategory ?? undefined
  }
}

/** Normalizes external category strings into the contract-defined marketplace category union. */
export function normalizePluginMarketplaceCategory(value: unknown): PluginMarketplaceCategory | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = normalizeCategoryToken(value)
  for (const [category, aliases] of CATEGORY_ALIASES) {
    if (aliases.includes(normalized)) {
      return category
    }
  }

  return null
}

/** Converts a legacy technical plugin category into a Developer Tools subcategory when recognized. */
function normalizeLegacyDeveloperToolCategory(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = normalizeCategoryToken(value)
  return LEGACY_DEVELOPER_TOOL_CATEGORY_SET.has(normalized) ? normalized : null
}

/** Converts marketplace subcategory metadata into a recognized Developer Tools subcategory. */
function normalizeDeveloperToolSubcategory(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = normalizeCategoryToken(value)
  return LEGACY_DEVELOPER_TOOL_CATEGORY_SET.has(normalized) ? normalized : null
}

/** Collects marketplace metadata entries in target-app priority order. */
function getPluginMarketplaceMetadataEntries(
  targetAppMeta?: PluginTargetAppMeta | null
): PluginMarketplaceMetadataEntry[] {
  const entries: PluginMarketplaceMetadataEntry[] = []
  for (const targetApp of PLUGIN_MARKETPLACE_TARGET_APPS) {
    const marketplace = targetAppMeta?.[targetApp]?.marketplace
    if (marketplace) {
      entries.push({ marketplace })
    }
  }
  return entries
}

/** Finds the first explicit marketplace category declared by target-app metadata. */
function findExplicitMarketplaceCategoryEntry(entries: readonly PluginMarketplaceMetadataEntry[]) {
  for (const entry of entries) {
    const category = normalizePluginMarketplaceCategory(entry.marketplace.category)
    if (category) {
      return {
        category,
        subcategory: normalizeDeveloperToolSubcategory(entry.marketplace.subcategory) ?? undefined
      }
    }
  }
  return null
}

/** Finds the first valid Developer Tools subcategory declared by target-app marketplace metadata. */
function findDeveloperToolSubcategory(entries: readonly PluginMarketplaceMetadataEntry[]) {
  for (const entry of entries) {
    const subcategory = normalizeDeveloperToolSubcategory(entry.marketplace.subcategory)
    if (subcategory) {
      return subcategory
    }
  }
  return null
}

/** Makes category matching tolerant of case, underscores, spaces, and ampersands. */
function normalizeCategoryToken(value: string) {
  return value.trim().toLowerCase().replace(/&/g, 'and').replace(/_/g, '-').replace(/\s+/g, '-')
}
