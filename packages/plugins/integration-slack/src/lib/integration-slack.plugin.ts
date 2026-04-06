import { ConfigModule } from '@nestjs/config'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { SlackIntegrationController } from './slack-integration.controller'
import { SlackIntegrationStrategy } from './slack-integration.strategy'
import { SlackIntegrationViewProvider } from './slack-integration-view.provider'

@XpertServerPlugin({
  imports: [ConfigModule],
  controllers: [SlackIntegrationController],
  providers: [SlackIntegrationStrategy, SlackIntegrationViewProvider]
})
export class IntegrationSlackPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${IntegrationSlackPlugin.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${IntegrationSlackPlugin.name} is being destroyed...`)
    }
  }
}
