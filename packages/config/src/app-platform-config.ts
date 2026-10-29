import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { parse } from 'yaml'
import {
  appPlatformDefinitionSchema,
  appPlatformEnvironmentSchema,
  type AppPlatformConfiguration
} from '@xpert-ai/contracts'

function readDefinition(file: string): unknown {
  if (statSync(file).size > 1024 * 1024) throw new Error('App Platform configuration exceeds size limit')
  return parse(readFileSync(file, 'utf8'), { maxAliasCount: 0, uniqueKeys: true })
}

/** Load both files atomically at bootstrap. Errors never include configuration contents. */
export function readAppPlatformConfig(env: NodeJS.ProcessEnv): AppPlatformConfiguration | null {
  const definitionFile = env.APP_PLATFORM_FILE?.trim()
  const environmentFile = env.APP_PLATFORM_ENVIRONMENT_FILE?.trim()
  if (!definitionFile && !environmentFile) return null
  if (!definitionFile || !environmentFile) throw new Error('Both App Platform configuration files are required')
  try {
    const definition = appPlatformDefinitionSchema.parse(readDefinition(definitionFile))
    const environment = appPlatformEnvironmentSchema.parse(readDefinition(environmentFile))
    for (const app of definition.apps) {
      if (!environment.configurations[app.configurationRef]) throw new Error('Missing application configuration')
    }
    if (!environment.plans[definition.entitlements.defaultPlanRef]) throw new Error('Missing entitlement plan')
    for (const plan of Object.values(environment.plans))
      for (const app of Object.keys(plan.appCreditLimits))
        if (!definition.apps.some(item => item.key === app)) throw new Error('Unknown application quota')
    const digest = createHash('sha256').update(JSON.stringify({ definition, environment })).digest('hex')
    return { definition, environment, digest }
  } catch {
    throw new Error('Invalid App Platform configuration; check schema, application references and environment bindings')
  }
}
