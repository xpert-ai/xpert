import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { AgentMiddlewareRegistry, RequestContext, setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { ClientEffectMiddleware } from './client-effect.middleware'
import { HumanInTheLoopMiddleware } from './human-in-the-loop.middleware'
import { LLMToolSelectorNameMiddleware } from './llm-tool-selector.middleware'
import { StructuredOutputMiddleware } from './structured-output.middleware'
import { SummarizationMiddleware } from './summarization.middleware'
import { TodoListMiddleware } from './todo-list.middleware'

describe('built-in agent middleware registry scope', () => {
    beforeEach(() => {
        jest.restoreAllMocks()
        setDefaultTenantId(null)
    })

    it('exposes built-in middlewares to non-default tenants', () => {
        setDefaultTenantId('tenant-default')

        const registry = new AgentMiddlewareRegistry({} as any, new Reflector())
        const builtinMiddlewares = [
            new HumanInTheLoopMiddleware(),
            new ClientEffectMiddleware(),
            new LLMToolSelectorNameMiddleware(),
            new StructuredOutputMiddleware(),
            new SummarizationMiddleware(),
            new TodoListMiddleware()
        ]

        for (const middleware of builtinMiddlewares) {
            registry.upsert(middleware)
        }

        jest.spyOn(RequestContext, 'getScope').mockReturnValue({
            tenantId: 'tenant-other',
            level: 'organization',
            organizationId: 'org-other'
        } as any)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-other')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-other')

        for (const middleware of builtinMiddlewares) {
            expect(registry.get(middleware.meta.name, 'org-other')).toBe(middleware)
            expect(registry.list('org-other')).toContain(middleware)
        }
    })
})
