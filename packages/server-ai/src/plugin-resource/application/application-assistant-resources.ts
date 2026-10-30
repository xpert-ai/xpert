import type { IPluginApplicationInstallation } from '@xpert-ai/contracts'

/** These references are created by the App config's template/suite lifecycle, never by product navigation. */
export function applicationAssistantResources(installation: Pick<IPluginApplicationInstallation, 'resourceRefs'>) {
    return Object.entries(installation.resourceRefs ?? {})
        .filter(([key, id]) => /^(assistant|role:[a-z0-9_-]+)$/.test(key) &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        .map(([key, id]) => ({ key, id }))
        .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
}
