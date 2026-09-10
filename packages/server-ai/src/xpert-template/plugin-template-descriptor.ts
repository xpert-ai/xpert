import {
    LanguagesEnum,
    PluginTargetAppMeta,
    PluginTemplateApplicationSummary,
    resolveI18nText,
    TAvatar,
    TPromptWorkflow,
    TXpertTemplate,
    XpertTemplatePluginDependencies,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import { LoadedPluginRecord } from '@xpert-ai/server-core'
import { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { readXpertTemplateDslMetadata } from './xpert-template-dsl-metadata'

export type TXpertTemplateDescriptor = {
    id: string
    key?: string
    name?: string
    type?: XpertTypeEnum | 'project'
    title?: string
    description?: string
    avatar?: TAvatar
    copilotModel?: TXpertTemplate['copilotModel']
    category?: string
    copyright?: string | null
    privacyPolicy?: string | null
    export_data?: string
    targetApps?: string[]
    targetAppMeta?: PluginTargetAppMeta | null
    source?: string
    pluginName?: string
    pluginDisplayName?: string
    order?: number
    default?: boolean
    startPrompts?: string[]
    promptWorkflows?: TPromptWorkflow[]
    releaseNotes?: string
    availableLocales?: string[]
    defaultLocale?: string
    locale?: string
    pluginVersion?: string
    contentHash?: string
    xpertName?: string
    dependencies?: XpertTemplatePluginDependencies
    application?: PluginTemplateApplicationSummary
}

export function normalizePluginPackageName(pluginName: string): string {
    const lastAt = pluginName.lastIndexOf('@')
    return lastAt > 0 ? pluginName.slice(0, lastAt) : pluginName
}

function normalizeTemplateString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Maps eager DSL and lazy catalog metadata through the same identity and localization rules. */
export function describePluginTemplate(
    plugin: LoadedPluginRecord,
    contribution: XpertTemplateContribution,
    language: LanguagesEnum,
    summaryOnly = false,
    application?: PluginTemplateApplicationSummary | null
): TXpertTemplateDescriptor {
    const key = normalizeTemplateString(contribution?.key ?? contribution?.id)
    const exportData = normalizeTemplateString(contribution?.export_data ?? contribution?.dslContent)
    if (!key || (!summaryOnly && !exportData)) {
        throw new Error(`Plugin template is missing key or DSL content`)
    }

    const pluginName = normalizePluginPackageName(
        normalizeTemplateString(plugin.packageName ?? plugin.name ?? plugin.instance?.meta?.name) ?? ''
    )
    const namespacedId = `${pluginName}:${key}`
    const targetApps = contribution.targetApps ?? plugin.instance?.meta?.targetApps
    const targetAppMeta = contribution.targetAppMeta ?? plugin.instance?.meta?.targetAppMeta ?? null
    const dslMetadata = exportData && !summaryOnly ? readXpertTemplateDslMetadata(exportData, language) : {}

    return {
        ...contribution,
        id: namespacedId,
        key: namespacedId,
        name: normalizeTemplateString(contribution.name) ?? key,
        title: resolveI18nText(contribution.title ?? contribution.name, language) ?? dslMetadata.title ?? key,
        description: dslMetadata.description ?? resolveI18nText(contribution.description, language) ?? '',
        category: normalizeTemplateString(contribution.category) ?? 'Plugin',
        copyright: contribution.copyright ?? null,
        privacyPolicy: contribution.privacyPolicy ?? null,
        export_data: summaryOnly ? undefined : exportData,
        ...(summaryOnly ? { dslContent: undefined } : {}),
        targetApps,
        targetAppMeta,
        source: 'plugin',
        pluginName,
        pluginDisplayName: resolveI18nText(plugin.instance?.meta?.displayName, language) ?? pluginName,
        dependencies: contribution.dependencies,
        ...(application ? { application } : {}),
        avatar: contribution.avatar ?? dslMetadata.avatar,
        order: typeof contribution.order === 'number' ? contribution.order : Number.MAX_SAFE_INTEGER
    }
}
