import { AiModelTypeEnum } from '@metad/contracts'
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { CredentialsValidateFailedError } from '../errors'
import { GoogleLargeLanguageModel } from './llm/llm'
import { GoogleCredentials, toCredentialKwargs } from './types'

@Injectable()
export class GoogleProvider extends ModelProvider {
	constructor() {
		super('google')
	}

	getBaseUrl(credentials: GoogleCredentials): string {
		const kwags = toCredentialKwargs(credentials)
		return kwags.baseUrl || `https://generativelanguage.googleapis.com`
	}

	getAuthorization(credentials: GoogleCredentials): string {
		const kwags = toCredentialKwargs(credentials)
		return `Bearer ${kwags.apiKey}`
	}

	async validateProviderCredentials(credentials: GoogleCredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			await modelInstance.validateCredentials('gemini-1.5-flash', credentials)
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
		GoogleProvider,
		{
			provide: ModelProvider,
			useExisting: GoogleProvider
		},
		GoogleLargeLanguageModel
	],
	exports: [GoogleProvider]
})
export class GoogleProviderModule {}
