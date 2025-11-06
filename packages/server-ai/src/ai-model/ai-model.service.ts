import { AIModelProviderRegistry, IAIModelProviderStrategy } from '@xpert-ai/plugin-sdk'
import { ConfigService } from '@metad/server-config'
import { Injectable, Inject } from '@nestjs/common'
import * as path from 'path'
import { ModelProvider } from './ai-provider'
import { AIProviderRegistry } from './registry'
import { ProviderCredentialSchemaValidator } from './schema_validators/'
import { ModelProvidersFolderPath } from './types/types'
import { getPositionMap } from '../core/utils'

@Injectable()
export class AIProvidersService {
	@Inject(ConfigService)
	protected readonly configService: ConfigService

	@Inject(AIModelProviderRegistry)
	private readonly strategyRegistry: AIModelProviderRegistry

	private registry = AIProviderRegistry.getInstance()

	private positions: Record<string, number> = null

	getProvider(name: string, throwError = false): IAIModelProviderStrategy | undefined {
		const provider = this.registry.getProvider(name)
		if (!provider) {
			try {
			    return this.strategyRegistry.get(name)
			} catch (error) {
				if (throwError) {
				    throw new Error(`AI Model Provider strategy not found for provider: ${name}`)
				}
			}
		}
		return provider
	}

	getAllProviders(): ModelProvider[] {
		return this.registry.getAllProviders()
	}

	getPositionMap() {
		if (!this.positions) {
			const positionFolder = path.join(this.configService.assetOptions.serverRoot, ModelProvidersFolderPath)
			this.positions = getPositionMap(positionFolder)
		}

		return this.positions
	}

	async providerCredentialsValidate(provider: string, credentials: Record<string, any>): Promise<Record<string, any>> {
		// Get the provider instance
		const modelProviderInstance = this.getProvider(provider)

		// Get the provider schema
		const providerSchema = modelProviderInstance.getProviderSchema()

		// Get provider_credential_schema and validate credentials according to the rules
		const providerCredentialSchema = providerSchema.provider_credential_schema

		if (!providerCredentialSchema) {
			throw new Error(`Provider ${provider} does not have provider_credential_schema`)
		}

		// Validate the provider credential schema
		const validator = new ProviderCredentialSchemaValidator(providerCredentialSchema)
		const filteredCredentials = validator.validateAndFilter(credentials)

		// Validate credentials, throw an exception if validation fails
		await modelProviderInstance.validateProviderCredentials(filteredCredentials)

		return filteredCredentials
	}
}
