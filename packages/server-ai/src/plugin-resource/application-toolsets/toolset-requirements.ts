import type { PluginTemplateApplicationSummary, TXpertTemplate } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { t } from 'i18next'

export interface ApplicationToolsetDependency {
    key: string
    pluginName: string
    provider: string
    instanceName?: string
}

/** Identity excludes graph node/Agent keys so several roles can share one managed instance. */
export function applicationToolsetDependencies(
    application: PluginTemplateApplicationSummary,
    templates: Pick<TXpertTemplate, 'pluginName' | 'dependencies'>[]
): ApplicationToolsetDependency[] {
    const requirements = new Map<string, ApplicationToolsetDependency>()
    for (const template of templates) {
        if (template.pluginName !== application.pluginName) invalidDependency()
        for (const dependency of template.dependencies?.toolsets ?? []) {
            const provider = dependency.provider?.trim()
            const pluginName = dependency.pluginName?.trim() || application.pluginName
            const instanceName = dependency.instanceName?.trim() || undefined
            if (!provider || !dependency.templateNodeKey?.trim()) invalidDependency()
            const key = createHash('sha256')
                .update(JSON.stringify([pluginName, provider, instanceName ?? null]))
                .digest('hex')
            requirements.set(key, { key, pluginName, provider, ...(instanceName ? { instanceName } : {}) })
        }
    }
    const result = [...requirements.values()]
    for (const item of result) {
        // The template installer resolves by provider/name; ambiguous declarations cannot be provisioned safely.
        if (
            result.some(
                (other) =>
                    other.key !== item.key &&
                    other.provider === item.provider &&
                    (!item.instanceName || !other.instanceName || item.instanceName === other.instanceName)
            )
        )
            invalidDependency()
    }
    return result
}

function invalidDependency(): never {
    throw new BadRequestException(
        t('server-ai:Error.ApplicationToolsetDependencyInvalid', {
            defaultValue: 'The application has conflicting or invalid toolset dependencies.'
        })
    )
}

export const applicationToolsetRef = (key: string) => `toolset:${key}`
