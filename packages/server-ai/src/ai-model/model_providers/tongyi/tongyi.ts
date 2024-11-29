
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { TongyiLargeLanguageModel } from './llm/llm'
import { TongyiCredentials } from './types'

@Injectable()
export class TongyiProvider extends ModelProvider {
	constructor() {
		super('tongyi')
	}

	getBaseUrl(credentials: TongyiCredentials): string {
		return ``
	}

	getAuthorization(credentials: TongyiCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: TongyiCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		TongyiProvider,
		{
			provide: ModelProvider,
			useExisting: TongyiProvider
		},
		TongyiLargeLanguageModel
	],
	exports: [TongyiProvider]
})
export class TongyiProviderModule {}
