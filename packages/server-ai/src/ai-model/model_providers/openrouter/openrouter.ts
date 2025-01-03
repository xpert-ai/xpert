import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { AiModelTypeEnum } from '@metad/contracts'
import { ConfigModule } from '@metad/server-config'
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { PROVIDE_AI_MODEL_LLM } from '../../types/types'
import { CredentialsValidateFailedError } from '../errors'
import { OpenRouterLargeLanguageModel } from './llm/llm'
import { OpenRouterAiBaseUrl, OpenRouterCredentials } from './types'

@Injectable()
export class OpenRouterProvider extends ModelProvider {
	constructor() {
		super('openrouter')
	}

	getBaseUrl(credentials: OpenRouterCredentials): string {
		return OpenRouterAiBaseUrl
	}

	getAuthorization(credentials: OpenRouterCredentials): string {
		const kwags = this.toCredentialKwargs(credentials)
		return `Bearer ${kwags.apiKey}`
	}

	async validateProviderCredentials(credentials: OpenRouterCredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			await modelInstance.validateCredentials('openai/gpt-3.5-turbo', {
				...credentials,
				api_base: OpenRouterAiBaseUrl
			})
		} catch (ex) {
			if (ex instanceof CredentialsValidateFailedError) {
				throw ex
			} else {
				this.logger.error(`${this.getProviderSchema().provider}: credentials verification failed`, ex.stack)
				throw ex
			}
		}
	}

	toCredentialKwargs(credentials: OpenRouterCredentials) {
		const credentialsKwargs: OpenAIBaseInput = {
			apiKey: credentials.api_key
		} as OpenAIBaseInput
		const configuration: ClientOptions = {}

		configuration.baseURL = OpenRouterAiBaseUrl

		return {
			...credentialsKwargs,
			configuration
		}
	}
}

@Module({
	imports: [ConfigModule],
	providers: [
		OpenRouterProvider,
		{
			provide: ModelProvider,
			useExisting: OpenRouterProvider
		},
		{
			provide: PROVIDE_AI_MODEL_LLM,
			useClass: OpenRouterLargeLanguageModel
		}
	],
	exports: [ModelProvider, OpenRouterProvider]
})
export class OpenRouterProviderModule {}
