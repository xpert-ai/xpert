import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { SparkLargeLanguageModel } from './llm/llm'
import { SparkCredentials } from './types'

@Injectable()
export class SparkProvider extends ModelProvider {
	constructor() {
		super('spark')
	}

	getBaseUrl(credentials: SparkCredentials): string {
		return ``
	}

	getAuthorization(credentials: SparkCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: SparkCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		SparkProvider,
		{
			provide: ModelProvider,
			useExisting: SparkProvider
		},
		SparkLargeLanguageModel
	],
	exports: [SparkProvider]
})
export class SparkProviderModule {}
