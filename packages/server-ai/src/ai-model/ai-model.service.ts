import { Injectable, Inject } from '@nestjs/common'
import { ModelProvider } from './ai-provider'
import { AIProviderRegistry } from './registry'
import { ProviderCredentialSchemaValidator } from './schema_validators/'
import { ConfigService } from '@metad/server-config'
import * as path from 'path'
import { ModelProvidersFolderPath } from './types/types'
import { getPositionMap } from '../core/utils'

@Injectable()
export class AIProvidersService {
	@Inject(ConfigService)
	protected readonly configService: ConfigService

	private registry = AIProviderRegistry.getInstance()

	private positions: Record<string, number> = null

	getProvider(name: string): ModelProvider | undefined {
		return this.registry.getProvider(name)
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
		// 获取提供者实例
		const modelProviderInstance = this.getProvider(provider)

		// 获取提供者模式
		const providerSchema = modelProviderInstance.getProviderSchema()

		// 获取 provider_credential_schema 并根据规则验证凭据
		const providerCredentialSchema = providerSchema.provider_credential_schema

		if (!providerCredentialSchema) {
			throw new Error(`Provider ${provider} does not have provider_credential_schema`)
		}

		// 验证提供者凭据模式
		const validator = new ProviderCredentialSchemaValidator(providerCredentialSchema)
		const filteredCredentials = validator.validateAndFilter(credentials)

		// 验证凭据，如果验证失败则抛出异常
		await modelProviderInstance.validateProviderCredentials(filteredCredentials)

		return filteredCredentials
	}
}
