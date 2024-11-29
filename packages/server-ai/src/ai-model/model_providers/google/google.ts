import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { GoogleLargeLanguageModel } from './llm/llm'
import { GoogleCredentials } from './types'

@Injectable()
export class GoogleProvider extends ModelProvider {
	constructor() {
		super('google')
	}

	getBaseUrl(credentials: GoogleCredentials): string {
		return ``
	}

	getAuthorization(credentials: GoogleCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: GoogleCredentials): Promise<void> {
		return
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
