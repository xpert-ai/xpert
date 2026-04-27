import { RequestContext } from '@xpert-ai/server-core'

export type BusinessPrincipal = {
  tenantId: string
  organizationId: string
  userId: string
}

type BusinessPrincipalInput =
  | {
      tenantId?: unknown
      organizationId?: unknown
      userId?: unknown
    }
  | null
  | undefined

export function requireCurrentBusinessPrincipal(): BusinessPrincipal {
  const apiPrincipal = RequestContext.currentApiPrincipal()
  if (apiPrincipal) {
    return requireBusinessPrincipal(
      {
        tenantId: RequestContext.currentTenantId(),
        organizationId: readString(apiPrincipal.requestedOrganizationId),
        userId: readString(apiPrincipal.requestedUserId)
      },
      'API principal'
    )
  }

  return requireBusinessPrincipal(
    {
      tenantId: RequestContext.currentTenantId(),
      organizationId: RequestContext.getOrganizationId(),
      userId: RequestContext.currentUserId()
    },
    'request context'
  )
}

export function requireBusinessPrincipal(
  input: BusinessPrincipalInput,
  source = 'business principal'
): BusinessPrincipal {
  const principal = {
    tenantId: readString(input?.tenantId),
    organizationId: readString(input?.organizationId),
    userId: readString(input?.userId)
  }
  const missing = Object.entries(principal)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length) {
    throw new Error(`Missing BusinessPrincipal from ${source}: ${missing.join('/')}`)
  }

  return principal as BusinessPrincipal
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
