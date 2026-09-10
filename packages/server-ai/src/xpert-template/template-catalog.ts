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
            (!query.category || template.category === query.category) &&
            (!query.pluginName || template.pluginName === query.pluginName) &&
            (!search ||
                [template.title, template.name, template.description, template.pluginDisplayName].some((value) =>
                    value?.toLowerCase().includes(search)
                ))
    )
    return {
        items: matches.slice(offset, offset + limit).map((template) => {
            const { export_data, ...summary } = template
            // Old provider objects may retain the SDK input alias after normalization.
            if ('dslContent' in summary) delete summary.dslContent
            // Plugin-wide marketplace content can contain hundreds of sibling templates.
            delete summary.targetAppMeta
            return summary
        }),
        total: matches.length,
        offset,
        limit,
        categories: [...new Set(templates.map((template) => template.category).filter(Boolean))].sort()
    }
}
