import { CORE_PLUGIN_API_TOKENS, CoreCacheApi, CoreChatApi, CoreConfigApi, CoreI18nApi, CoreIntegrationApi, CoreRoleApi, CoreUserApi } from '@xpert-ai/plugin-sdk'
import type { PluginContext } from '@xpert-ai/plugin-sdk'
import { Inject, Injectable } from '@nestjs/common'
import { LARK_PLUGIN_CONTEXT } from './tokens'

@Injectable()
export class LarkCoreApi {
	constructor(
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly ctx: PluginContext
	) {}

	get config(): CoreConfigApi {
		return this.ctx.api.get(CORE_PLUGIN_API_TOKENS.config)
	}

	get cache(): CoreCacheApi {
		return this.ctx.api.get(CORE_PLUGIN_API_TOKENS.cache)
	}

	get integration(): CoreIntegrationApi {
		return this.ctx.api.get(CORE_PLUGIN_API_TOKENS.integration)
	}

	get user(): CoreUserApi {
		return this.ctx.api.get(CORE_PLUGIN_API_TOKENS.user)
	}

	get role(): CoreRoleApi {
		return this.ctx.api.get(CORE_PLUGIN_API_TOKENS.role)
	}

	get i18n(): CoreI18nApi {
		return this.ctx.api.get(CORE_PLUGIN_API_TOKENS.i18n)
	}

	get chat(): CoreChatApi {
		return this.ctx.api.get(CORE_PLUGIN_API_TOKENS.chat)
	}
}
