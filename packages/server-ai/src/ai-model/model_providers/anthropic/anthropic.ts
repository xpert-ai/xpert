import { AiModelTypeEnum } from '@metad/contracts'
import { ConfigModule } from '@metad/server-config'
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { PROVIDE_AI_MODEL_LLM } from '../../types/types'
import { CredentialsValidateFailedError } from '../errors'
import { AnthropicLargeLanguageModel } from './llm/llm'
import { AnthropicCredentials } from './types'

@Injectable()
export class AnthropicProvider extends ModelProvider {
	constructor() {
		super('anthropic')
	}

	getBaseUrl(credentials: AnthropicCredentials): string {
		return credentials.anthropic_api_url || `https://api.anthropic.com/v1`
	}

	getAuthorization(credentials: AnthropicCredentials): string {
		return `Bearer ${credentials.anthropic_api_key}`
	}

	async validateProviderCredentials(credentials: AnthropicCredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			// 使用 `claude-3-sonnet-20240229` 模型进行验证，
			// 无论您传入什么模型，文本补全模型或聊天模型
			await modelInstance.validateCredentials('claude-3-sonnet-20240229', credentials)
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
