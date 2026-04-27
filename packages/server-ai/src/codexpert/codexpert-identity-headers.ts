import { BusinessPrincipal, requireBusinessPrincipal } from '../shared/identity'

export function buildCodexpertIdentityHeaders(principal: BusinessPrincipal): Record<string, string> {
  const businessPrincipal = requireBusinessPrincipal(principal, 'Codexpert identity headers')
  return {
    'tenant-id': businessPrincipal.tenantId,
    'organization-id': businessPrincipal.organizationId,
    'x-principal-user-id': businessPrincipal.userId
  }
}
