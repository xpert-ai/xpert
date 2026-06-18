import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { ApiKeyBindingType, IApiKey, IApiPrincipal, IIntegration } from '@xpert-ai/contracts'
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import {
	PluginWebhookAuthRequest,
	PluginWebhookAuthResult,
	PluginWebhookCredentialRecord,
	PluginWebhookCredentialResult
} from '@xpert-ai/plugin-sdk'
import { environment as env } from '@xpert-ai/server-config'
import { ApiKeyService } from '../api-key/api-key.service'
import { Integration } from '../integration/integration.entity'
import { IntegrationService } from '../integration/integration.service'

const TOKEN_PREFIX = 'pwh'
const WEBHOOK_CREDENTIAL_OPTION_KEY = 'webhookCredential'

type WebhookCredentialOptions = {
	provider?: string | null
	rotateIfRevoked?: boolean
}

type WebhookCredentialContext = {
	integration: Integration
	user: IApiPrincipal
	headers: Record<string, string>
}

@Injectable()
export class PluginWebhookCredentialService {
	constructor(
		private readonly integrationService: IntegrationService,
		private readonly apiKeyService: ApiKeyService
	) {}

	async ensureCredential(
		integrationId: string,
		options?: WebhookCredentialOptions
	): Promise<PluginWebhookCredentialResult> {
		const integration = await this.readIntegration(integrationId, options)
		const existing = this.normalizeCredential(integration.options?.[WEBHOOK_CREDENTIAL_OPTION_KEY])
		if (existing?.revokedAt && !options?.rotateIfRevoked) {
			throw new UnauthorizedException('Plugin webhook credential is revoked')
		}
		if (existing && !existing.revokedAt) {
			const token = this.deriveToken(integration.id, existing)
			if (!this.compareHash(this.hashToken(token), existing.tokenHash)) {
				return this.rotateCredential(integration.id, options)
			}
			return {
				token,
				credential: existing
			}
		}

		return this.rotateCredential(integration.id, options)
	}

	async rotateCredential(
		integrationId: string,
		options?: WebhookCredentialOptions
	): Promise<PluginWebhookCredentialResult> {
		const integration = await this.readIntegration(integrationId, options)
		const createdAt = new Date().toISOString()
		const credentialBase: PluginWebhookCredentialRecord = {
			id: randomUUID(),
			tokenHash: '',
			tokenPrefix: TOKEN_PREFIX,
			createdAt,
			rotatedAt: createdAt,
			revokedAt: null
		}
		const token = this.deriveToken(integration.id, credentialBase)
		const credential: PluginWebhookCredentialRecord = {
			...credentialBase,
			tokenHash: this.hashToken(token)
		}

		await this.saveCredential(integration, credential)
		return {
			token,
			credential
		}
	}

	async revokeCredential(integrationId: string, options?: WebhookCredentialOptions): Promise<boolean> {
		const integration = await this.readIntegration(integrationId, options)
		const existing = this.normalizeCredential(integration.options?.[WEBHOOK_CREDENTIAL_OPTION_KEY])
		if (!existing || existing.revokedAt) {
			return true
		}

		await this.saveCredential(integration, {
			...existing,
			revokedAt: new Date().toISOString()
		})
		return true
	}

	async validateSecret(
		integrationId: string,
		secret: string,
		options?: WebhookCredentialOptions
	): Promise<WebhookCredentialContext> {
		const token = this.normalizeSecret(secret)
		if (!token) {
			throw new UnauthorizedException('Plugin webhook secret is required')
		}

		const integration = await this.readIntegration(integrationId, options, ['user'])
		const credential = this.normalizeCredential(integration.options?.[WEBHOOK_CREDENTIAL_OPTION_KEY])
		if (!credential || credential.revokedAt) {
			throw new UnauthorizedException('Plugin webhook credential is not active')
		}
		if (!this.compareHash(this.hashToken(token), credential.tokenHash)) {
			throw new UnauthorizedException('Plugin webhook secret is invalid')
		}

		const user = await this.resolvePrincipal(integration)
		return {
			integration,
			user,
			headers: this.buildPrincipalHeaders(integration)
		}
	}

	async validateWebhookSecret(input: PluginWebhookAuthRequest): Promise<PluginWebhookAuthResult> {
		const context = await this.validateSecret(input.integrationId, input.secret, {
			provider: input.provider
		})
		return {
			user: context.user,
			headers: context.headers
		}
	}

	private async readIntegration(
		integrationId: string,
		options?: WebhookCredentialOptions,
		relations: string[] = []
	): Promise<Integration> {
		const id = typeof integrationId === 'string' ? integrationId.trim() : ''
		if (!id) {
			throw new BadRequestException('Plugin webhook integration id is required')
		}

		const integration = await this.integrationService.readOneById(id, {
			relations
		})
		if (!integration?.id) {
			throw new NotFoundException(`Plugin webhook integration '${id}' was not found`)
		}

		const provider = typeof options?.provider === 'string' ? options.provider.trim() : ''
		if (provider && integration.provider !== provider) {
			throw new UnauthorizedException('Plugin webhook provider mismatch')
		}

		return integration
	}

	private async saveCredential(integration: Integration, credential: PluginWebhookCredentialRecord): Promise<void> {
		const options = {
			...(integration.options ?? {}),
			[WEBHOOK_CREDENTIAL_OPTION_KEY]: credential
		}
		await this.integrationService.update(integration.id, {
			options
		} as Partial<IIntegration>)
		integration.options = options
	}

	private async resolvePrincipal(integration: Integration): Promise<IApiPrincipal> {
		if (!integration.id || !integration.tenantId) {
			throw new UnauthorizedException('Plugin webhook integration principal is incomplete')
		}

		const apiKey = {
			token: `integration-webhook:${integration.id}`,
			name: integration.name || integration.slug || integration.id,
			type: ApiKeyBindingType.INTEGRATION,
			entityId: integration.id,
			tenantId: integration.tenantId,
			organizationId: integration.organizationId ?? null,
			createdById: integration.createdById,
			userId: integration.userId,
			user: integration.user
		} as IApiKey & { createdById?: string | null }

		return this.apiKeyService.resolvePrincipal(apiKey, {
			requestedOrganizationId: integration.organizationId ?? null
		})
	}

	private buildPrincipalHeaders(
		integration: Pick<Integration, 'tenantId' | 'organizationId'>
	): Record<string, string> {
		const tenantId = typeof integration.tenantId === 'string' ? integration.tenantId.trim() : ''
		const organizationId = typeof integration.organizationId === 'string' ? integration.organizationId.trim() : ''
		const headers: Record<string, string> = {
			'tenant-id': tenantId,
			'x-scope-level': organizationId ? 'organization' : 'tenant'
		}
		if (organizationId) {
			headers['organization-id'] = organizationId
		}
		return headers
	}

	private normalizeCredential(value: unknown): PluginWebhookCredentialRecord | null {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return null
		}

		const id = this.getString(value, 'id')
		const tokenHash = this.getString(value, 'tokenHash')
		const createdAt = this.getString(value, 'createdAt')
		if (!id || !tokenHash || !createdAt) {
			return null
		}

		return {
			id,
			tokenHash,
			tokenPrefix: this.getString(value, 'tokenPrefix') || TOKEN_PREFIX,
			createdAt,
			rotatedAt: this.getString(value, 'rotatedAt'),
			revokedAt: this.getString(value, 'revokedAt')
		}
	}

	private getString(value: object, key: string): string | null {
		const candidate = Reflect.get(value, key)
		if (typeof candidate !== 'string') {
			return null
		}
		const trimmed = candidate.trim()
		return trimmed || null
	}

	private normalizeSecret(value: unknown): string {
		if (typeof value !== 'string') {
			return ''
		}
		return value.trim()
	}

	private deriveToken(integrationId: string, credential: Pick<PluginWebhookCredentialRecord, 'id' | 'createdAt'>) {
		const material = `${integrationId}:${credential.id}:${credential.createdAt}`
		const signature = createHmac('sha256', this.getSecretKey()).update(material).digest('base64url')
		return `${TOKEN_PREFIX}_${credential.id}_${signature.slice(0, 43)}`
	}

	private hashToken(token: string): string {
		return createHash('sha256').update(token).digest('base64url')
	}

	private compareHash(actual: string, expected: string): boolean {
		const actualBuffer = Buffer.from(actual)
		const expectedBuffer = Buffer.from(expected)
		if (actualBuffer.length !== expectedBuffer.length) {
			return false
		}
		return timingSafeEqual(actualBuffer, expectedBuffer)
	}

	private getSecretKey(): string {
		return (
			process.env.XPERT_PLUGIN_WEBHOOK_SECRET ||
			process.env.JWT_SECRET ||
			env.JWT_SECRET ||
			env.EXPRESS_SESSION_SECRET ||
			process.env.EXPRESS_SESSION_SECRET ||
			'xpert-plugin-webhook-development-secret'
		)
	}
}
