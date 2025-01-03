import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { PROVIDE_AI_MODEL_LLM } from '../../types/types'
import { OpenAICompatCredentials } from './types'
import { OAIAPICompatLargeLanguageModel } from './llm/llm'

@Injectable()
export class OAICompatProvider extends ModelProvider {
    constructor() {
		super('openai_api_compatible')
	}

	getAuthorization(credentials: OpenAICompatCredentials): string {
		throw new Error('Method not implemented.')
	}
	getBaseUrl(credentials: OpenAICompatCredentials): string {
		throw new Error('Method not implemented.')
	}
	validateProviderCredentials(credentials: OpenAICompatCredentials): Promise<void> {
		return
	}
}


@Module({
	imports: [],
	providers: [
		OAICompatProvider,
		{
			provide: ModelProvider,
			useExisting: OAICompatProvider
		},
		{
			provide: PROVIDE_AI_MODEL_LLM,
			useClass: OAIAPICompatLargeLanguageModel
		}
	],
	exports: [ModelProvider, OAICompatProvider]
})
export class OAICompatProviderModule {}
