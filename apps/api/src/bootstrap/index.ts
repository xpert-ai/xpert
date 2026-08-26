import { environment as env, getConfig, setConfig } from '@xpert-ai/server-config'
import {
  API_PRINCIPAL_USER_ID_HEADER,
  MCP_HTTP_CORS_EXPOSED_HEADERS,
  MCP_HTTP_CORS_REQUEST_HEADERS
} from '@xpert-ai/contracts'
import { initializeApplicationTracingFromEnv, MetricsService } from '@xpert-ai/server-ai'
import {
  AppService,
  AuthGuard,
  coreEntities,
  coreSubscribers,
  getEntitiesFromPlugins,
  getSubscribersFromPlugins,
  initI18next,
  loadOrganizationPluginConfigs,
  normalizePluginName,
  PluginModule,
  PluginScopeGuard,
  resolveNestLogLevels,
  registerPluginsAsync,
  ServerAppModule,
  SharedModule,
  TenantService
} from '@xpert-ai/server-core'
import { IPluginConfig } from '@xpert-ai/server-common'
import { ConflictException, DynamicModule, Logger as NestLogger, Module, NotFoundException, Type } from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { GLOBAL_ORGANIZATION_SCOPE, SYSTEM_GLOBAL_SCOPE, setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { useContainer } from 'class-validator'
import chalk from 'chalk'
import cookieParser from 'cookie-parser'
import { json, Request, Response, text, urlencoded } from 'express'
import i18next from 'i18next'
import * as middleware from 'i18next-http-middleware'
import { Logger } from 'nestjs-pino'
import path from 'path'
import { EntitySubscriberInterface } from 'typeorm'
import { BootstrapModule } from './bootstrap.module'
import { createCorsOriginMatcher } from './cors-origin'
import { createMcpPublicationJsonBodyParser } from './mcp-publication-body-parser'
import { createSandboxAwareBodyParserType } from './sandbox-proxy-body-parser'
import { configureSession } from './session'
import { configureTrustProxy } from './trust-proxy'
import { withSchemaSyncProtection } from './schema-sync-bootstrap'

export async function bootstrap(options: { title: string; version: string }) {
  // Pre-bootstrap the application configuration
  const config = await preBootstrapApplicationConfig({})
  initializeApplicationTracingFromEnv()

  const baseDir = config.assetOptions.serverRoot
  await initI18next(path.join(baseDir, 'packages'))

  @Module({ imports: [BootstrapModule, PluginModule.init()] })
  class RootModule {}

  const app = await NestFactory.create<NestExpressApplication>(RootModule, {
    bodyParser: false,
    bufferLogs: true
  })

  app.useLogger(app.get(Logger))
  NestLogger.overrideLogger(resolveNestLogLevels())

  configureTrustProxy(app, {
    value: env.env?.TRUST_PROXY,
    cloudDeployment: env.deploymentTarget === 'cloud'
  })

  const metricsService = app.get(MetricsService)
  app.getHttpAdapter().get('/metrics', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', metricsService.contentType)
    res.send(metricsService.render())
  })

  // Set query parser to extended (In Express v5, query parameters are no longer parsed using the qs library by default.)
  app.set('query parser', 'extended')

  app.use(middleware.handle(i18next)) // attach i18next middleware

  // This will lockdown all routes and make them accessible by authenticated users only.
  const reflector = app.get(Reflector)
  app.useGlobalGuards(new AuthGuard(reflector), new PluginScopeGuard(reflector))

  app.use(cookieParser())
  app.use('/api/mcp/p', createMcpPublicationJsonBodyParser())
  app.use(
    text({
      limit: '50mb',
      type: createSandboxAwareBodyParserType('text/xml')
    })
  )
  app.use(
    json({
      limit: '50mb',
      type: createSandboxAwareBodyParserType('application/json')
    })
  )
  app.use(
    urlencoded({
      extended: true,
      limit: '50mb',
      type: createSandboxAwareBodyParserType('application/x-www-form-urlencoded')
    })
  )

  // CORS
  const headersForOpenAI =
    'x-stainless-os, x-stainless-lang, x-stainless-package-version, x-stainless-runtime, x-stainless-arch, x-stainless-runtime-version, x-stainless-retry-count'
  app.enableCors({
    origin: createCorsOriginMatcher(env.clientBaseUrl, ...(env.env['CORS_ALLOW_ORIGINS']?.split(',') || [])),
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      `Authorization, Language, Time-Zone, Tenant-Id, Organization-Id, X-Scope-Level, X-Requested-With, X-Auth-Token, X-HTTP-Method-Override, Content-Type, Content-Length, Content-Language, Accept, Accept-Language, Observe, last-event-id, X-Api-Key, X-Client-Secret, ${API_PRINCIPAL_USER_ID_HEADER}, ` +
      `${headersForOpenAI}, ${MCP_HTTP_CORS_REQUEST_HEADERS.join(', ')}`,
    exposedHeaders: MCP_HTTP_CORS_EXPOSED_HEADERS.join(', ')
  })

  // Sessions
  configureSession(app, {
    secret: env.EXPRESS_SESSION_SECRET,
    secure: env.production
  })

  const globalPrefix = 'api'
  app.setGlobalPrefix(globalPrefix, {
    exclude: ['artifacts/share', 'artifacts/share/(.*)', '.well-known/oauth-protected-resource/(.*)']
  })

  // Seed default values
  const serverService = app.select(ServerAppModule).get(AppService)
  await serverService.seedDBIfEmpty()
  const tenantService = app.select(ServerAppModule).get(TenantService)
  let defaultTenantId: string | null = null
  try {
    defaultTenantId = (await tenantService.getDefaultTenant())?.id ?? null
  } catch (error) {
    if (!(error instanceof NotFoundException)) {
      throw error
    }
  }
  setDefaultTenantId(defaultTenantId)
  /**
   * Dependency injection with class-validator
   */
  useContainer(app.select(SharedModule), { fallbackOnErrors: true })

  // Setup Swagger Module
  const swagger = new DocumentBuilder().setTitle(options.title).setVersion(options.version).addBearerAuth().build()

  const document = SwaggerModule.createDocument(app, swagger)
  SwaggerModule.setup('swg', app, document)

  app.enableShutdownHooks()

  // Listen App
  const port = process.env.PORT || 3000
  await app.listen(port, '0.0.0.0', () => {
    NestLogger.log('Listening at http://localhost:' + port + '/' + globalPrefix)
  })
}

/**
 * Prepares the application configuration before initializing plugins.
 * Configures migration settings, registers entities and subscribers,
 * and applies additional plugin configurations.
 *
 * @param applicationConfig - The initial application configuration.
 * @returns A promise that resolves to the final application configuration after pre-bootstrap operations.
 */
export async function preBootstrapApplicationConfig(
  applicationConfig: Partial<IPluginConfig>,
  options: { failOnPluginRegistrationError?: boolean } = {}
) {
  console.time(chalk.yellow('✔ Pre Bootstrap Application Config Time'))

  if (Object.keys(applicationConfig).length > 0) {
    // Set initial configuration if any properties are provided
    setConfig(applicationConfig)
  }

  await withSchemaSyncProtection(async () => {
    await preBootstrapPlugins(options)

    // Register core and plugin entities and subscribers
    const entities = await preBootstrapRegisterEntities(applicationConfig)
    const subscribers = await preBootstrapRegisterSubscribers(applicationConfig)

    setConfig({
      dbConnectionOptions: {
        entities: entities as Array<Type<any>>, // Core and plugin entities
        subscribers: subscribers as Array<Type<EntitySubscriberInterface>> // Core and plugin subscribers
      }
    })
  })

  const config = getConfig()

  console.timeEnd(chalk.yellow('✔ Pre Bootstrap Application Config Time'))
  return config
}

export async function preBootstrapPlugins(options: { failOnPluginRegistrationError?: boolean } = {}) {
  type BootstrapPlugin = NonNullable<Parameters<typeof registerPluginsAsync>[0]['plugins']>[number]

  const pluginsFromEnv = process.env.PLUGINS?.split(/[,;]/).filter(Boolean) || []
  const defaultPlugins: BootstrapPlugin[] = [
    { name: '@xpert-ai/plugin-draft', source: 'code' as const, level: 'organization' },
    { name: '@xpert-ai/plugin-vlm-default', source: 'code' as const, level: 'system' }
  ]
  const defaultGlobalPlugins = defaultPlugins.filter((plugin) => plugin.level !== 'system')
  const defaultSystemPlugins = defaultPlugins.filter((plugin) => plugin.level === 'system')

  const organizationPluginConfigs = await loadOrganizationPluginConfigs()
  const persistedGlobalGroup = organizationPluginConfigs.find(
    (group) => (group.scopeKey ?? group.organizationId) === GLOBAL_ORGANIZATION_SCOPE
  )
  const persistedSystemGroup = organizationPluginConfigs.find(
    (group) => (group.scopeKey ?? group.organizationId) === SYSTEM_GLOBAL_SCOPE
  )

  const globalPlugins: BootstrapPlugin[] = [
    ...defaultGlobalPlugins,
    ...pluginsFromEnv.map((name) => ({ name, source: 'env' as const }))
  ]
  const systemPlugins: BootstrapPlugin[] = [...defaultSystemPlugins]
  const mergedGlobalPluginMap = new Map<string, BootstrapPlugin>(
    globalPlugins.map((plugin) => [normalizePluginName(plugin.name), plugin])
  )
  const mergedSystemPluginMap = new Map<string, BootstrapPlugin>(
    systemPlugins.map((plugin) => [normalizePluginName(plugin.name), plugin])
  )
  for (const plugin of persistedGlobalGroup?.plugins ?? []) {
    const normalized = normalizePluginName(plugin.name)
    const current = mergedGlobalPluginMap.get(normalized)
    if (current?.source === 'code') {
      continue
    }
    mergedGlobalPluginMap.set(normalized, {
      ...plugin,
      source: plugin.source as BootstrapPlugin['source']
    })
  }
  for (const plugin of persistedSystemGroup?.plugins ?? []) {
    const normalized = normalizePluginName(plugin.name)
    const current = mergedSystemPluginMap.get(normalized)
    if (current?.source === 'code') {
      continue
    }
    mergedSystemPluginMap.set(normalized, {
      ...plugin,
      source: plugin.source as BootstrapPlugin['source']
    })
  }
  const persistedOrganizationGroups = organizationPluginConfigs
    .filter((group) => {
      const scopeKey = group.scopeKey ?? group.organizationId
      return scopeKey !== GLOBAL_ORGANIZATION_SCOPE && scopeKey !== SYSTEM_GLOBAL_SCOPE
    })
    .map((group) => ({
      ...group,
      plugins: group.plugins.map((plugin) => ({
        ...plugin,
        source: plugin.source as BootstrapPlugin['source']
      }))
    }))

  // If there is no persisted configuration, fallback to defaults + env for the global scope
  const groups: Array<{
    tenantId?: string | null
    organizationId?: string
    scopeKey?: string
    plugins: BootstrapPlugin[]
    configs: Record<string, any>
  }> = [
    ...persistedOrganizationGroups,
    {
      tenantId: null,
      organizationId: GLOBAL_ORGANIZATION_SCOPE,
      scopeKey: SYSTEM_GLOBAL_SCOPE,
      plugins: Array.from(mergedSystemPluginMap.values()),
      configs: persistedSystemGroup?.configs ?? {}
    },
    {
      tenantId: persistedGlobalGroup?.tenantId,
      organizationId: GLOBAL_ORGANIZATION_SCOPE,
      scopeKey: GLOBAL_ORGANIZATION_SCOPE,
      plugins: Array.from(mergedGlobalPluginMap.values()),
      configs: persistedGlobalGroup?.configs ?? {}
    }
  ]
  const modules: DynamicModule[] = []
  for await (const group of groups) {
    try {
      const { modules: orgModules } = await registerPluginsAsync(group, new NestLogger('BootstrapPlugins'))
      modules.push(...orgModules)
    } catch (error) {
      console.error(error)
      NestLogger.error(`Failed to register plugins for organization ${group.organizationId}: ${error.message}`)
      if (options.failOnPluginRegistrationError) {
        throw error
      }
    }
  }

  const existingEntities = Array.isArray(getConfig().dbConnectionOptions?.entities)
    ? (getConfig().dbConnectionOptions.entities as Array<any>)
    : getConfig().dbConnectionOptions?.entities
      ? Object.values(getConfig().dbConnectionOptions.entities as Record<string, any>)
      : []
  const pluginEntities = getEntitiesFromPlugins(modules)
  const mergedEntities = Array.from(new Set([...existingEntities, ...pluginEntities]))

  setConfig({
    plugins: modules,
    dbConnectionOptions: {
      autoLoadEntities: true,
      entities: mergedEntities
    }
  })
}

/**
 * Register entities from core and plugin configurations.
 * Ensures no conflicts between core entities and plugin entities.
 *
 * @param config - Plugin configuration containing plugin entities.
 * @returns A promise that resolves to an array of registered entity types.
 */
export async function preBootstrapRegisterEntities(config: Partial<IPluginConfig>): Promise<Array<Type<any>>> {
  try {
    console.time(chalk.yellow('✔ Pre Bootstrap Register Entities Time'))
    // Retrieve core entities and plugin entities
    const coreEntitiesList = [...coreEntities] as Array<Type<any>>
    const pluginEntitiesList = getEntitiesFromPlugins(config.plugins)

    // Check for conflicts and merge entities
    const registeredEntities = mergeEntities(coreEntitiesList, pluginEntitiesList)

    console.timeEnd(chalk.yellow('✔ Pre Bootstrap Register Entities Time'))
    return registeredEntities
  } catch (error) {
    console.log(chalk.red('Error registering entities:'), error)
  }
}

/**
 * Merges core entities and plugin entities, ensuring no conflicts.
 *
 * @param coreEntities - Array of core entities.
 * @param pluginEntities - Array of plugin entities from the plugins.
 * @returns The merged array of entities.
 * @throws ConflictException if a plugin entity conflicts with a core entity.
 */
function mergeEntities(coreEntities: Array<Type<any>>, pluginEntities: Array<Type<any>>): Array<Type<any>> {
  for (const pluginEntity of pluginEntities) {
    const entityName = pluginEntity.name

    if (coreEntities.some((entity) => entity.name === entityName)) {
      throw new ConflictException({ message: `Entity conflict: ${entityName} conflicts with core entities.` })
    }

    coreEntities.push(pluginEntity)
  }

  return coreEntities
}

/**
 * Registers subscriber entities from core and plugin configurations, ensuring no conflicts.
 *
 * @param config - The application configuration that might contain plugin subscribers.
 * @returns A promise that resolves to an array of registered subscriber entity types.
 */
async function preBootstrapRegisterSubscribers(
  config: Partial<IPluginConfig>
): Promise<Array<Type<EntitySubscriberInterface>>> {
  console.time(chalk.yellow('✔ Pre Bootstrap Register Subscribers Time'))

  try {
    // List of core subscribers
    const subscribers = coreSubscribers as Array<Type<EntitySubscriberInterface>>

    // Get plugin subscribers from the application configuration
    const pluginSubscribersList = getSubscribersFromPlugins(config.plugins)

    // Check for conflicts and add new plugin subscribers
    for (const pluginSubscriber of pluginSubscribersList) {
      const subscriberName = pluginSubscriber.name

      // Check for name conflicts with core subscribers
      if (subscribers.some((subscriber) => subscriber.name === subscriberName)) {
        // Throw an exception if there's a conflict
        throw new ConflictException({
          message: `Error: ${subscriberName} conflicts with default subscribers.`
        })
      } else {
        // Add the new plugin subscriber to the list if no conflict
        subscribers.push(pluginSubscriber)
      }
    }

    console.timeEnd(chalk.yellow('✔ Pre Bootstrap Register Subscribers Time'))

    // Return the updated list of subscribers
    return subscribers
  } catch (error) {
    console.log(chalk.red('Error registering subscribers:'), error)
  }
}
