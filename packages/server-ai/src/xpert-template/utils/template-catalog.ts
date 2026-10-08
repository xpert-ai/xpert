import {
    LanguagesEnum,
    PluginMarketplaceContribution,
    PluginTemplateApplicationSummary,
    TXpertTemplate,
    XpertTemplatePluginDependencies,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import type { LoadedPluginRecord } from '@xpert-ai/server-core'
import * as path from 'node:path'
import { resolvePluginApplicationConfigAssets } from '../../plugin-resource/plugin-application-assets'
import { normalizePluginPackageName, TXpertTemplateDescriptor } from '../plugin-template-descriptor'
import { exportedXpertTemplateCategory, fallbackLanguage } from '../template.constants'
import type {
    TExportXpertTemplateInput,
    TTemplateMarketRef,
    TXpertTemplateQuery,
    TXpertTemplatesCatalog
} from '../template.types'
export function mergeTemplateDescriptorDependencies(
    descriptor: TXpertTemplateDescriptor | null | undefined,
    fallbackDescriptor: TXpertTemplateDescriptor | null | undefined
): TXpertTemplateDescriptor | null {
    if (!descriptor) {
        return fallbackDescriptor ?? null
    }

    if (hasTemplatePluginDependencies(descriptor.dependencies) || !fallbackDescriptor?.dependencies) {
        return descriptor
    }

    return {
        ...descriptor,
        dependencies: fallbackDescriptor.dependencies
    }
}

export function hasTemplatePluginDependencies(dependencies?: XpertTemplatePluginDependencies) {
    return !!dependencies?.plugins?.some((pluginName) => !!pluginName.trim())
}

export function findTemplateDescriptorById(
    templatesData: TXpertTemplatesCatalog,
    id: string,
    language: LanguagesEnum
): TXpertTemplateDescriptor | null {
    const checkedLanguages = new Set<string>()
    const languages = [language, fallbackLanguage, ...Object.keys(templatesData.templates ?? {}).sort()]

    for (const currentLanguage of languages) {
        if (checkedLanguages.has(currentLanguage)) {
            continue
        }

        checkedLanguages.add(currentLanguage)
        const details = templatesData.templates[currentLanguage]?.recommendedApps?.find(
            (template) => template.id === id
        )
        if (details) {
            return details
        }
    }

    return null
}

export function findPluginTemplateById(templates: TXpertTemplateDescriptor[], id: string) {
    const normalizedId = normalizePluginTemplateId(id)
    const exactMatch = templates.find(
        (template) =>
            template.id === id ||
            template.key === id ||
            normalizePluginTemplateId(template.id) === normalizedId ||
            normalizePluginTemplateId(template.key) === normalizedId
    )
    if (exactMatch) {
        return exactMatch
    }

    // Assistant instances created by older plugin versions only persisted the
    // template key (for example `bom-lifecycle-orchestrator`). Resolve that
    // legacy source only when the key is unique across installed plugins so a
    // bare id can never silently select the wrong plugin template.
    if (!normalizedId.includes(':')) {
        const keyMatches = templates.filter((template) => {
            const templateId = normalizePluginTemplateId(template.id)
            const templateKey = normalizePluginTemplateId(template.key)
            return templateId.endsWith(`:${normalizedId}`) || templateKey.endsWith(`:${normalizedId}`)
        })
        return keyMatches.length === 1 ? keyMatches[0] : null
    }

    return null
}

export function resolveRecommendedTemplates(
    refs: TTemplateMarketRef[],
    templatesData: TXpertTemplatesCatalog,
    builtinTemplatesData: TXpertTemplatesCatalog | null,
    pluginTemplates: TXpertTemplateDescriptor[],
    language: LanguagesEnum,
    query?: TXpertTemplateQuery
) {
    const recommendedApps: TXpertTemplateDescriptor[] = []

    for (const ref of refs) {
        const externalTemplate = findTemplateDescriptorById(templatesData, ref.id, language)
        const builtinTemplate = builtinTemplatesData
            ? findTemplateDescriptorById(builtinTemplatesData, ref.id, language)
            : null
        const template =
            findPluginTemplateById(pluginTemplates, ref.id) ??
            mergeTemplateDescriptorDependencies(externalTemplate, builtinTemplate)
        if (template && matchesTemplateQuery(template, query)) {
            recommendedApps.push(template)
        }
    }

    return recommendedApps
}

/**
 * Attaches an App only through an explicit template key declared by the
 * same loaded plugin. Names, descriptions, and marketplace ordering never
 * participate in the association, and ambiguous declarations fail closed.
 */
export function resolveTemplateApplication(
    plugin: LoadedPluginRecord,
    templateKey: string
): PluginTemplateApplicationSummary | null {
    const pluginName = normalizePluginPackageName(
        normalizeTemplateString(plugin.packageName ?? plugin.name ?? plugin.instance?.meta?.name) ?? ''
    )
    const targetAppMeta = plugin.instance?.meta?.targetAppMeta ?? {}
    const metadataEntries = Object.values(targetAppMeta) as Array<{
        marketplace?: { contents?: PluginMarketplaceContribution[] }
    }>
    const contributions = metadataEntries.flatMap((metadata) =>
        Array.isArray(metadata?.marketplace?.contents) ? metadata.marketplace.contents : []
    )
    const matches = contributions.filter(
        (item) =>
            item.type === 'app' && item.appConfig?.assistantTemplateKey?.trim() === templateKey && !!item.name?.trim()
    )
    const uniqueMatches = Array.from(new Map(matches.map((item) => [item.name, item])).values())
    if (uniqueMatches.length > 1) {
        throw new Error(`Plugin '${pluginName}' declares multiple Apps for Assistant template '${templateKey}'`)
    }
    const app = uniqueMatches[0]
    if (!app?.appConfig) {
        return null
    }
    const appConfig = resolvePluginApplicationConfigAssets(plugin, app.appConfig)
    return {
        id: `${pluginName}:${app.name}`,
        pluginName,
        appName: app.name,
        displayName: app.displayName ?? app.name,
        description: app.description,
        icon: app.icon ?? plugin.instance?.meta?.icon,
        color: app.color,
        scope: appConfig.scope,
        assistantTemplateKey: appConfig.assistantTemplateKey,
        config: appConfig
    }
}

export function normalizePluginTemplateId(id?: string) {
    const value = normalizeTemplateString(id)
    const separatorIndex = value?.indexOf(':') ?? -1
    if (!value || separatorIndex < 0) {
        return value
    }

    const pluginName = value.slice(0, separatorIndex)
    const templateKey = value.slice(separatorIndex + 1)
    return `${normalizePluginPackageName(pluginName)}:${templateKey}`
}

export function matchesTemplateQuery(template: TXpertTemplateDescriptor, query?: TXpertTemplateQuery) {
    const targetApp = normalizeTemplateString(query?.targetApp)
    if (targetApp) {
        const targetApps = template.targetApps ?? []
        if (!targetApps.includes(targetApp)) {
            return false
        }
    }

    const templateType = normalizeTemplateString(query?.templateType)
    if (targetApp && templateType) {
        const types = template.targetAppMeta?.[targetApp]?.types
        if (Array.isArray(types) && types.length && !types.includes(templateType)) {
            return false
        }
    }

    return true
}

export function getTemplateOrder(template: TXpertTemplateDescriptor) {
    return typeof template.order === 'number' && Number.isFinite(template.order)
        ? template.order
        : Number.MAX_SAFE_INTEGER
}

export function toXpertTemplate(template: TXpertTemplateDescriptor): TXpertTemplate {
    const name = template.name?.trim() || template.title?.trim() || template.id
    return {
        ...template,
        name,
        title: template.title?.trim() || name,
        description: template.description ?? '',
        category: template.category ?? '',
        copyright: template.copyright ?? '',
        privacyPolicy: template.privacyPolicy ?? undefined,
        export_data: template.export_data ?? '',
        avatar: template.avatar ?? {},
        type: template.type ?? XpertTypeEnum.Agent
    }
}

export function mergeTemplateCategories(categories: string[] = [], extraCategories: Array<string | undefined>) {
    return Array.from(
        new Set([
            ...(categories ?? []),
            ...extraCategories.filter((category): category is string => !!category?.trim())
        ])
    )
}

export function normalizeTemplateString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function createExportedXpertTemplateDescriptor(
    templateId: string,
    xpert: TExportXpertTemplateInput['xpert']
): TXpertTemplateDescriptor {
    return {
        id: templateId,
        name: xpert.name,
        type: xpert.type,
        title: xpert.title || xpert.name,
        description: xpert.description,
        avatar: xpert.avatar,
        category: exportedXpertTemplateCategory,
        copyright: null,
        privacyPolicy: null
    }
}

export function mergeTemplateCategory(categories: string[] | undefined, category: string) {
    const nextCategories = categories ?? []
    return nextCategories.includes(category) ? nextCategories : [...nextCategories, category]
}

export function getExportedXpertTemplateId(xpertId: string) {
    return `xpert-${xpertId}`
}

export function getExportedXpertTemplateFilePath(templateId: string) {
    return path.posix.join('templates', `${templateId}.yaml`)
}

export function getTemplateIdFromFilePath(filePath?: string | null) {
    if (!filePath?.trim()) {
        return null
    }

    const extension = path.extname(filePath)
    return path.basename(filePath, extension) || null
}
