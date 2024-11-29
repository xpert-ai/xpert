import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { HuggingfaceHubLargeLanguageModel } from './llm/llm'
import { HuggingfaceHubCredentials } from './types'

@Injectable()
export class HuggingfaceHubProvider extends ModelProvider {
	constructor() {
		super('huggingface_hub')
	}

	getBaseUrl(credentials: HuggingfaceHubCredentials): string {
		return ``
	}

	getAuthorization(credentials: HuggingfaceHubCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: HuggingfaceHubCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		HuggingfaceHubProvider,
		{
			provide: ModelProvider,
			useExisting: HuggingfaceHubProvider
		},
		HuggingfaceHubLargeLanguageModel
	],
	exports: [HuggingfaceHubProvider]
})
export class HuggingfaceHubProviderModule {}
