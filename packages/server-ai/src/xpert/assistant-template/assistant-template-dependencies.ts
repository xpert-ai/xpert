import { IXpert, templateDependencyLocksSchema, templateDependencyVersionsSchema } from '@xpert-ai/contracts'
import { normalizePluginName } from '@xpert-ai/server-core'

/** Normalize persisted dependency metadata after the caller authorizes its own operation. */
export function assistantTemplateDependencyLocks(options: IXpert['options']) {
    const locks = options?.templateDependencyLocks ?? options?.templateSource?.dependencyLocks
    // Older v2 publications stored explicit requirements only in the template metadata.
    const versions = templateDependencyVersionsSchema.parse(options?.templateDefinition?.dependencies?.versions ?? [])
    return locks
        ? templateDependencyLocksSchema.parse(locks).map((lock) => {
              const required = versions.find((entry) => normalizePluginName(entry.pluginName) === lock.pluginName)
              return required && !lock.requiredVersion ? { ...lock, requiredVersion: required.version } : lock
          })
        : undefined
}
