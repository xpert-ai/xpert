import { environment as env, getConfig, setConfig } from '@metad/server-config'
import {
	AppService,
	AuthGuard,
	coreEntities,
	coreSubscribers,
	getEntitiesFromPlugins,
	getSubscribersFromPlugins,
	initI18next,
	loadOrganizationPluginConfigs,
	PluginModule,
	registerPluginsAsync,
	ServerAppModule,
	SharedModule
} from '@metad/server-core'
import { IPluginConfig } from '@metad/server-common'
import { ConflictException, DynamicModule, Logger, LogLevel, Module, Type } from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { GLOBAL_ORGANIZATION_SCOPE } from '@xpert-ai/plugin-sdk'
import { useContainer } from 'class-validator'
import chalk from 'chalk'
import cookieParser from 'cookie-parser'
import { json, text, urlencoded } from 'express'
import expressSession from 'express-session'
import i18next from 'i18next'
import * as middleware from 'i18next-http-middleware'
import path from 'path'
import { EntitySubscriberInterface } from 'typeorm'
import { AnalyticsModule } from '../app.module'
import { AnalyticsService } from '../app.service'
import { BootstrapModule } from './bootstrap.module'

const LOGGER_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as LogLevel[]
const LoggerIndex = LOGGER_LEVELS.findIndex((value) => value === (process.env.LOG_LEVEL || 'warn'))

export async function bootstrap(options: { title: string; version: string }) {
	// Pre-bootstrap the application configuration
	const config = await preBootstrapApplicationConfig({})

	const baseDir = config.assetOptions.serverRoot
	await initI18next(path.join(baseDir, 'packages'))

	@Module({ imports: [BootstrapModule, PluginModule.init()] })
	class RootModule {}

	const app = await NestFactory.create<NestExpressApplication>(RootModule, {
		logger: LOGGER_LEVELS.slice(0, LoggerIndex + 1)
	})

	// Set query parser to extended (In Express v5, query parameters are no longer parsed using the qs library by default.)
	app.set('query parser', 'extended')

	app.use(middleware.handle(i18next)) // attach i18next middleware

	// This will lockdown all routes and make them accessible by authenticated users only.
	const reflector = app.get(Reflector)
	app.useGlobalGuards(new AuthGuard(reflector))

	app.use(cookieParser())
	app.use(
		text({
			limit: '50mb',
			type: 'text/xml'
		})
	)
	app.use(json({ limit: '50mb' }))
	app.use(urlencoded({ extended: true, limit: '50mb' }))

	// CORS
	const headersForOpenAI =
		'x-stainless-os, x-stainless-lang, x-stainless-package-version, x-stainless-runtime, x-stainless-arch, x-stainless-runtime-version, x-stainless-retry-count'
	app.enableCors({
		origin: [...origins(env.clientBaseUrl), ...origins(...(env.env['CORS_ALLOW_ORIGINS']?.split(',') || []))],
		credentials: true,
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
		allowedHeaders:
			'Authorization, Language, Time-Zone, Tenant-Id, Organization-Id, X-Requested-With, X-Auth-Token, X-HTTP-Method-Override, Content-Type, Content-Length, Content-Language, Accept, Accept-Language, Observe, last-event-id, X-Api-Key, ' +
			headersForOpenAI
	})

	// Sessions
	app.use(
		// this runs in memory, so we lose sessions on restart of server/pod
		expressSession({
			secret: env.EXPRESS_SESSION_SECRET,
			resave: true, // we use this because Memory store does not support 'touch' method
			saveUninitialized: true,
			cookie: { secure: env.production } // TODO
		})
	)

	const globalPrefix = 'api'
	app.setGlobalPrefix(globalPrefix)

	// Seed default values
	const serverService = app.select(ServerAppModule).get(AppService)
	await serverService.seedDBIfEmpty()
	const analyticsService = app.select(AnalyticsModule).get(AnalyticsService)
	await analyticsService.seedDBIfEmpty()
	// Webhook for lark
	// const larkService = app.select(IntegrationLarkModule).get(LarkService)
	// app.use('/api/lark/webhook/:id', larkService.webhookEventMiddleware)

	// const subscriptionService = app.select(ServerAppModule).get(SubscriptionService)
	// subscriptionService.setupJobs()

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
		Logger.log('Listening at http://localhost:' + port + '/' + globalPrefix)
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
export async function preBootstrapApplicationConfig(applicationConfig: Partial<IPluginConfig>) {
	console.time(chalk.yellow('✔ Pre Bootstrap Application Config Time'))

	if (Object.keys(applicationConfig).length > 0) {
		// Set initial configuration if any properties are provided
		setConfig(applicationConfig)
	}

	await preBootstrapPlugins()

	// Register core and plugin entities and subscribers
	const entities = await preBootstrapRegisterEntities(applicationConfig)
	const subscribers = await preBootstrapRegisterSubscribers(applicationConfig)

	setConfig({
		dbConnectionOptions: {
			entities: entities as Array<Type<any>>, // Core and plugin entities
			subscribers: subscribers as Array<Type<EntitySubscriberInterface>> // Core and plugin subscribers
		}
	})

	const config = getConfig()

	console.timeEnd(chalk.yellow('✔ Pre Bootstrap Application Config Time'))
	return config
}

export async function preBootstrapPlugins() {
	const pluginsFromEnv = process.env.PLUGINS?.split(/[,;]/).filter(Boolean) || []
	const defaultGlobalPlugins = [
		'@xpert-ai/plugin-agent-middlewares',
		'@xpert-ai/plugin-integration-github',
		// '@xpert-ai/plugin-integration-lark',
		// '@xpert-ai/plugin-ocr-paddle',
		'@xpert-ai/plugin-trigger-schedule',
		'@xpert-ai/plugin-textsplitter-common',
		'@xpert-ai/plugin-retriever-common',
		'@xpert-ai/plugin-transformer-common',
		'@xpert-ai/plugin-vlm-default'
		// '@xpert-ai/plugin-vstore-chroma',
		// '@xpert-ai/plugin-vstore-weaviate',
	]

	const organizationPluginConfigs = await loadOrganizationPluginConfigs()

	const globalPlugins = [
		...defaultGlobalPlugins.map((name) => ({ name, source: 'code' })),
		...pluginsFromEnv.map((name) => ({ name, source: 'local' }))
	]

	// If there is no persisted configuration, fallback to defaults + env for the global scope
	const groups = [
		...organizationPluginConfigs,
		{ organizationId: GLOBAL_ORGANIZATION_SCOPE, plugins: globalPlugins, configs: {} }
	]

	const modules: DynamicModule[] = []
	for await (const group of groups) {
		const mergedPlugins = group.plugins
		try {
			const { modules: orgModules } = await registerPluginsAsync({
				organizationId: group.organizationId,
				plugins: mergedPlugins,
				configs: group.configs
			})
			modules.push(...orgModules)
		} catch (error) {
			Logger.error(`Failed to register plugins for organization ${group.organizationId}: ${error.message}`)
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

function origins(...urls: string[]) {
	const results = []
	for (let url of urls) {
		url = url.trim()
		if (url.startsWith('http')) {
			results.push(url)
		} else if (url.startsWith('//')) {
			results.push('http:' + url, 'https:' + url)
		} else {
			results.push('http://' + url, 'https://' + url)
		}
	}
	return results.map((u) => u.replace(/\/+$/, ''))
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
