import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { PROVIDE_AI_MODEL_LLM, PROVIDE_AI_MODEL_TEXT_EMBEDDING } from '../../types/types'
import { OpenAICompatCredentials } from './types'
import { OAIAPICompatLargeLanguageModel } from './llm/llm'
import { OAIAPICompatTextEmbeddingModel } from './text-embedding/text-embedding'

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
		},
		{
			provide: PROVIDE_AI_MODEL_TEXT_EMBEDDING,
			useClass: OAIAPICompatTextEmbeddingModel
		}
	],
	exports: [ModelProvider, OAICompatProvider]
})
export class OAICompatProviderModule {}
