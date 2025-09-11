import { environment as env, getConfig, setConfig } from '@metad/server-config'
import { AppService, AuthGuard, getPluginModules, initI18next, PluginModule, registerPluginsAsync, ServerAppModule } from '@metad/server-core'
import { IPluginConfig } from '@metad/server-common'
import { Logger, LogLevel, Module } from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import { json, text, urlencoded } from 'express'
import expressSession from 'express-session'
import i18next from 'i18next'
import * as middleware from 'i18next-http-middleware'
import path from 'path'
import { AnalyticsModule } from '../app.module'
import { AnalyticsService } from '../app.service'
import { BootstrapModule } from './bootstrap.module'


const LOGGER_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as LogLevel[]
const LoggerIndex = LOGGER_LEVELS.findIndex((value) => value === (process.env.LOG_LEVEL || 'warn'))

export async function bootstrap(options: {title: string; version: string}) {
	// Pre-bootstrap the application configuration
	const config = await preBootstrapApplicationConfig({})

	const baseDir = config.assetOptions.serverRoot
	await initI18next(path.join(baseDir, 'packages'))

	@Module({ imports: [PluginModule.init(), BootstrapModule] })
    class RootModule {}
	
	const app = await NestFactory.create(RootModule, {
		logger: LOGGER_LEVELS.slice(0, LoggerIndex + 1)
	})

	app.use(middleware.handle(i18next)); // attach i18next middleware

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

	const headersForOpenAI =
		'x-stainless-os, x-stainless-lang, x-stainless-package-version, x-stainless-runtime, x-stainless-arch, x-stainless-runtime-version, x-stainless-retry-count'
	app.enableCors({
		origin: [...origins(env.clientBaseUrl), '*'],
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
		credentials: true,
		allowedHeaders:
			'Authorization, Language, Time-Zone, Tenant-Id, Organization-Id, X-Requested-With, X-Auth-Token, X-HTTP-Method-Override, Content-Type, Content-Length, Content-Language, Accept, Accept-Language, Observe, last-event-id, ' +
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
	if (Object.keys(applicationConfig).length > 0) {
		// Set initial configuration if any properties are provided
		setConfig(applicationConfig);
	}

	await preBootstrapPlugins();

	return getConfig()
}

export async function preBootstrapPlugins() {
	const { modules } = await registerPluginsAsync({
		plugins: [
			'@xpert-ai/plugin-integration-dify',
			'@xpert-ai/plugin-integration-fastgpt',
			'@xpert-ai/plugin-integration-ragflow',
			'@xpert-ai/plugin-integration-github'
		],
		discovery: {
			prefix: '@xpert-ai/plugin-',
		}
	});

	setConfig({plugins: modules});
}

function origins(url: string) {
  const urls = []
  if (url.startsWith('http')) {
	urls.push(url)
  } else if (url.startsWith('//')) {
	urls.push('http:' + url, 'https:' + url)
  } else {
	urls.push('http://' + url, 'https://' + url)
  }
  return urls
}