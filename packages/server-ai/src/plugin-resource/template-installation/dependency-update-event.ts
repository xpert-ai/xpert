import type { TChatEventMessage, TemplateDependencyUpdate } from '@xpert-ai/contracts'
import { t } from 'i18next'

/** A normal chat event keeps upgrade advice visible without adding it to the model's instructions. */
export function dependencyUpdateEvent(
    update: TemplateDependencyUpdate,
    assistantId: string
): TChatEventMessage & { id: string } {
    const resources = update.changedComponents.map((item) => `${item.type}:${item.key}`).join(', ')
    return {
        id: `assistant-dependency:${assistantId}:${update.pluginName}`,
        type: 'assistant_dependency_update',
        title: t('server-ai:AssistantDependency.UpdateAvailable'),
        message: t('server-ai:AssistantDependency.UpdateRecommendation', {
            interpolation: { escapeValue: false },
            dependency: update.pluginName,
            installedVersion: update.installedVersion,
            currentVersion: update.currentVersion,
            resources: resources || t('server-ai:AssistantDependency.VersionOnly')
        }),
        created_date: new Date().toISOString()
    }
}
