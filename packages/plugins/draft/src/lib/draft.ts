import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { ConfigModule } from '@nestjs/config'
import { CustomerIntentModule } from './customer-intent/customer-intent.module'
import { CustomerIntentNode } from './customer-intent/node'
import { CustomerIntentProvider } from './customer-intent/provider'
import { intentNode, intentTarget } from './customer-intent/policy'
import chalk from 'chalk'
import { draftFileStoragePluginConfig } from './file-storage.config'
import { MinioProvider } from './minio.provider'
import { OSSProvider } from './oss.provider'
import { RustFSProvider } from './rustfs.provider'
import { S3Provider } from './s3.provider'
import { WasabiProvider } from './wasabi.provider'

@XpertServerPlugin({
  /**
   * An array of modules that will be imported and registered with the plugin.
   */
  imports: [ConfigModule.forFeature(draftFileStoragePluginConfig), CustomerIntentModule],

  providers: [
    MinioProvider,
    RustFSProvider,
    S3Provider,
    WasabiProvider,
    OSSProvider,
    // The loader tags root providers with the plugin installation scope before strategy discovery.
    { provide: intentNode, useExisting: CustomerIntentNode },
    { provide: intentTarget, useExisting: CustomerIntentProvider }
  ]
})
export class DraftPluginsModule implements IOnPluginBootstrap, IOnPluginDestroy {
  // We disable by default additional logging for each event to avoid cluttering the logs
  private logEnabled = true

  /**
   * Called when the plugin is being initialized.
   */
  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${DraftPluginsModule.name} is being bootstrapped...`))
    }
  }

  /**
   * Called when the plugin is being destroyed.
   */
  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${DraftPluginsModule.name} is being destroyed...`))
    }
  }
}
