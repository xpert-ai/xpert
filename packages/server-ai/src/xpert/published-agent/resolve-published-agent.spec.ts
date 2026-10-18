import type { IXpert } from '@xpert-ai/contracts'
import { resolvePublishedAgent } from './resolve-published-agent'

const expectation = {
    pluginName: '@xpert-ai/plugin-bid',
    templateKey: 'bid-assistant',
    agentKey: 'Agent_BidCompanyExpert'
}
function fixture() {
    const requester = {
        id: 'commercial',
        tenantId: 'tenant',
        organizationId: 'organization',
        workspaceId: 'workspace',
        publishAt: new Date(),
        active: true
    } as IXpert
    const candidate = {
        ...requester,
        id: 'main',
        options: { templateSource: { templateId: 'bid', ...expectation } },
        graph: {
            nodes: [
                {
                    type: 'agent',
                    key: expectation.agentKey,
                    entity: { key: expectation.agentKey },
                    position: { x: 0, y: 0 }
                }
            ],
            connections: []
        }
    } as IXpert
    const access = {
        getAccessiblePublishedXpert: jest.fn(async () => requester),
        findAccessiblePublishedResources: jest.fn(async () => [candidate])
    }
    return { requester, candidate, access, input: { requesterXpertId: 'commercial', expectation } }
}

describe('published internal Agent routing', () => {
    it('finds the company expert in the accessible main Assistant rather than the commercial page Assistant', async () => {
        const h = fixture()
        await expect(resolvePublishedAgent(h.access as never, h.input)).resolves.toEqual({
            xpertId: 'main',
            workspaceId: 'workspace',
            agentKey: expectation.agentKey
        })
        expect(h.access.findAccessiblePublishedResources).toHaveBeenCalledWith(
            'commercial',
            expect.objectContaining({
                where: { workspaceId: 'workspace', organizationId: 'organization', latest: true }
            })
        )
    })
    it('uses the current published Assistant when it already supplies the Agent', async () => {
        const h = fixture()
        h.access.getAccessiblePublishedXpert.mockResolvedValue(h.candidate)
        await resolvePublishedAgent(h.access as never, h.input)
        expect(h.access.findAccessiblePublishedResources).not.toHaveBeenCalled()
    })
    it.each(['tenantId', 'organizationId', 'workspaceId'] as const)(
        'rejects another %s even if a catalog returns it',
        async (key) => {
            const h = fixture()
            h.candidate[key] = 'other'
            await expect(resolvePublishedAgent(h.access as never, h.input)).rejects.toThrow(
                'assistant_agent_unavailable'
            )
        }
    )
    it('rejects unpublished nodes and ignores draft-only additions', async () => {
        const h = fixture()
        h.candidate.draft = { nodes: h.candidate.graph.nodes, connections: [] } as IXpert['draft']
        h.candidate.graph.nodes = []
        await expect(resolvePublishedAgent(h.access as never, h.input)).rejects.toThrow('unavailable')
    })
    it('never picks an arbitrary assistant when two matches exist', async () => {
        const h = fixture()
        h.access.findAccessiblePublishedResources.mockResolvedValue([h.candidate, { ...h.candidate, id: 'other' }])
        await expect(resolvePublishedAgent(h.access as never, h.input)).rejects.toThrow('ambiguous')
    })
    it('preserves requester access denial', async () => {
        const h = fixture()
        h.access.getAccessiblePublishedXpert.mockRejectedValue(Error('forbidden'))
        await expect(resolvePublishedAgent(h.access as never, h.input)).rejects.toThrow('forbidden')
        expect(h.access.findAccessiblePublishedResources).not.toHaveBeenCalled()
    })
})
