import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { SiliconflowLargeLanguageModel } from './llm/llm'
import { SiliconflowCredentials } from './types'

@Injectable()
export class SiliconflowProvider extends ModelProvider {
	constructor() {
		super('siliconflow')
	}

	getBaseUrl(credentials: SiliconflowCredentials): string {
		return ``
	}

	getAuthorization(credentials: SiliconflowCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: SiliconflowCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		SiliconflowProvider,
		{
			provide: ModelProvider,
			useExisting: SiliconflowProvider
		},
		SiliconflowLargeLanguageModel
	],
	exports: [SiliconflowProvider]
})
export class SiliconflowProviderModule {}
