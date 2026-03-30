import { BadRequestException } from '@nestjs/common'
import cls from 'cls-hooked'
import { RequestContext } from './request-context'

const TENANT_SCOPE = 'tenant'
const ORGANIZATION_SCOPE = 'organization'

describe('RequestContext scope parsing', () => {
  function runInContext<T>(
    req: {
      headers?: Record<string, string>
      user?: { id?: string; tenantId?: string }
    },
    callback: () => T
  ): T {
    let result: T
    let error: unknown
    const session =
      cls.getNamespace(RequestContext.name) ||
      cls.createNamespace(RequestContext.name)

    session.run(() => {
      session.set(RequestContext.name, new RequestContext(req as any, null as any))
      try {
        result = callback()
      } catch (err) {
        error = err
      }
    })

    if (error) {
      throw error
    }

    return result
  }

  it('parses explicit tenant scope from headers', () => {
    const scope = runInContext(
      {
        headers: {
          'tenant-id': 'tenant-1',
          'x-scope-level': TENANT_SCOPE
        },
        user: {
          tenantId: 'tenant-1'
        }
      },
      () => RequestContext.getScope()
    )

    expect(scope).toEqual({
      tenantId: 'tenant-1',
      level: TENANT_SCOPE,
      organizationId: null
    })
  })

  it('falls back to organization scope when only Organization-Id is provided', () => {
    const scope = runInContext(
      {
        headers: {
          'tenant-id': 'tenant-1',
          'organization-id': 'org-1'
        },
        user: {
          tenantId: 'tenant-1'
        }
      },
      () => RequestContext.getScope()
    )

    expect(scope).toEqual({
      tenantId: 'tenant-1',
      level: ORGANIZATION_SCOPE,
      organizationId: 'org-1'
    })
  })

  it('rejects conflicting tenant scope headers', () => {
    expect(() =>
      runInContext(
        {
          headers: {
            'tenant-id': 'tenant-1',
            'organization-id': 'org-1',
            'x-scope-level': TENANT_SCOPE
          },
          user: {
            tenantId: 'tenant-1'
          }
        },
        () => RequestContext.getScope()
      )
    ).toThrow(BadRequestException)
  })

  it('requires Organization-Id for explicit organization scope', () => {
    expect(() =>
      runInContext(
        {
          headers: {
            'tenant-id': 'tenant-1',
            'x-scope-level': ORGANIZATION_SCOPE
          },
          user: {
            tenantId: 'tenant-1'
          }
        },
        () => RequestContext.requireOrganizationScope()
      )
    ).toThrow(BadRequestException)
  })
})
