import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { IntegrationLarkPlugin } from './lib/integration-lark.plugin'
import { LarkCoreApi } from './lib/lark-core-api.service'
import { LARK_PLUGIN_CONTEXT } from './lib/tokens'

export * from './lib/queries'

const ConfigSchema = z.object({
	// Optional: global configuration, such as default log level
})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
	meta: {
		name: '@xpert-ai/plugin-integration-lark',
		version: '0.0.1',
		category: 'integration',
		icon: {
			type: 'image',
			value: '/assets/images/integrations/lark.svg'
		},
		displayName: 'Lark / Feishu Integration',
		description: 'Bidirectional messaging integration with Lark (Feishu) platform',
		keywords: ['integration', 'lark', 'feishu', 'chat', 'bot'],
		author: 'XpertAI Team',
		homepage: 'https://xpertai.cloud'
	},
	config: {
		schema: ConfigSchema
	},
	permissions: [
		{
			type: 'core-api',
			tokens: ['config', 'cache', 'integration', 'user', 'role', 'i18n', 'chat']
		}
	],
	register(ctx) {
		ctx.logger.log('Registering Lark integration plugin')
		return {
			module: IntegrationLarkPlugin,
			global: true,
			providers: [
				{ provide: LARK_PLUGIN_CONTEXT, useValue: ctx },
				LarkCoreApi
			],
			exports: [LarkCoreApi]
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
