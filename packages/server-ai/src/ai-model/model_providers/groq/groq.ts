import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { GroqLargeLanguageModel } from './llm/llm'
import { GroqCredentials } from './types'

@Injectable()
export class GroqProvider extends ModelProvider {
	constructor() {
		super('groq')
	}

	getBaseUrl(credentials: GroqCredentials): string {
		return ``
	}

	getAuthorization(credentials: GroqCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: GroqCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		GroqProvider,
		{
			provide: ModelProvider,
			useExisting: GroqProvider
		},
		GroqLargeLanguageModel
	],
	exports: [GroqProvider]
})
export class GroqProviderModule {}
