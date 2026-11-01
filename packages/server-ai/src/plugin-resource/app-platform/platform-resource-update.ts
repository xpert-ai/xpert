import { AppPlatformConfiguration } from '@xpert-ai/contracts'
import { platformFailure } from './platform-error'

/** Index/model and shared-resource replacement require an explicit resource migration.
 * Reject before adopting a snapshot rather than reporting unapplied settings as ready. */
export function assertPlatformResourceUpdate(previous: AppPlatformConfiguration, next: AppPlatformConfiguration) {
    for (const app of next.definition.apps) {
        const old = previous.definition.apps.find((item) => item.key === app.key)
        if (!old) continue
        const {
            primary: _oldPrimary,
            auxiliaryModels: _oldAuxiliary,
            ...oldResources
        } = previous.environment.configurations[old.configurationRef]
        const {
            primary: _newPrimary,
            auxiliaryModels: _newAuxiliary,
            ...newResources
        } = next.environment.configurations[app.configurationRef]
        if (JSON.stringify(oldResources) !== JSON.stringify(newResources))
            throw platformFailure('application_resource_migration_required', 409)
        const bindings = (configuration: AppPlatformConfiguration) =>
            configuration.definition.bindings
                .filter((binding) => binding.to.app === app.key)
                .map((binding) => JSON.stringify(binding))
                .sort()
        if (JSON.stringify(bindings(previous)) !== JSON.stringify(bindings(next)))
            throw platformFailure('application_resource_migration_required', 409)
    }
}
