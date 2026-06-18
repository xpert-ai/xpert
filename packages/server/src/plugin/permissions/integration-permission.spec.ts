import { IntegrationService } from '../../integration/integration.service'
import { PLUGIN_WEBHOOK_CREDENTIAL_SERVICE_TOKEN } from '../plugin-webhook.tokens'
import { PluginIntegrationPermissionService } from './integration-permission'

describe('PluginIntegrationPermissionService', () => {
	it('delegates webhook credential operations to the host webhook credential service', async () => {
		const credentialResult = {
			token: 'pwh_credential_secret',
			credential: {
				id: 'credential-1',
				tokenHash: 'token-hash',
				createdAt: new Date(0).toISOString()
			}
		}
		const webhookCredentialService = {
			ensureCredential: jest.fn().mockResolvedValue(credentialResult),
			rotateCredential: jest.fn().mockResolvedValue({
				...credentialResult,
				token: 'pwh_rotated_secret'
			}),
			revokeCredential: jest.fn().mockResolvedValue(true)
		}
		const moduleRef = {
			get: jest.fn((token) => {
				if (token === PLUGIN_WEBHOOK_CREDENTIAL_SERVICE_TOKEN) {
					return webhookCredentialService
				}
				throw new Error('provider not found')
			})
		}
		const service = new PluginIntegrationPermissionService(moduleRef as never)

		await expect(
			service.ensureWebhookCredential('integration-1', {
				provider: 'wechat_personal',
				rotateIfRevoked: true
			})
		).resolves.toBe(credentialResult)
		await expect(
			service.rotateWebhookCredential('integration-1', {
				provider: 'wechat_personal'
			})
		).resolves.toEqual(expect.objectContaining({ token: 'pwh_rotated_secret' }))
		await expect(
			service.revokeWebhookCredential('integration-1', {
				provider: 'wechat_personal'
			})
		).resolves.toBe(true)

		expect(webhookCredentialService.ensureCredential).toHaveBeenCalledWith('integration-1', {
			provider: 'wechat_personal',
			rotateIfRevoked: true
		})
		expect(webhookCredentialService.rotateCredential).toHaveBeenCalledWith('integration-1', {
			provider: 'wechat_personal'
		})
		expect(webhookCredentialService.revokeCredential).toHaveBeenCalledWith('integration-1', {
			provider: 'wechat_personal'
		})
	})

	it('returns null or false when the webhook credential service is unavailable', async () => {
		const moduleRef = {
			get: jest.fn(() => {
				throw new Error('provider not found')
			})
		}
		const service = new PluginIntegrationPermissionService(moduleRef as never)

		await expect(service.ensureWebhookCredential('integration-1')).resolves.toBeNull()
		await expect(service.rotateWebhookCredential('integration-1')).resolves.toBeNull()
		await expect(service.revokeWebhookCredential('integration-1')).resolves.toBe(false)
	})

	it('still exposes scoped integration reads for plugin configuration flows', async () => {
		const integration = {
			id: 'integration-1',
			provider: 'wechat_personal'
		}
		const integrationService = {
			readOneById: jest.fn().mockResolvedValue(integration),
			findAll: jest.fn().mockResolvedValue({
				items: [integration],
				total: 1
			})
		}
		const moduleRef = {
			get: jest.fn((token) => {
				if (token === IntegrationService) {
					return integrationService
				}
				throw new Error('provider not found')
			})
		}
		const service = new PluginIntegrationPermissionService(moduleRef as never)

		await expect(service.read('integration-1')).resolves.toBe(integration)
		await expect(service.findAll({ where: { provider: 'wechat_personal' } })).resolves.toEqual({
			items: [integration],
			total: 1
		})
	})
})
