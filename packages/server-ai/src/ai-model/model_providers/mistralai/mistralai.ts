import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { MistralAILargeLanguageModel } from './llm/llm'
import { MistralAICredentials } from './types'

@Injectable()
export class MistralAIProvider extends ModelProvider {
	constructor() {
		super('mistralai')
	}

	getBaseUrl(credentials: MistralAICredentials): string {
		return ``
	}

	getAuthorization(credentials: MistralAICredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: MistralAICredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		MistralAIProvider,
		{
			provide: ModelProvider,
			useExisting: MistralAIProvider
		},
		MistralAILargeLanguageModel
	],
	exports: [MistralAIProvider]
})
export class MistralAIProviderModule {}
