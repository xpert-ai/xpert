import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { CohereLargeLanguageModel } from './llm/llm'
import { CohereCredentials } from './types'

@Injectable()
export class CohereProvider extends ModelProvider {
	constructor() {
		super('cohere')
	}

	getBaseUrl(credentials: CohereCredentials): string {
		return credentials.base_url
	}

	getAuthorization(credentials: CohereCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: CohereCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		CohereProvider,
		{
			provide: ModelProvider,
			useExisting: CohereProvider
		},
		CohereLargeLanguageModel
	],
	exports: [CohereProvider]
})
export class CohereProviderModule {}
