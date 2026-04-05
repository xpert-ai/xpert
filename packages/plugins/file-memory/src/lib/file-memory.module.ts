import chalk from 'chalk'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { DefaultMemoryFileRepository } from './file-repository'
import { DefaultMemoryLayerResolver } from './layer-resolver'
import { FileMemoryProviderRegistrar } from './file-memory.provider'
import { DefaultMemoryRecallPlanner } from './recall-planner'
import { DefaultMemoryWritePolicy } from './write-policy'
import { XpertMemoryService } from './file-memory.service'

@XpertServerPlugin({
  providers: [
    DefaultMemoryLayerResolver,
    DefaultMemoryFileRepository,
    DefaultMemoryRecallPlanner,
    DefaultMemoryWritePolicy,
    XpertMemoryService,
    FileMemoryProviderRegistrar
  ],
  exports: [XpertMemoryService]
})
export class FileMemoryPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${FileMemoryPluginModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${FileMemoryPluginModule.name} is being destroyed...`))
    }
  }
}
