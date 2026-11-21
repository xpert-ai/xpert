import { AppPlatformConfiguration } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { platformFailure } from './platform-error'

/** App upgrades may increase base storage, but reducing an existing account grant
 * requires an explicit capacity operation. Keep the shared deployment config immutable. */
export function platformConfigurationForUpgrade(previous: AppPlatformConfiguration, next: AppPlatformConfiguration) {
    const plan = previous.definition.entitlements.defaultPlanRef
    if (plan !== next.definition.entitlements.defaultPlanRef) return next
    const granted = previous.environment.plans[plan].maxStorageBytes
    if (granted <= next.environment.plans[plan].maxStorageBytes) return next
    const environment = {
        ...next.environment,
        plans: {
            ...next.environment.plans,
            [plan]: { ...next.environment.plans[plan], maxStorageBytes: granted }
        }
    }
    const definition = next.definition
    const digest = createHash('sha256').update(JSON.stringify({ definition, environment })).digest('hex')
    return { definition, environment, digest }
}

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
