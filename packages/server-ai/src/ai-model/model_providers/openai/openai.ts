import { ModelType } from '@metad/contracts'
import { ConfigModule } from '@metad/server-config'
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { PROVIDE_AI_MODEL_LLM, PROVIDE_AI_MODEL_TEXT_EMBEDDING } from '../../types/types'
import { CredentialsValidateFailedError } from '../errors'
import { OpenAILargeLanguageModel } from './llm/llm'
import { OpenAITextEmbeddingModel } from './text-embedding/text-embedding'

@Injectable()
export class OpenAIProvider extends ModelProvider {
	constructor() {
		super('openai')
	}

	async validateProviderCredentials(credentials: Record<string, any>): Promise<void> {
		try {
			const modelInstance = this.getModelManager(ModelType.LLM)

			// 使用 `gpt-3.5-turbo` 模型进行验证，
			// 无论您传入什么模型，文本补全模型或聊天模型
			await modelInstance.validateCredentials('gpt-3.5-turbo', credentials)
		} catch (ex) {
			if (ex instanceof CredentialsValidateFailedError) {
				throw ex
			} else {
				this.logger.error(`${this.getProviderSchema().provider} 凭证验证失败`, ex.stack)
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
