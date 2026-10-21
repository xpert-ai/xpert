import { Injectable } from '@nestjs/common'
import type { IIntegration } from '@xpert-ai/contracts'
import { IntegrationStrategyKey, type IntegrationStrategy } from '@xpert-ai/plugin-sdk'
import { IntegrationGitHubProvider } from './github.provider'
import { mergeGitHubIntegrationOptions } from './github-options'
import { integrationMessage } from './messages'

// Keep the persisted provider key and option names stable for existing integrations and Connectors.
@Injectable()
@IntegrationStrategyKey('github')
export class GitHubIntegrationStrategy implements IntegrationStrategy {
  readonly meta = IntegrationGitHubProvider

  prepareConfig(config: unknown, previous?: unknown) {
    return mergeGitHubIntegrationOptions(previous, config)
  }

  async validateConfig(config: unknown) {
    mergeGitHubIntegrationOptions(undefined, config)
    return { probe: { state: 'configuration_valid' }, warnings: [integrationMessage('validationOnly')] }
  }

  execute(integration: IIntegration<unknown>) {
    return this.validateConfig(integration.options)
  }
}
