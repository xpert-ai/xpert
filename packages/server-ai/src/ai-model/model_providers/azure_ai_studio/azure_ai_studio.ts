import { ConfigModule } from '@metad/server-config'
import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { NotImplementedError } from '../errors'

@Injectable()
export class AzureAIStudioProvider extends ModelProvider {
	constructor() {
		super('azure_ai_studio')
	}

	getBaseUrl(credentials: Record<string, any>): string {
		return null
	}

	getAuthorization(credentials: Record<string, any>): string {
		return null
	}

	async validateProviderCredentials(credentials: Record<string, any>): Promise<void> {
		throw new NotImplementedError()
	}
}

@Module({
	imports: [ConfigModule],
	providers: [AzureAIStudioProvider],
	exports: [AzureAIStudioProvider]
})
export class AzureAIStudioProviderModule {}
