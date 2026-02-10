import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { IntegrationLarkPlugin } from './lib/integration-lark.plugin'
import { LARK_PLUGIN_CONTEXT } from './lib/tokens'
import { iconImage } from './lib/types'

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
			value: iconImage
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
		{ type: 'integration', service: 'lark', operations: ['read'] },
		{ type: 'user', operations: ['read'] },
	],
	register(ctx) {
		ctx.logger.log('Registering Lark integration plugin')
		return {
			module: IntegrationLarkPlugin,
			global: true,
			providers: [
				{ provide: LARK_PLUGIN_CONTEXT, useValue: ctx },
			],
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
