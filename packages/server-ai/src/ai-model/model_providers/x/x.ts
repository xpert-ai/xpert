import { AiModelTypeEnum } from '@metad/contracts'
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { CredentialsValidateFailedError } from '../errors'
import { XAILargeLanguageModel } from './llm/llm'
import { XAICredentials, toCredentialKwargs } from './types'

@Injectable()
export class XAIProvider extends ModelProvider {
	constructor() {
		super('x')
	}

	getBaseUrl(credentials: XAICredentials): string {
		// const kwags = toCredentialKwargs(credentials)
		return `https://api.x.ai`
	}

	getAuthorization(credentials: XAICredentials): string {
		const kwags = toCredentialKwargs(credentials)
		return `Bearer ${kwags.apiKey}`
	}

	async validateProviderCredentials(credentials: XAICredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			await modelInstance.validateCredentials('grok-beta', credentials)
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
		XAIProvider,
		{
			provide: ModelProvider,
			useExisting: XAIProvider
		},
		XAILargeLanguageModel
	],
	exports: [XAIProvider]
})
export class XAIProviderModule {}
