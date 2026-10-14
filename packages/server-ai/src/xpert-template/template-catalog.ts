import { createHash } from 'node:crypto'
import { TXpertTemplate, TXpertTemplateCatalogPage, TXpertTemplateCatalogQuery } from '@xpert-ai/contracts'
import { XpertPlugin, XpertTemplateCatalogProvider } from '@xpert-ai/plugin-sdk'

export function isTemplateCatalogProvider(source: XpertPlugin['templates']): source is XpertTemplateCatalogProvider {
    return !!source && !Array.isArray(source) && 'kind' in source && source.kind === 'catalog'
}

/** Catalog responses never contain DSL, including legacy contributions with both content aliases. */
export function paginateTemplateCatalog(
    templates: TXpertTemplate[],
    query: TXpertTemplateCatalogQuery = {}
): TXpertTemplateCatalogPage {
    const offset = Number.isFinite(query.offset) ? Math.max(0, Math.trunc(query.offset)) : 0
    const limit = Number.isFinite(query.limit) ? Math.max(1, Math.min(500, Math.trunc(query.limit))) : 48
    const search = query.search?.trim().toLowerCase()
    const matches = templates.filter(
        (template) =>
            (!query.assistantsOnly || (!template.application && ['agent', 'copilot'].includes(template.type))) &&
            (!query.category || template.category === query.category) &&
            (!query.pluginName || template.pluginName === query.pluginName) &&
            (!search ||
                [template.title, template.name, template.description, template.pluginDisplayName].some((value) =>
                    value?.toLowerCase().includes(search)
                ))
    )
    return {
        items: matches
            .sort((left, right) => templateSourceRank(left.source) - templateSourceRank(right.source))
            .slice(offset, offset + limit)
            .map((template) => {
                return {
                    id: template.id,
                    key: template.key,
                    name: template.name,
                    title: template.title,
                    description: template.description,
                    category: template.category,
                    copyright: template.copyright,
                    avatar: catalogAvatar(template),
                    type: template.type,
                    source: template.source,
                    pluginName: template.pluginName,
                    pluginDisplayName: template.pluginDisplayName,
                    pluginVersion: template.pluginVersion,
                    contentHash: template.contentHash,
                    hasApplication: !!template.application,
                    availableLocales: template.availableLocales,
                    defaultLocale: template.defaultLocale,
                    locale: template.locale
                }
            }),
        total: matches.length,
        offset,
        limit,
        categories: [...new Set(templates.map((template) => template.category).filter(Boolean))].sort()
    }
}

/** Keep source groups together before pagination, preserving order within each source. */
export function templateSourceRank(source: TXpertTemplate['source']): number {
    switch (source) {
        case 'agent-plugin':
            return 0
        case 'plugin':
            return 1
        case 'builtin':
            return 2
        case undefined:
            return 2
        case 'shared':
            return 3
        default:
            return 4
    }
}

/** Inline assets stay behind the same authenticated, scope-aware catalog endpoint. */
export function catalogAvatar(template: TXpertTemplate) {
    const avatar = template.avatar
    return avatar?.url?.startsWith('data:image/')
        ? {
              ...avatar,
              url: `/api/xpert-template/catalog-avatar/${encodeURIComponent(template.id)}?v=${createHash('sha256').update(avatar.url).digest('hex')}`
          }
        : avatar
}
