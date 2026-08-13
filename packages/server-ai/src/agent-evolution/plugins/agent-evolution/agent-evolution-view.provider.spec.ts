import { AIPermissionsEnum, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { Test } from '@nestjs/testing'
import { AgentEvolutionAppService } from './agent-evolution-app.service'
import { AgentEvolutionViewProvider, getRemoteAssetPath } from './agent-evolution-view.provider'
import { AGENT_EVOLUTION_REMOTE_ENTRY_KEY, AGENT_EVOLUTION_VIEW_KEY, AGENT_WORKBENCH_FIXED_SLOT } from './constants'

describe('AgentEvolutionViewProvider', () => {
    const context: XpertResolvedViewHostContext = {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'agent-1',
        slots: [{ key: AGENT_WORKBENCH_FIXED_SLOT, mode: 'sections' }]
    }

    it('declares a permission-scoped fixed Workbench and governed simulation action', async () => {
        const provider = await createProvider()
        const [manifest] = provider.getViewManifests(context, AGENT_WORKBENCH_FIXED_SLOT)

        expect(manifest).toEqual(
            expect.objectContaining({
                key: AGENT_EVOLUTION_VIEW_KEY,
                permissions: [AIPermissionsEnum.EVOLUTION_VIEW],
                workbench: expect.objectContaining({ fixed: true }),
                view: expect.objectContaining({
                    type: 'remote_component',
                    component: { isolation: 'iframe', entry: AGENT_EVOLUTION_REMOTE_ENTRY_KEY }
                })
            })
        )
        expect(manifest.actions?.find((action) => action.key === 'run_conformance_simulation')).toEqual(
            expect.objectContaining({
                permissions: [AIPermissionsEnum.EVOLUTION_MANAGE],
                confirm: expect.objectContaining({ title: expect.any(Object), message: expect.any(Object) })
            })
        )
    })

    it('routes simulation through the App service and requests a refresh', async () => {
        const runSimulation = jest.fn(async () => ({ simulationId: 'sim-1' }))
        const provider = await createProvider({ runSimulation })

        const result = await provider.executeViewAction(
            context,
            AGENT_EVOLUTION_VIEW_KEY,
            'run_conformance_simulation',
            { input: {}, parameters: {} }
        )

        expect(runSimulation).toHaveBeenCalledWith(context)
        expect(result).toEqual(
            expect.objectContaining({ success: true, refresh: true, data: { simulationId: 'sim-1' } })
        )
    })

    it('resolves colocated and production remote assets deterministically', () => {
        expect(
            getRemoteAssetPath('app.js', {
                nodeEnv: 'development',
                moduleDir: '/workspace/packages/server-ai/src/agent-evolution/plugins/agent-evolution',
                cwd: '/workspace'
            })
        ).toBe(
            '/workspace/packages/server-ai/src/agent-evolution/plugins/agent-evolution/remote-components/agent-evolution/app.js'
        )
        expect(
            getRemoteAssetPath('app.js', {
                nodeEnv: 'production',
                moduleDir: '/srv/xpert',
                cwd: '/srv/xpert'
            })
        ).toBe(
            '/srv/xpert/packages/server-ai/src/agent-evolution/plugins/agent-evolution/remote-components/agent-evolution/app.js'
        )
    })
})

async function createProvider(
    overrides: { runSimulation?: (context: XpertResolvedViewHostContext) => Promise<object> } = {}
) {
    const app = {
        getViewData: jest.fn(async () => ({ items: [], total: 0, summary: {} })),
        runSimulation: overrides.runSimulation ?? jest.fn(async () => ({ simulationId: 'sim-default' }))
    }
    const moduleRef = await Test.createTestingModule({
        providers: [AgentEvolutionViewProvider, { provide: AgentEvolutionAppService, useValue: app }]
    }).compile()
    return moduleRef.get(AgentEvolutionViewProvider)
}
