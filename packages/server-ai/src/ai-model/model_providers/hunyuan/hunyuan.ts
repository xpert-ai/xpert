import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { HunyuanLargeLanguageModel } from './llm/llm'
import { HunyuanCredentials } from './types'

@Injectable()
export class HunyuanProvider extends ModelProvider {
	constructor() {
		super('hunyuan')
	}

	getBaseUrl(credentials: HunyuanCredentials): string {
		return ``
	}

	getAuthorization(credentials: HunyuanCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: HunyuanCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		HunyuanProvider,
		{
			provide: ModelProvider,
			useExisting: HunyuanProvider
		},
		HunyuanLargeLanguageModel
	],
	exports: [HunyuanProvider]
})
export class HunyuanProviderModule {}
