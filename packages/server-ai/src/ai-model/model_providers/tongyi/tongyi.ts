
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { TongyiLargeLanguageModel } from './llm/llm'
import { toCredentialKwargs, TongyiCredentials } from './types'
import { AiModelTypeEnum } from '@metad/contracts'
import { CredentialsValidateFailedError } from '../errors'
import { PROVIDE_AI_MODEL_TEXT_EMBEDDING, PROVIDE_AI_MODEL_TTS } from '../../types/types'
import { TongyiTextEmbeddingModel } from './text-embedding/text-embedding'
import { TongyiTTSModel } from './tts/tts'

@Injectable()
export class TongyiProvider extends ModelProvider {
	constructor() {
		super('tongyi')
	}

	getBaseUrl(credentials: TongyiCredentials): string {
		const params = toCredentialKwargs(credentials)
		return params.configuration.baseURL
	}

	getAuthorization(credentials: TongyiCredentials): string {
		return `Bearer ${credentials.dashscope_api_key}`
	}

	async validateProviderCredentials(credentials: TongyiCredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			await modelInstance.validateCredentials('qwen-turbo', credentials)
		} catch (ex) {
			if (ex instanceof CredentialsValidateFailedError) {
				throw ex
			} else {
				this.logger.error(`${this.getProviderSchema().provider}: credentials verification failed`, ex.stack)
				throw ex
			}
		}
	}
}

@Module({
	providers: [
		TongyiProvider,
		{
			provide: ModelProvider,
			useExisting: TongyiProvider
		},
		TongyiLargeLanguageModel,
		{
			provide: PROVIDE_AI_MODEL_TEXT_EMBEDDING,
			useClass: TongyiTextEmbeddingModel
		},
		{
			provide: PROVIDE_AI_MODEL_TTS,
			useClass: TongyiTTSModel
		}
	],
	exports: [TongyiProvider]
})
export class TongyiProviderModule {}
