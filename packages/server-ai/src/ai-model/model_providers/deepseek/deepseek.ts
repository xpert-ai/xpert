import { AiModelTypeEnum } from '@metad/contracts'
import { ConfigModule } from '@metad/server-config'
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { PROVIDE_AI_MODEL_LLM } from '../../types/types'
import { CredentialsValidateFailedError } from '../errors'
import { DeepseekLargeLanguageModel } from './llm/llm'
import { DeepseekCredentials, toCredentialKwargs } from './types'

/**
 * @deprecated This provider has been migrated to xpert-plugins project.
 * 此提供商已迁移到 xpert-plugins 项目。
 */
@Injectable()
export class DeepseekProvider extends ModelProvider {
	constructor() {
		super('deepseek')
	}

	getBaseUrl(credentials: DeepseekCredentials): string {
		const params = toCredentialKwargs(credentials)
		return params.configuration.baseURL
	}

	getAuthorization(credentials: DeepseekCredentials): string {
		return `Bearer ${credentials.api_key}`
	}

	async validateProviderCredentials(credentials: DeepseekCredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			// 使用 `deepseek-chat` 模型进行验证，
			// 无论您传入什么模型，文本补全模型或聊天模型
			await modelInstance.validateCredentials('deepseek-chat', credentials)
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

/**
 * @deprecated This module has been migrated to xpert-plugins project.
 * 此模块已迁移到 xpert-plugins 项目。
 */
@Module({
	imports: [ConfigModule],
	providers: [
		DeepseekProvider,
		{
			provide: ModelProvider,
			useExisting: DeepseekProvider
		},
		{
			provide: PROVIDE_AI_MODEL_LLM,
			useClass: DeepseekLargeLanguageModel
		}
	],
	exports: [DeepseekProvider]
})
export class DeepseekProviderModule {}
