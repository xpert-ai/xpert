import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { TogetherAILargeLanguageModel } from './llm/llm'
import { TogetherAICredentials } from './types'

@Injectable()
export class TogetherAIProvider extends ModelProvider {
	constructor() {
		super('togetherai')
	}

	getBaseUrl(credentials: TogetherAICredentials): string {
		return ``
	}

	getAuthorization(credentials: TogetherAICredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: TogetherAICredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		TogetherAIProvider,
		{
			provide: ModelProvider,
			useExisting: TogetherAIProvider
		},
		TogetherAILargeLanguageModel
	],
	exports: [TogetherAIProvider]
})
export class TogetherAIProviderModule {}
