import {
	API_PRINCIPAL_USER_ID_HEADER,
	ApiPrincipalType,
	ApiPrincipalResourceScope,
	ApiKeyBindingType,
	IApiKey,
	IApiPrincipal,
	IUser,
	RequestScopeLevel,
	UserType
} from '@xpert-ai/contracts'
import { UnauthorizedException } from '@nestjs/common'
import type { IncomingMessage } from 'http'

export function buildApiKeyPrincipal(
	apiKey: IApiKey & { createdBy?: IUser | null },
	options?: {
		principalType?: ApiPrincipalType
		actingUser?: IUser | null
		requestedUserId?: string | null
		requestedOrganizationId?: string | null
	}
): IApiPrincipal {
	const actingUser = options?.actingUser ?? apiKey.user ?? apiKey.createdBy ?? null

	return {
		...(actingUser ?? {}),
		id: actingUser?.id ?? apiKey.userId ?? apiKey.createdById ?? null,
		tenantId: actingUser?.tenantId ?? apiKey.tenantId,
		type: actingUser?.type ?? UserType.COMMUNICATION,
		apiKey,
		resourceScope: resourceScopeFromApiKey(apiKey),
		ownerUserId: apiKey.createdById ?? apiKey.createdBy?.id ?? null,
		apiKeyUserId: apiKey.userId ?? apiKey.user?.id ?? null,
		requestedUserId: options?.requestedUserId ?? null,
		requestedOrganizationId: options?.requestedOrganizationId ?? null,
		principalType: options?.principalType ?? 'api_key'
	}
}

export function resolveApiKeyRequestedUserId(req: IncomingMessage) {
	return readRequestValue(req.headers?.[API_PRINCIPAL_USER_ID_HEADER])
}

export function resolveApiKeyRequestedOrganizationId(req: IncomingMessage) {
	return readRequestValue(req.headers?.['organization-id'])
}

export function applyTenantScopeHeaders(req: IncomingMessage) {
	if (!req?.headers) {
		return
	}

	delete req.headers['organization-id']
	req.headers['x-scope-level'] = RequestScopeLevel.TENANT
}

export function applyRequestedOrganizationScopeHeaders(req: IncomingMessage, requestedOrganizationId?: string | null) {
	const organizationId = readRequestValue(requestedOrganizationId)
	if (!req?.headers || !organizationId) {
		applyTenantScopeHeaders(req)
		return
	}

	req.headers['organization-id'] = organizationId
	req.headers['x-scope-level'] = RequestScopeLevel.ORGANIZATION
}

function readRequestValue(value: unknown) {
	if (Array.isArray(value)) {
		return value.map(readRequestValue).find(Boolean) ?? null
	}

	if (typeof value !== 'string') {
		return null
	}

	const normalized = value.trim()
	return normalized || null
}

/**
 * Authentication/queue restoration boundary only. Translate persisted key bindings
 * once; domain authorization must not fall back to deprecated apiKey.type/entityId.
 * Integration and client bindings describe technical identities, not resource audiences.
 */
export function resourceScopeFromApiKey(
	apiKey: Pick<IApiKey, 'type' | 'entityId'>
): ApiPrincipalResourceScope | undefined {
	if (apiKey.type !== ApiKeyBindingType.ASSISTANT && apiKey.type !== ApiKeyBindingType.WORKSPACE) return undefined
	const id = apiKey.entityId?.trim()
	if (!id) throw new UnauthorizedException()
	return apiKey.type === ApiKeyBindingType.ASSISTANT
		? { kind: 'assistant', xpertId: id }
		: { kind: 'workspace', workspaceId: id }
}
