jest.mock('@xpert-ai/server-core', () => ({
  RequestContext: {
    currentApiPrincipal: jest.fn(),
    currentTenantId: jest.fn(),
    getOrganizationId: jest.fn(),
    currentUserId: jest.fn()
  }
}))

import { RequestContext } from '@xpert-ai/server-core'
import { requireBusinessPrincipal, requireCurrentBusinessPrincipal } from './business-principal'

describe('BusinessPrincipal', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('uses API requested principal as one complete source', () => {
    ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
      requestedUserId: 'user-1',
      requestedOrganizationId: 'org-1'
    })
    ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('api-key-owner')
    ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('owner-org')

    expect(requireCurrentBusinessPrincipal()).toEqual({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    })
  })

  it('fails API principal instead of falling back to current user', () => {
    ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
      requestedOrganizationId: 'org-1'
    })
    ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('api-key-owner')

    expect(() => requireCurrentBusinessPrincipal()).toThrow('Missing BusinessPrincipal from API principal: userId')
  })

  it('uses ordinary request context as one complete source', () => {
    ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(null)
    ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
    ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

    expect(requireCurrentBusinessPrincipal()).toEqual({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    })
  })

  it('fails when any required field is missing', () => {
    expect(() =>
      requireBusinessPrincipal(
        {
          tenantId: 'tenant-1',
          userId: 'user-1'
        },
        'test'
      )
    ).toThrow('Missing BusinessPrincipal from test: organizationId')
  })
})
