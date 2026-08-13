import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { Test } from '@nestjs/testing'
import { AgentEvolutionAppService } from './agent-evolution-app.service'
import { AgentEvolutionMiddleware } from './agent-evolution.middleware'
import { AGENT_EVOLUTION_OPEN_TOOL, AGENT_EVOLUTION_PROVIDER_KEY, AGENT_EVOLUTION_STATUS_TOOL } from './constants'

describe('AgentEvolutionMiddleware', () => {
    it('exposes observation-only tools and never exposes the human simulation/approval action', async () => {
        const getStatus = jest.fn(async () => ({ candidateCount: 1, activeReleaseCount: 1 }))
        const moduleRef = await Test.createTestingModule({
            providers: [AgentEvolutionMiddleware, { provide: AgentEvolutionAppService, useValue: { getStatus } }]
        }).compile()
        const strategy = moduleRef.get(AgentEvolutionMiddleware)
        const context = {
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'agent-1'
        } as IAgentMiddlewareContext
        const middleware = strategy.createMiddleware({}, context)

        expect(strategy.meta.name).toBe(AGENT_EVOLUTION_PROVIDER_KEY)
        expect(middleware.tools?.map((item) => item.name)).toEqual([
            AGENT_EVOLUTION_OPEN_TOOL,
            AGENT_EVOLUTION_STATUS_TOOL
        ])
        expect(middleware.tools?.map((item) => item.name)).not.toContain('run_conformance_simulation')
        const statusTool = middleware.tools?.find((item) => item.name === AGENT_EVOLUTION_STATUS_TOOL)
        const result = await statusTool?.invoke({})
        expect(JSON.parse(String(result))).toEqual({ candidateCount: 1, activeReleaseCount: 1 })
        expect(getStatus).toHaveBeenCalledWith({ tenantId: 'tenant-1', organizationId: 'org-1' }, undefined)
    })
})
