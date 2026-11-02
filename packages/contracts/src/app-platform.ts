import { z } from 'zod/v3'
import { AiModelTypeEnum } from './agent/ai-model'

const key = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const text = z.string().trim().min(1).max(255)
const reference = z.object({ app: key, resource: key }).strict()

export const appPlatformAppSchema = z
  .object({
    key,
    appRef: z.object({ pluginName: text, appName: text }).strict(),
    required: z.boolean(),
    enabled: z.boolean().default(true),
    configurationRef: key,
    dependsOn: z.array(key).max(32).default([])
  })
  .strict()
  .transform(app => ({ ...app, key: app.key, required: app.required, configurationRef: app.configurationRef,
    dependsOn: app.dependsOn, enabled: app.enabled,
    appRef: { pluginName: app.appRef.pluginName, appName: app.appRef.appName } }))

/** Portable product composition. Credentials and database identities never belong here. */
export const appPlatformDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    key,
    version: z.number().int().positive(),
    branding: z
      .object({
        name: text,
        description: z.string().max(1000).optional(),
        logo: z
          .string()
          .regex(/^\/[a-zA-Z0-9/_\-.]+$/)
          .optional()
      })
      .strict(),
    registration: z.object({ role: z.literal('APP_USER'), organization: z.literal('per-account') }).strict(),
    apps: z.array(appPlatformAppSchema).min(1).max(32),
    bindings: z
      .array(
        z
          .object({
            type: z.literal('knowledgebase'),
            from: reference,
            to: reference
          })
          .strict()
      )
      .max(100)
      .default([]),
    experience: z.object({ home: key, navigation: z.array(key).min(1).max(32) }).strict(),
    entitlements: z.object({ defaultPlanRef: key }).strict()
  })
  .strict()
  .superRefine((definition, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
    const apps = new Map(definition.apps.map((app) => [app.key, app]))
    if (apps.size !== definition.apps.length) fail('Duplicate application key')
    const targets = new Set(definition.apps.map((app) => JSON.stringify(app.appRef)))
    if (targets.size !== apps.size) fail('Duplicate application installation target')
    if (!apps.get(definition.experience.home)?.required) fail('Home must reference a required application')
    if (!apps.get(definition.experience.home)?.enabled) fail('Home application must be enabled')
    if (!definition.experience.navigation.includes(definition.experience.home)) fail('Home must be present in navigation')
    if (new Set(definition.experience.navigation).size !== definition.experience.navigation.length)
      fail('Duplicate navigation entry')
    for (const entry of definition.experience.navigation) if (!apps.has(entry)) fail('Unknown navigation application')
    for (const app of definition.apps) {
      if (new Set(app.dependsOn).size !== app.dependsOn.length) fail('Duplicate dependency')
      for (const dependency of app.dependsOn) {
        if (!apps.has(dependency)) fail('Unknown application dependency')
        if (app.enabled && !apps.get(dependency)?.enabled) fail('Enabled application depends on disabled application')
        if (app.required && !apps.get(dependency)?.required)
          fail('Required application depends on optional application')
      }
    }
    const complete = new Set<string>(),
      active = new Set<string>()
    const visit = (id: string) => {
      if (active.has(id)) {
        fail('Application dependency cycle')
        return
      }
      if (complete.has(id)) return
      active.add(id)
      for (const dependency of apps.get(id)?.dependsOn ?? []) visit(dependency)
      active.delete(id)
      complete.add(id)
    }
    for (const app of definition.apps) visit(app.key)
    const consumers = new Set<string>()
    for (const binding of definition.bindings) {
      const consumer = apps.get(binding.to.app)
      if (!apps.has(binding.from.app) || !consumer) fail('Unknown resource binding application')
      if (binding.from.app === binding.to.app) fail('Resource binding must reference another application')
      if (!consumer?.dependsOn.includes(binding.from.app)) fail('Resource binding requires an explicit dependency')
      const target = `${binding.to.app}:${binding.to.resource}`
      if (consumers.has(target)) fail('Resource has multiple providers')
      consumers.add(target)
    }
  })

export type AppPlatformDefinition = z.output<typeof appPlatformDefinitionSchema>
export type AppPlatformApp = z.output<typeof appPlatformAppSchema>

const model = z.object({ provider: text, model: text, role: z.enum(['primary', 'secondary', 'embedding', 'reasoning']).optional() }).strict()
export const appPlatformEnvironmentSchema = z
  .object({
    schemaVersion: z.literal(1),
    configurations: z.record(
      key,
      z
        .object({
          primary: model,
          embedding: model.optional(),
          vision: model.optional(),
          speechToText: model.optional(),
          auxiliaryModels: z.array(model.extend({ modelType: z.nativeEnum(AiModelTypeEnum) })).max(32).default([]),
          tools: z.array(z.object({ provider: text, sourceName: text }).strict()).max(32).default([])
            .refine(items => new Set(items.map(item => item.provider)).size === items.length, 'Duplicate tool provider')
        })
        .strict()
    ),
    plans: z.record(
      key,
      z
        .object({
          trialDays: z.number().int().min(1).max(365),
          creditLimit: z.number().positive(),
          maxProjects: z.number().int().min(1).max(10000),
          maxUploadBytes: z.number().int().positive(),
          maxStorageBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(2 * 1024 ** 3),
          maxTemporaryBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(256 * 1024 ** 2),
          maxConcurrentRuns: z.number().int().min(1).max(100)
        })
        .strict()
    )
  })
  .strict()

export type AppPlatformEnvironment = z.output<typeof appPlatformEnvironmentSchema>
export interface AppPlatformConfiguration {
  definition: AppPlatformDefinition
  environment: AppPlatformEnvironment
  digest: string
}

export function appPlatformAppOrder(definition: AppPlatformDefinition): AppPlatformApp[] {
  const apps = new Map(definition.apps.map((app) => [app.key, app]))
  const ordered: AppPlatformApp[] = [],
    seen = new Set<string>()
  const visit = (app: AppPlatformApp) => {
    if (seen.has(app.key)) return
    seen.add(app.key)
    for (const id of app.dependsOn) {
      const dependency = apps.get(id)
      if (dependency) visit(dependency)
    }
    ordered.push(app)
  }
  definition.apps.forEach(visit)
  return ordered
}

export interface AppPlatformStatus {
  mode: 'managed-apps'
  branding: AppPlatformDefinition['branding']
  platformKey: string
  version: number
  organizationId: string
  home: string
  ready: boolean
  apps: Array<{
    key: string
    required: boolean
    status: 'pending' | 'initializing' | 'ready' | 'failed' | 'blocked' | 'disabled'
    errorCode?: string
    entries: Array<{ key: string; id: string; slug?: string; title: string }>
  }>
}
