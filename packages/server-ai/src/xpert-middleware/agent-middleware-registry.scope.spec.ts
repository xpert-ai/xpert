import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { AgentMiddlewareRegistry, RequestContext, setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { HumanInTheLoopMiddleware } from './human-in-the-loop.middleware'

describe('built-in agent middleware registry scope', () => {
    beforeEach(() => {
        jest.restoreAllMocks()
        setDefaultTenantId(null)
    })

    it('exposes built-in middlewares to non-default tenants', () => {
        setDefaultTenantId('tenant-default')

        const registry = new AgentMiddlewareRegistry({} as any, new Reflector())
        const builtinMiddleware = new HumanInTheLoopMiddleware()

        registry.upsert(builtinMiddleware)

        jest.spyOn(RequestContext, 'getScope').mockReturnValue({
            tenantId: 'tenant-other',
            level: 'organization',
            organizationId: 'org-other'
        } as any)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-other')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-other')

        expect(registry.get(builtinMiddleware.meta.name, 'org-other')).toBe(builtinMiddleware)
        expect(registry.list('org-other')).toContain(builtinMiddleware)
    })
})
