import { Injectable, Module } from '@nestjs/common'
import { AiModelTypeEnum } from '@metad/contracts'
import { ModelProvider } from '../../ai-provider'
import { toCredentialKwargs, XinferenceCredentials } from './types'
import { CredentialsValidateFailedError } from '../errors'
import { PROVIDE_AI_MODEL_TEXT_EMBEDDING } from '../../types/types'
import { XinferenceLargeLanguageModel } from './llm/llm'
import { XinferenceTextEmbeddingModel } from './text-embedding/text-embedding'

@Injectable()
export class XinferenceProvider extends ModelProvider {
	constructor() {
		super('xinference')
	}

	getBaseUrl(credentials: XinferenceCredentials): string {
		const params = toCredentialKwargs(credentials)
		return params.configuration.baseURL
	}

	getAuthorization(credentials: XinferenceCredentials): string {
		return `Bearer ${credentials.api_key}`
	}

	async validateProviderCredentials(credentials: XinferenceCredentials): Promise<void> {
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
		XinferenceProvider,
		{
			provide: ModelProvider,
			useExisting: XinferenceProvider
		},
		XinferenceLargeLanguageModel,
		{
			provide: PROVIDE_AI_MODEL_TEXT_EMBEDDING,
			useClass: XinferenceTextEmbeddingModel
		}
	],
	exports: [XinferenceProvider]
})
export class XinferenceProviderModule {}
