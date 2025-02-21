import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { VolcengineMaaSLargeLanguageModel } from './llm/llm'
import { VolcengineMaaSCredentials } from './types'

@Injectable()
export class VolcengineMaaSProvider extends ModelProvider {
	constructor() {
		super('volcengine_maas')
	}

	getBaseUrl(credentials: VolcengineMaaSCredentials): string {
		return ``
	}

	getAuthorization(credentials: VolcengineMaaSCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: VolcengineMaaSCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		VolcengineMaaSProvider,
		{
			provide: ModelProvider,
			useExisting: VolcengineMaaSProvider
		},
		VolcengineMaaSLargeLanguageModel
	],
	exports: [VolcengineMaaSProvider]
})
export class VolcengineMaaSProviderModule {}
