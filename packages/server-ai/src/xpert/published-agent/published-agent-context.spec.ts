import { WorkflowNodeTypeEnum, XpertTypeEnum, type IXpert } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { PublishedAgentContextHandler, PublishedAgentContextQuery } from './published-agent-context.query'

function fixture() {
    const xpert = {
        id: 'requester',
        name: 'Neutral assistant',
        slug: 'neutral',
        type: XpertTypeEnum.Agent,
        version: '3',
        publishAt: new Date(),
        active: true,
        organizationId: 'organization',
        agent: { key: 'primary' },
        options: {
            templateSource: { templateId: 'neutral', pluginName: '@neutral/plugin', templateKey: 'neutral-assistant' }
        },
        graph: {
            nodes: [
                {
                    type: 'agent',
                    key: 'primary',
                    entity: { key: 'primary', prompt: 'private prompt' },
                    position: { x: 0, y: 0 }
                },
                {
                    type: 'workflow',
                    key: 'connected',
                    entity: { type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: 'connected' },
                    position: { x: 0, y: 0 }
                },
                {
                    type: 'workflow',
                    key: 'unconnected',
                    entity: { type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: 'unconnected' },
                    position: { x: 0, y: 0 }
                }
            ],
            connections: [{ type: 'workflow', key: 'connection', from: 'primary', to: 'connected' }]
        },
        draft: { team: { name: 'draft-feature' }, nodes: [], connections: [] }
    } as IXpert
    const access = { getAccessiblePublishedXpert: jest.fn(async () => xpert) }
    const registry = { get: jest.fn(() => ({ meta: { features: ['neutral.feature'] } })) }
    const handler = new PublishedAgentContextHandler(
        access as unknown as PublishedXpertAccessService,
        registry as unknown as AgentMiddlewareRegistry
    )
    return { handler, access, registry, xpert }
}
it('projects only the published primary Agent and connected middleware with no prompts or draft grants', async () => {
    const f = fixture(),
        result = await f.handler.execute(new PublishedAgentContextQuery('requester'))
    expect(result).toMatchObject({
        primaryAgentKey: 'primary',
        publishedVersion: '3',
        templateSource: { pluginName: '@neutral/plugin', templateKey: 'neutral-assistant' },
        features: ['neutral.feature', 'platform.conversation-map']
    })
    expect(f.access.getAccessiblePublishedXpert).toHaveBeenCalledWith('requester', { relations: ['agent'] })
    expect(f.registry.get).toHaveBeenCalledTimes(1)
    expect(f.registry.get).toHaveBeenCalledWith('connected', 'organization')
    expect(JSON.stringify(result)).not.toContain('private prompt')
    expect(JSON.stringify(result)).not.toContain('draft-feature')
})
it('fails closed for missing middleware and preserves access denial', async () => {
    const f = fixture()
    f.registry.get.mockImplementation(() => {
        throw new Error('not loaded')
    })
    expect((await f.handler.execute(new PublishedAgentContextQuery('requester'))).features).toEqual([
        'platform.conversation-map'
    ])
    f.access.getAccessiblePublishedXpert.mockRejectedValueOnce(new Error('access revoked'))
    await expect(f.handler.execute(new PublishedAgentContextQuery('requester'))).rejects.toThrow('access revoked')
})
it.each(['inactive', 'unpublished'])('does not grant capabilities from an %s Assistant', async (state) => {
    const f = fixture()
    if (state === 'inactive') f.xpert.active = false
    else f.xpert.publishAt = null
    await expect(f.handler.execute(new PublishedAgentContextQuery('requester'))).rejects.toThrow()
    expect(f.registry.get).not.toHaveBeenCalled()
})
