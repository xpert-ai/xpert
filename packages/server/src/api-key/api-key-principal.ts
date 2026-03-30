import {
  API_PRINCIPAL_USER_ID_HEADER,
  ApiPrincipalType,
  IApiKey,
  IApiPrincipal,
  IUser,
  RequestScopeLevel,
  UserType
} from '@metad/contracts'
import type { IncomingMessage } from 'http'

export function buildApiKeyPrincipal(
  apiKey: IApiKey & { createdBy?: IUser | null },
  options?: {
    principalType?: ApiPrincipalType
    actingUser?: IUser | null
    requestedUserId?: string | null
  }
): IApiPrincipal {
  const actingUser = options?.actingUser ?? apiKey.user ?? apiKey.createdBy ?? null

  return {
    ...(actingUser ?? {}),
    id: actingUser?.id ?? apiKey.userId ?? apiKey.createdById ?? null,
    tenantId: actingUser?.tenantId ?? apiKey.tenantId,
    type: actingUser?.type ?? UserType.COMMUNICATION,
    apiKey,
    ownerUserId: apiKey.createdById ?? apiKey.createdBy?.id ?? null,
    apiKeyUserId: apiKey.userId ?? apiKey.user?.id ?? null,
    requestedUserId: options?.requestedUserId ?? null,
    principalType: options?.principalType ?? 'api_key'
  }
}

export function resolveApiKeyRequestedUserId(req: IncomingMessage) {
  return readRequestValue(req.headers?.[API_PRINCIPAL_USER_ID_HEADER])
}

export function applyTenantScopeHeaders(req: IncomingMessage) {
  if (!req?.headers) {
    return
  }

  delete req.headers['organization-id']
  req.headers['x-scope-level'] = RequestScopeLevel.TENANT
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
