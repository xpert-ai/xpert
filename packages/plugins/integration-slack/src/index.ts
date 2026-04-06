import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { IntegrationSlackPlugin } from './lib/integration-slack.plugin'

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-integration-slack',
    version: '1.0.0',
    level: 'system',
    category: 'integration',
    icon: {
      type: 'image',
      value: `/assets/images/destinations/slack.png`
    },
    displayName: 'Slack Integration',
    description: 'Provide Slack integration strategy and declarative view extensions',
    keywords: ['integration', 'slack', 'view-extension', 'strategy'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register slack integration plugin')
    return { module: IntegrationSlackPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('slack integration plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('slack integration plugin stopped')
  }
}

export default plugin
