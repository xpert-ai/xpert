import { WORKBENCH_NAVIGATION_OPEN_COMMAND, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import {
    AGENT_WORKBENCH_FIXED_SLOT,
    AGENT_WORKBENCH_MAIN_SLOT,
    KNOWLEDGE_WORKBENCH_FEATURE,
    KNOWLEDGE_WORKBENCH_REMOTE_ENTRY_KEY,
    KNOWLEDGE_WORKBENCH_TOOL_NAMES,
    KNOWLEDGE_WORKBENCH_VIEW_KEY
} from './constants'
import { KnowledgeWorkbenchService } from './knowledge-workbench.service'
import { KnowledgeWorkbenchViewProvider } from './knowledge-workbench-view.provider'

describe('KnowledgeWorkbenchViewProvider', () => {
    const context: XpertResolvedViewHostContext = {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'agent-1',
        slots: [{ key: AGENT_WORKBENCH_MAIN_SLOT, mode: 'sections' }],
        hostState: {
            agent: {
                connections: [{ type: 'knowledgebase', id: 'kb-1' }]
            }
        }
    }

    it('declares a fixed workbench remote component manifest', () => {
        const provider = createProvider()
        const [manifest] = provider.getViewManifests(context, AGENT_WORKBENCH_FIXED_SLOT)

        expect(manifest).toEqual(
            expect.objectContaining({
                key: KNOWLEDGE_WORKBENCH_VIEW_KEY,
                hostType: 'agent',
                slot: AGENT_WORKBENCH_FIXED_SLOT,
                activation: {
                    requiredFeatures: [KNOWLEDGE_WORKBENCH_FEATURE]
                },
                workbench: expect.objectContaining({
                    fixed: true,
                    menu: expect.objectContaining({
                        enabled: true
                    })
                }),
                view: expect.objectContaining({
                    type: 'remote_component',
                    runtime: 'react',
                    component: {
                        isolation: 'iframe',
                        entry: KNOWLEDGE_WORKBENCH_REMOTE_ENTRY_KEY
                    }
                })
            })
        )
        expect(manifest.clientCommands?.map((command) => command.key)).toEqual(
            expect.arrayContaining(['assistant.context.set', 'workbench.file.open', WORKBENCH_NAVIGATION_OPEN_COMMAND])
        )
        expect(manifest.clientCommands?.map((command) => command.key)).not.toContain('assistant.chat.send_message')
        expect(manifest.actions?.find((action) => action.key === 'upload_document')?.transport).toBe('file')
    })

    it('subscribes to knowledge workbench tool completion events', () => {
        const provider = createProvider()
        const [manifest] = provider.getViewManifests(context, AGENT_WORKBENCH_MAIN_SLOT)

        expect(manifest.hostEvents?.subscriptions?.[0]).toEqual(
            expect.objectContaining({
                event: 'assistant.tool.completed',
                filter: {
                    sources: ['chatkit'],
                    toolNames: [...KNOWLEDGE_WORKBENCH_TOOL_NAMES]
                },
                action: {
                    type: 'forward',
                    debounceMs: 1000
                }
            })
        )
    })

    it('loads view data through the knowledge workbench service', async () => {
        const service = createService()
        const provider = createProvider(service)

        const result = await provider.getViewData(context, KNOWLEDGE_WORKBENCH_VIEW_KEY, {
            page: 1,
            pageSize: 20,
            parameters: {
                knowledgebaseId: 'kb-1'
            }
        })

        expect(service.getViewData).toHaveBeenCalledWith(
            context,
            expect.objectContaining({
                parameters: {
                    knowledgebaseId: 'kb-1'
                }
            })
        )
        expect(result).toEqual({
            items: [{ id: 'doc-1', name: 'handbook.pdf' }],
            total: 1
        })
    })

    it('returns knowledgebase parameter options from connected host state', async () => {
        const service = createService()
        const provider = createProvider(service)

        const result = await provider.getViewParameterOptions(
            context,
            KNOWLEDGE_WORKBENCH_VIEW_KEY,
            'knowledgebaseId',
            {}
        )

        expect(service.listKnowledgebases).toHaveBeenCalledWith(['kb-1'])
        expect(result.items).toEqual([
            {
                value: 'kb-1',
                label: 'Manufacturing KB',
                description: 'Factory documents'
            }
        ])
    })
})

function createProvider(service = createService()) {
    return new KnowledgeWorkbenchViewProvider(service as unknown as KnowledgeWorkbenchService)
}

function createService() {
    return {
        getViewData: jest.fn(async () => ({
            items: [{ id: 'doc-1', name: 'handbook.pdf' }],
            total: 1
        })),
        listKnowledgebases: jest.fn(async () => [
            {
                id: 'kb-1',
                name: 'Manufacturing KB',
                description: 'Factory documents'
            }
        ])
    }
}
