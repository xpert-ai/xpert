import { ApiKeyBindingType } from '@xpert-ai/contracts'
import { UnauthorizedException } from '@nestjs/common'
import { ApiKeyService } from '../api-key/api-key.service'
import { IntegrationService } from '../integration/integration.service'
import { PluginWebhookCredentialService } from './plugin-webhook-credential.service'

describe('PluginWebhookCredentialService', () => {
	const previousSecret = process.env.XPERT_PLUGIN_WEBHOOK_SECRET

	beforeEach(() => {
		process.env.XPERT_PLUGIN_WEBHOOK_SECRET = 'test-plugin-webhook-secret'
	})

	afterEach(() => {
		if (previousSecret === undefined) {
			delete process.env.XPERT_PLUGIN_WEBHOOK_SECRET
		} else {
			process.env.XPERT_PLUGIN_WEBHOOK_SECRET = previousSecret
		}
		jest.restoreAllMocks()
	})

	it('creates a hash-backed opaque credential without storing the raw token', async () => {
		const integration = createIntegration()
		const update = jest.fn().mockResolvedValue({})
		const service = new PluginWebhookCredentialService(
			{
				readOneById: jest.fn().mockResolvedValue(integration),
				update
			} as unknown as IntegrationService,
			{} as ApiKeyService
		)

		const result = await service.ensureCredential('integration-1', {
			provider: '@xpert-ai/plugin-community-wechat'
		})

		expect(result.token).toMatch(/^pwh_/)
		expect(result.credential.tokenHash).toBeTruthy()
		expect(result.credential.tokenHash).not.toEqual(result.token)
		expect(update).toHaveBeenCalledWith(
			'integration-1',
			expect.objectContaining({
				options: expect.objectContaining({
					webhookCredential: expect.objectContaining({
						id: result.credential.id,
						tokenHash: result.credential.tokenHash,
						revokedAt: null
					})
				})
			})
		)
	})

	it('validates the query secret and resolves an integration api principal', async () => {
		const integration = createIntegration()
		const update = jest.fn().mockResolvedValue({})
		const readOneById = jest.fn().mockResolvedValue(integration)
		const apiKeyService = {
			resolvePrincipal: jest.fn().mockImplementation(async (apiKey) => ({
				id: 'integration-user-1',
				tenantId: 'tenant-1',
				apiKey,
				principalType: 'api_key'
			}))
		}
		const service = new PluginWebhookCredentialService(
			{
				readOneById,
				update
			} as unknown as IntegrationService,
			apiKeyService as unknown as ApiKeyService
		)
		const credential = await service.rotateCredential('integration-1', {
			provider: '@xpert-ai/plugin-community-wechat'
		})
		integration.options = {
			...integration.options,
			webhookCredential: credential.credential
		}

		await expect(
			service.validateSecret('integration-1', credential.token, {
				provider: '@xpert-ai/plugin-community-wechat'
			})
		).resolves.toEqual({
			integration,
			user: expect.objectContaining({
				apiKey: expect.objectContaining({
					type: ApiKeyBindingType.INTEGRATION,
					entityId: 'integration-1',
					tenantId: 'tenant-1',
					organizationId: 'org-1'
				})
			}),
			headers: {
				'tenant-id': 'tenant-1',
				'organization-id': 'org-1',
				'x-scope-level': 'organization'
			}
		})
		expect(apiKeyService.resolvePrincipal).toHaveBeenCalledWith(
			expect.objectContaining({
				token: 'integration-webhook:integration-1',
				type: ApiKeyBindingType.INTEGRATION,
				entityId: 'integration-1'
			}),
			{
				requestedOrganizationId: 'org-1'
			}
		)
	})

	it('rejects revoked credentials', async () => {
		const integration = createIntegration()
		const service = new PluginWebhookCredentialService(
			{
				readOneById: jest.fn().mockResolvedValue(integration),
				update: jest.fn().mockResolvedValue({})
			} as unknown as IntegrationService,
			{} as ApiKeyService
		)
		const credential = await service.rotateCredential('integration-1')
		integration.options = {
			...integration.options,
			webhookCredential: {
				...credential.credential,
				revokedAt: new Date().toISOString()
			}
		}

		await expect(service.validateSecret('integration-1', credential.token)).rejects.toBeInstanceOf(
			UnauthorizedException
		)
	})
})

function createIntegration() {
	return {
		id: 'integration-1',
		name: 'Personal WeChat',
		slug: 'wechat',
		provider: '@xpert-ai/plugin-community-wechat',
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		createdById: 'owner-1',
		userId: 'integration-user-1',
		user: {
			id: 'integration-user-1',
			tenantId: 'tenant-1'
		},
		options: {}
	} as any
}
