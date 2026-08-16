import { IXpert, TXpertOptions, TXpertTemplateSource } from '@xpert-ai/contracts'
import { normalizePluginName } from '@xpert-ai/server-core'

type XpertTemplateSourceCarrier = Pick<IXpert, 'options' | 'draft'>
type XpertTemplateSourceDescriptor = {
    id: string
    key?: string
    pluginName?: string
    pluginDisplayName?: string
    source?: string
    releaseNotes?: string
}

export function resolveXpertTemplateSource(xpert: XpertTemplateSourceCarrier): TXpertTemplateSource | null {
    return resolveTemplateSourceFromOptions(xpert.draft?.team?.options, xpert.options)
}

export function resolveTemplateSourceFromOptions(
    ...optionsList: Array<TXpertOptions | null | undefined>
): TXpertTemplateSource | null {
    for (const options of optionsList) {
        const tracked = normalizeTrackedTemplateSource(options?.templateSource)
        if (tracked) {
            return tracked
        }
    }

    for (const options of optionsList) {
        const bootstrapKey = readString(options?.bootstrap?.templateKey)
        if (bootstrapKey) {
            return createLegacyTemplateSource(bootstrapKey)
        }

        const templateKey = readString(options?.dataXpert?.templateKey) || readString(options?.templateKey)
        if (!templateKey) {
            continue
        }

        const pluginName = normalizePluginName(
            readString(options?.dataXpert?.requiredPlugin) ||
                (options?.dataXpert?.requiredPlugins ?? []).map(readString).find(Boolean) ||
                ''
        )
        return createLegacyTemplateSource(templateKey, pluginName)
    }

    return null
}

export function createXpertTemplateSource(
    template: XpertTemplateSourceDescriptor,
    previous?: TXpertTemplateSource | null
): TXpertTemplateSource {
    const templateId = readString(template.id)
    const pluginName = normalizePluginName(readString(template.pluginName) || readPluginName(templateId))
    const templateKey = readTemplateKey(templateId, template.key)
    const now = new Date().toISOString()

    return {
        templateId,
        templateKey,
        ...(pluginName ? { pluginName } : {}),
        ...(readString(template.pluginDisplayName)
            ? { pluginDisplayName: readString(template.pluginDisplayName) }
            : {}),
        ...(readString(template.source) ? { source: template.source } : {}),
        installedAt: previous?.installedAt ?? now,
        lastSyncedAt: now,
        ...(readString(template.releaseNotes) ? { releaseNotes: readString(template.releaseNotes) } : {})
    }
}

export function createTemplateSourceFromIds(templateId?: string, sourceTemplateId?: string) {
    const canonicalId = readString(sourceTemplateId) || readString(templateId)
    if (!canonicalId) {
        return null
    }

    const pluginName = normalizePluginName(readPluginName(canonicalId))
    const now = new Date().toISOString()
    return {
        templateId: canonicalId,
        templateKey: readTemplateKey(canonicalId, templateId),
        ...(pluginName ? { pluginName, source: 'plugin' as const } : { source: 'builtin' as const }),
        installedAt: now,
        lastSyncedAt: now
    } satisfies TXpertTemplateSource
}

function normalizeTrackedTemplateSource(value?: TXpertTemplateSource | null): TXpertTemplateSource | null {
    const templateId = readString(value?.templateId)
    if (!templateId) {
        return null
    }

    const pluginName = normalizePluginName(readString(value?.pluginName) || readPluginName(templateId))
    return {
        ...value,
        templateId,
        templateKey: readString(value?.templateKey) || readTemplateKey(templateId),
        ...(pluginName ? { pluginName } : {})
    }
}

function createLegacyTemplateSource(templateKey: string, pluginName = ''): TXpertTemplateSource {
    const normalizedPluginName = normalizePluginName(pluginName)
    return {
        templateId: normalizedPluginName ? `${normalizedPluginName}:${templateKey}` : templateKey,
        templateKey,
        ...(normalizedPluginName
            ? { pluginName: normalizedPluginName, source: 'plugin' as const }
            : { source: 'builtin' as const })
    }
}

function readTemplateKey(templateId: string, candidate?: string) {
    const normalizedCandidate = readString(candidate)
    if (normalizedCandidate && !normalizedCandidate.includes(':')) {
        return normalizedCandidate
    }

    const separatorIndex = templateId.indexOf(':')
    return separatorIndex >= 0 ? templateId.slice(separatorIndex + 1) : normalizedCandidate || templateId
}

function readPluginName(templateId: string) {
    const separatorIndex = templateId.indexOf(':')
    return separatorIndex >= 0 ? templateId.slice(0, separatorIndex) : ''
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}
