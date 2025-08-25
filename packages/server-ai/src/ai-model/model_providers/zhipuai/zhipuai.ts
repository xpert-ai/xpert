import { AiModelTypeEnum } from '@metad/contracts'
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { PROVIDE_AI_MODEL_TEXT_EMBEDDING } from '../../types/types'
import { CredentialsValidateFailedError } from '../errors'
import { ZhipuAILargeLanguageModel } from './llm/llm'
import { ZhipuaiTextEmbeddingModel } from './text-embedding/text-embedding'
import { ZhipuaiCredentials } from './types'

@Injectable()
export class ZhipuaiProvider extends ModelProvider {
	constructor() {
		super('zhipuai')
	}

	getBaseUrl(credentials: ZhipuaiCredentials): string {
		return `https://open.bigmodel.cn/api/paas/v4/`
	}

	getAuthorization(credentials: ZhipuaiCredentials): string {
		return `Bearer ${credentials.api_key}`
	}

	async validateProviderCredentials(credentials: ZhipuaiCredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
			await modelInstance.validateCredentials('glm-4-flash', credentials)
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
		ZhipuaiProvider,
		{
			provide: ModelProvider,
			useExisting: ZhipuaiProvider
		},
		ZhipuAILargeLanguageModel,
		{
			provide: PROVIDE_AI_MODEL_TEXT_EMBEDDING,
			useClass: ZhipuaiTextEmbeddingModel
		}
	],
	exports: [ZhipuaiProvider]
})
export class ZhipuaiProviderModule {}
