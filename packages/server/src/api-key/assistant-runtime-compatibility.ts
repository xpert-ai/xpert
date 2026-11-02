import { IApiPrincipal, IUser, SecretTokenBindingType, UserType } from '@xpert-ai/contracts'

export type AssistantRuntimeCredential =
	| { allowed: false }
	| {
			allowed: true
			assistantId: string
			userId: string
			tenantId: string
			organizationId: string | null
			ownerUserId: string
	  }

// Temporary host-only compatibility; replace with the proposed operation authorization layer.
// This checks authenticated credential identity, not the live Assistant ACL or published state.
// Design and removal plan: docs/zh-Hans/proposals/principal-runtime-authorization.mdx.
export function assistantRuntimeCredential(user?: IUser | null): AssistantRuntimeCredential | null {
	if (user?.type !== UserType.COMMUNICATION || !('principalType' in user)) return null
	const principal = user as IApiPrincipal
	if (principal.resourceScope?.kind !== 'assistant') return null
	if (
		principal.principalType !== 'api_key' &&
		!(
			principal.principalType === 'client_secret' &&
			principal.clientSecretBindingType === SecretTokenBindingType.API_KEY
		)
	)
		return null
	const key = principal.apiKey
	const now = Date.now()
	if (
		!user.id ||
		!user.tenantId ||
		user.isActive === false ||
		!key ||
		key.userId !== user.id ||
		principal.apiKeyUserId !== user.id ||
		key.tenantId !== user.tenantId ||
		key.revokedAt ||
		key.expired ||
		(key.validUntil && !(new Date(key.validUntil).getTime() > now)) ||
		(principal.clientSecretExpiresAt && !(new Date(principal.clientSecretExpiresAt).getTime() > now)) ||
		(principal.requestedUserId && principal.requestedUserId !== user.id) ||
		!principal.resourceScope.xpertId?.trim()
	)
		return { allowed: false }
	return {
		allowed: true,
		assistantId: principal.resourceScope.xpertId.trim(),
		userId: user.id,
		tenantId: user.tenantId,
		organizationId: key.organizationId ?? null,
		ownerUserId: principal.ownerUserId?.trim() || user.id
	}
}
