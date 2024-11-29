import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { ZhipuAILargeLanguageModel } from './llm/llm'
import { ZhipuaiCredentials } from './types'

@Injectable()
export class ZhipuaiProvider extends ModelProvider {
	constructor() {
		super('zhipuai')
	}

	getBaseUrl(credentials: ZhipuaiCredentials): string {
		return ``
	}

	getAuthorization(credentials: ZhipuaiCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: ZhipuaiCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		ZhipuaiProvider,
		{
			provide: ModelProvider,
			useExisting: ZhipuaiProvider
		},
		ZhipuAILargeLanguageModel
	],
	exports: [ZhipuaiProvider]
})
export class ZhipuaiProviderModule {}
