import { ConfigModule, getConfig } from '@xpert-ai/server-config'
import { initializeApplicationTracingFromEnv, ServerAIModule } from '@xpert-ai/server-ai'
import {
  initI18next,
  PluginModule,
  provideBullModule,
  provideCacheModule,
  provideEventEmitterModule,
  provideI18nModule,
  providePinoLoggerModule,
  provideScheduleModule,
  RedisModule,
  resolveNestLogLevels,
  SeederModule,
  ServerAppModule
} from '@xpert-ai/server-core'
import { Logger as NestLogger, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'
import path from 'node:path'
import { preBootstrapApplicationConfig } from './bootstrap'
import { prepare } from './prepare'

/**
 * Application composition for dedicated Xpert API workers.
 *
 * Worker process ownership belongs to @xpert-ai/xpert-api and contains only
 * the generic server and AI runtime modules.
 */
@Module({
  imports: [
    ConfigModule,
    RedisModule,
    providePinoLoggerModule(),
    provideCacheModule(),
    provideBullModule(),
    provideI18nModule(getConfig().assetOptions.serverRoot),
    provideEventEmitterModule(),
    provideScheduleModule(),
    ServerAppModule,
    ServerAIModule,
    SeederModule
  ]
})
class ApiWorkerBootstrapModule {}

/** Boot the plugin/runtime graph without opening an HTTP listener. */
export async function bootstrapWorker() {
  // The API package owns worker composition and invokes domain preparation explicitly.
  prepare()
  const config = await preBootstrapApplicationConfig({})
  initializeApplicationTracingFromEnv()
  await initI18next(path.join(config.assetOptions.serverRoot, 'packages'))

  @Module({ imports: [ApiWorkerBootstrapModule, PluginModule.init()] })
  class WorkerRootModule {}

  const app = await NestFactory.createApplicationContext(WorkerRootModule, {
    bufferLogs: true
  })
  app.useLogger(app.get(Logger))
  NestLogger.overrideLogger(resolveNestLogLevels())
  app.enableShutdownHooks()
  return app
}
