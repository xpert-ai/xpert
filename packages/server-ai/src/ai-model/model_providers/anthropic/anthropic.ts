import { ConfigModule } from '@metad/server-config'
import { Injectable, Module } from '@nestjs/common'
import { PROVIDE_AI_MODEL_LLM } from '../../types/types'
import { ModelProvider } from '../../ai-provider'
import { AnthropicLargeLanguageModel } from './llm/llm'


@Injectable()
export class AnthropicProvider extends ModelProvider {
	constructor() {
		super('anthropic')
	}

	getBaseUrl(credentials: Record<string, any>): string {
		return null
	}

	getAuthorization(credentials: Record<string, any>): string {
		return null
	}

	async validateProviderCredentials(credentials: Record<string, any>): Promise<void> {
		//
	}
}

@Module({
	imports: [ConfigModule],
	providers: [
		AnthropicProvider,
		{
			provide: ModelProvider,
			useExisting: AnthropicProvider
		},
		{
			provide: PROVIDE_AI_MODEL_LLM,
			useClass: AnthropicLargeLanguageModel
		}
	],
	exports: [ModelProvider, AnthropicProvider]
})
export class AnthropicProviderModule {}
