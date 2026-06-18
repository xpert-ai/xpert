import { IIntegration, IPagination } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { IntegrationPermissionService, PluginWebhookCredentialResult } from '@xpert-ai/plugin-sdk'
import { FindManyOptions, FindOneOptions } from 'typeorm'
import { IntegrationService } from '../../integration/integration.service'
import { Integration } from '../../core/entities/internal'
import { PLUGIN_WEBHOOK_CREDENTIAL_SERVICE_TOKEN } from '../plugin-webhook.tokens'

type PluginWebhookCredentialServiceLike = {
	ensureCredential(
		id: string,
		options?: {
			provider?: string | null
			rotateIfRevoked?: boolean
		}
	): Promise<PluginWebhookCredentialResult>
	rotateCredential(
		id: string,
		options?: {
			provider?: string | null
		}
	): Promise<PluginWebhookCredentialResult>
	revokeCredential(
		id: string,
		options?: {
			provider?: string | null
		}
	): Promise<boolean>
}

@Injectable()
export class PluginIntegrationPermissionService implements IntegrationPermissionService {
	constructor(private readonly moduleRef: ModuleRef) {}

	async read<TIntegration = IIntegration>(
		id: string,
		options?: FindOneOptions<Integration>
	): Promise<TIntegration | null> {
		if (!id) {
			return null
		}

		let integrationService: IntegrationService
		try {
			integrationService = this.moduleRef.get<IntegrationService>(IntegrationService, {
				strict: false
			})
		} catch {
			return null
		}
		if (!integrationService) {
			return null
		}

		try {
			return (await integrationService.readOneById(id, options)) as TIntegration
		} catch {
			return null
		}
	}

	async ensureWebhookCredential(
		id: string,
		options?: {
			provider?: string | null
			rotateIfRevoked?: boolean
		}
	): Promise<PluginWebhookCredentialResult | null> {
		const service = this.resolveWebhookCredentialService()
		if (!id || !service) {
			return null
		}
		try {
			return await service.ensureCredential(id, options)
		} catch {
			return null
		}
	}

	async rotateWebhookCredential(
		id: string,
		options?: {
			provider?: string | null
		}
	): Promise<PluginWebhookCredentialResult | null> {
		const service = this.resolveWebhookCredentialService()
		if (!id || !service) {
			return null
		}
		try {
			return await service.rotateCredential(id, options)
		} catch {
			return null
		}
	}

	async revokeWebhookCredential(
		id: string,
		options?: {
			provider?: string | null
		}
	): Promise<boolean> {
		const service = this.resolveWebhookCredentialService()
		if (!id || !service) {
			return false
		}
		try {
			return await service.revokeCredential(id, options)
		} catch {
			return false
		}
	}

	private resolveIntegrationService(): IntegrationService | null {
		try {
			return this.moduleRef.get<IntegrationService>(IntegrationService, {
				strict: false
			})
		} catch {
			return null
		}
	}

	private resolveWebhookCredentialService(): PluginWebhookCredentialServiceLike | null {
		try {
			return this.moduleRef.get<PluginWebhookCredentialServiceLike>(PLUGIN_WEBHOOK_CREDENTIAL_SERVICE_TOKEN, {
				strict: false
			})
		} catch {
			return null
		}
	}

	async findAll<TIntegration = IIntegration>(
		options?: FindManyOptions<Integration>
	): Promise<IPagination<TIntegration>> {
		const integrationService = this.resolveIntegrationService()
		if (!integrationService) {
			return { items: [], total: 0 }
		}

		try {
			const result = await integrationService.findAll(options)
			return {
				items: (result?.items ?? []) as TIntegration[],
				total: result?.total ?? 0
			}
		} catch {
			return { items: [], total: 0 }
		}
	}
}
