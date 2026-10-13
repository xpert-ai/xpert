import type { TTemplate } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'

/** JSON inputs only. Sort object keys so transport property order cannot change the intent. */
export function installationHash(value: unknown): string {
    const canonical = JSON.stringify(value, (_key, item) => {
        if (item && typeof item === 'object' && !Array.isArray(item))
            return Object.fromEntries(
                Object.keys(item)
                    .sort()
                    .map((key) => [key, Reflect.get(item, key)])
            )
        return item
    })
    return createHash('sha256').update(canonical).digest('hex')
}

export function templateInstallationSourceHash(
    template: Pick<
        TTemplate,
        | 'id'
        | 'export_data'
        | 'dependencies'
        | 'pluginVersion'
        | 'capabilities'
        | 'enabledCapabilities'
        | 'promptWorkflows'
        | 'locale'
    >
): string {
    return installationHash({
        id: template.id,
        export_data: template.export_data,
        dependencies: template.dependencies,
        pluginVersion: template.pluginVersion,
        capabilities: template.capabilities,
        enabledCapabilities: template.enabledCapabilities,
        promptWorkflows: template.promptWorkflows,
        locale: template.locale
    })
}

export class InstallationSourceChangedError extends Error {
    constructor() {
        super('Template installation source changed')
    }
}
