import { AIPermissionsEnum, IApiPrincipal, SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { assistantRuntimeCredential } from './assistant-runtime-compatibility'
import { evaluatePermissions } from '../shared/guards/permission-policy'

function principal(): IApiPrincipal {
	return {
		id: 'technical',
		tenantId: 'tenant',
		type: UserType.COMMUNICATION,
		principalType: 'api_key',
		apiKeyUserId: 'technical',
		resourceScope: { kind: 'assistant', xpertId: 'assistant' },
		apiKey: { token: 'fixture', tenantId: 'tenant', userId: 'technical' }
	}
}
describe('temporary Assistant credential runtime boundary', () => {
	it.each(['api_key', 'client_secret'] as const)('accepts only the runtime operation for roleless %s', (type) => {
		const actor = principal()
		actor.principalType = type
		if (type === 'client_secret') {
			actor.clientSecretBindingType = SecretTokenBindingType.API_KEY
			actor.requestedUserId = actor.id
		}
		expect(evaluatePermissions(actor, [AIPermissionsEnum.CHAT_VIEW]).allowed).toBe(true)
		for (const permission of [
			AIPermissionsEnum.XPERT_VIEW,
			AIPermissionsEnum.XPERT_EDIT,
			AIPermissionsEnum.XPERT_WORKSPACE_MANAGE
		])
			expect(evaluatePermissions(actor, [permission]).allowed).toBe(false)
		expect(evaluatePermissions(actor, [AIPermissionsEnum.CHAT_VIEW, AIPermissionsEnum.XPERT_EDIT]).allowed).toBe(
			false
		)
		expect(actor.role).toBeUndefined()
	})
	it.each([
		[
			'disabled',
			(actor: IApiPrincipal) => {
				actor.isActive = false
			}
		],
		[
			'key tenant',
			(actor: IApiPrincipal) => {
				actor.apiKey.tenantId = 'foreign'
			}
		],
		[
			'key user',
			(actor: IApiPrincipal) => {
				actor.apiKey.userId = 'other'
			}
		],
		[
			'principal user',
			(actor: IApiPrincipal) => {
				actor.apiKeyUserId = 'other'
			}
		],
		[
			'requested user',
			(actor: IApiPrincipal) => {
				actor.requestedUserId = 'human'
			}
		],
		[
			'revoked',
			(actor: IApiPrincipal) => {
				actor.apiKey.revokedAt = new Date()
			}
		],
		[
			'expired',
			(actor: IApiPrincipal) => {
				actor.apiKey.validUntil = new Date(0)
			}
		],
		[
			'expired secret',
			(actor: IApiPrincipal) => {
				actor.clientSecretExpiresAt = new Date(0)
			}
		],
		[
			'missing key',
			(actor: IApiPrincipal) => {
				delete actor.apiKey
			}
		],
		[
			'empty audience',
			(actor: IApiPrincipal) => {
				actor.resourceScope = { kind: 'assistant', xpertId: '' }
			}
		]
	] as const)('denies %s', (_name, mutate) => {
		const actor = principal()
		mutate(actor)
		expect(assistantRuntimeCredential(actor)).toEqual({ allowed: false })
		expect(evaluatePermissions(actor, [AIPermissionsEnum.CHAT_VIEW]).allowed).toBe(false)
	})
	it('does not infer runtime authority from an unbound technical account or a human', () => {
		const actor = principal()
		delete actor.resourceScope
		expect(assistantRuntimeCredential(actor)).toBeNull()
		expect(evaluatePermissions(actor, [AIPermissionsEnum.CHAT_VIEW]).allowed).toBe(false)
		actor.resourceScope = { kind: 'assistant', xpertId: 'assistant' }
		actor.type = UserType.USER
		expect(assistantRuntimeCredential(actor)).toBeNull()
		expect(evaluatePermissions(actor, [AIPermissionsEnum.CHAT_VIEW]).allowed).toBe(false)
	})
})
