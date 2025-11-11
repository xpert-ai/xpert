import './polyfills';
import { bootstrap, prepare, seedModule } from '@metad/analytics'
import { installPlugins, seedDefault } from '@metad/server-core'
import yargs from 'yargs'
import { pluginConfig } from './plugin-config'

if (process.env.NODE_ENV !== 'production') {
  installPlugins()
}

prepare()

const argv: any = yargs(process.argv).argv
const command = argv.command

if (command === 'seedModule') {
  seedModule(pluginConfig).catch((error: any) => {
    console.log(error)
    process.exit(1)
  })
} else if (command === 'seed') {
  seedDefault(pluginConfig).catch((error: any) => {
    console.log(error)
    process.exit(1)
  })
} else {
  bootstrap({title: 'Xpert AI', version: '1.0'})
}


// async function bootstrap() {
//   const app = await NestFactory.create(AppModule, {
//     logger: LOGGER_LEVELS.slice(0, LoggerIndex + 1)
//   })

//   // This will lockdown all routes and make them accessible by authenticated users only.
//   const reflector = app.get(Reflector)
//   app.useGlobalGuards(new AuthGuard(reflector))

//   app.use(text({
//     limit: '50mb',
//     type: 'text/xml',
//   }))
//   app.use(json({ limit: '50mb' }))
//   app.use(urlencoded({ extended: true, limit: '50mb' }))

//   const headersForOpenAI = 'x-stainless-os, x-stainless-lang, x-stainless-package-version, x-stainless-runtime, x-stainless-arch, x-stainless-runtime-version'
// 	app.enableCors({
// 		origin: '*',
// 		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
// 		credentials: true,
// 		allowedHeaders:
// 			'Authorization, Language, Tenant-Id, Organization-Id, X-Requested-With, X-Auth-Token, X-HTTP-Method-Override, Content-Type, Content-Language, Accept, Accept-Language, Observe, ' + headersForOpenAI
// 	})

//   // Sessions
//   app.use(
//     // this runs in memory, so we lose sessions on restart of server/pod
//     expressSession({
//       secret: env.EXPRESS_SESSION_SECRET,
//       resave: true, // we use this because Memory store does not support 'touch' method
//       saveUninitialized: true,
//       cookie: { secure: env.production } // TODO
//     })
//   )

//   const globalPrefix = 'api'
//   app.setGlobalPrefix(globalPrefix)

//   // Seed default values
//   const serverService = app.select(ServerAppModule).get(AppService)
//   await serverService.seedDBIfEmpty()
//   const analyticsService = app.select(AnalyticsModule).get(AnalyticsService)
//   await analyticsService.seedDBIfEmpty()
//   // Webhook for lark
//   const larkService = app.select(IntegrationLarkModule).get(LarkService)
//   app.use('/api/lark/webhook/event', larkService.webhookEventDispatcher)

//   // const subscriptionService = app.select(ServerAppModule).get(SubscriptionService)
//   // subscriptionService.setupJobs()

//   // Setup Swagger Module
//   const options = new DocumentBuilder().setTitle('Metad Cloud API').setVersion('1.0').addBearerAuth().build()

//   const document = SwaggerModule.createDocument(app, options)
//   SwaggerModule.setup('swg', app, document)

//   app.enableShutdownHooks();

//   // Listen App
//   const port = process.env.PORT || 3000
//   await app.listen(port, '0.0.0.0', () => {
//     Logger.log('Listening at http://localhost:' + port + '/' + globalPrefix)
//   })
// }

