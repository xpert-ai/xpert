import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { MoonshotLargeLanguageModel } from './llm/llm'
import { MoonshotCredentials } from './types'

@Injectable()
export class MoonshotProvider extends ModelProvider {
	constructor() {
		super('moonshot')
	}

	getBaseUrl(credentials: MoonshotCredentials): string {
		return ``
	}

	getAuthorization(credentials: MoonshotCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: MoonshotCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		MoonshotProvider,
		{
			provide: ModelProvider,
			useExisting: MoonshotProvider
		},
		MoonshotLargeLanguageModel
	],
	exports: [MoonshotProvider]
})
export class MoonshotProviderModule {}
