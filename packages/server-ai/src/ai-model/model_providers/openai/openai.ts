import { AiModelTypeEnum } from '@metad/contracts'
import { ConfigModule } from '@metad/server-config'
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { PROVIDE_AI_MODEL_LLM, PROVIDE_AI_MODEL_TEXT_EMBEDDING } from '../../types/types'
import { CredentialsValidateFailedError } from '../errors'
import { OpenAILargeLanguageModel } from './llm/llm'
import { OpenAITextEmbeddingModel } from './text-embedding/text-embedding'
import { OpenAICredentials, toCredentialKwargs } from './types'


@Injectable()
export class OpenAIProvider extends ModelProvider {
	constructor() {
		super('openai')
	}

	getBaseUrl(credentials: OpenAICredentials): string {
		const kwags = toCredentialKwargs(credentials)
		return kwags.configuration.baseURL || `https://api.openai.com/v1`
	}

	getAuthorization(credentials: OpenAICredentials): string {
		const kwags = toCredentialKwargs(credentials)
		return `Bearer ${kwags.apiKey}`
	}

	async validateProviderCredentials(credentials: OpenAICredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			// 使用 `gpt-3.5-turbo` 模型进行验证，
			// 无论您传入什么模型，文本补全模型或聊天模型
			await modelInstance.validateCredentials('gpt-3.5-turbo', credentials)
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
	imports: [ConfigModule],
	providers: [
		OpenAIProvider,
		{
			provide: ModelProvider,
			useExisting: OpenAIProvider
		},
		{
			provide: PROVIDE_AI_MODEL_LLM,
			useClass: OpenAILargeLanguageModel
		},
		{
			provide: PROVIDE_AI_MODEL_TEXT_EMBEDDING,
			useClass: OpenAITextEmbeddingModel
		}
	],
	exports: [ModelProvider, OpenAIProvider]
})
export class OpenAIProviderModule {}
