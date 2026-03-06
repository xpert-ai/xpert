import { PLUGIN_LEVEL } from '@metad/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { join } from 'node:path'
import { IntegrationLarkPlugin } from './lib/integration-lark.module'
import { IntegrationLarkPluginConfig, IntegrationLarkPluginConfigSchema } from './lib/plugin-config'
import { LARK_PLUGIN_CONTEXT } from './lib/tokens'
import { iconImage } from './lib/types'
import { initI18n } from './lib/i18n'

const plugin: XpertPlugin<IntegrationLarkPluginConfig> = {
  meta: {
    name: '@xpert-ai/plugin-integration-lark',
    version: '0.0.1',
    category: 'integration',
    level: PLUGIN_LEVEL.SYSTEM,
    icon: {
      type: 'image',
      value: iconImage
    },
    displayName: 'Lark / Feishu Integration',
    description: 'Bidirectional messaging integration with Lark (Feishu) platform',
    keywords: ['integration', 'lark', 'feishu', 'chat', 'bot'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud'
  },
  config: {
    schema: IntegrationLarkPluginConfigSchema
  },
  permissions: [
    { type: 'integration', service: 'lark', operations: ['read'] },
    { type: 'user', operations: ['read', 'write'] },
    { type: 'handoff', operations: ['enqueue'] },
    { type: 'analytics', operations: ['model', 'dscore', 'query', 'create_indicator'] }
  ],
  register(ctx) {
    ctx.logger.log('Registering Lark integration plugin')
    initI18n(join(__dirname, '../src'))
    return {
      module: IntegrationLarkPlugin,
      global: true,
      providers: [{ provide: LARK_PLUGIN_CONTEXT, useValue: ctx }],
      exports: []
    }
  },
  async onStart(ctx) {
    ctx.logger.log('Lark integration plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Lark integration plugin stopped')
  }
}

export default plugin
