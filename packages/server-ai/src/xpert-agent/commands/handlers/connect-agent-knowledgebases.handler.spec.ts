import { RequestContext } from '@xpert-ai/server-core'
import { ConnectAgentKnowledgebasesCommand } from '../connect-agent-knowledgebases.command'
import { ConnectAgentKnowledgebasesHandler } from './connect-agent-knowledgebases.handler'

describe('ConnectAgentKnowledgebasesHandler', () => {
    afterEach(() => jest.restoreAllMocks())

    it('persists fail-closed Case folder retrieval policies on published and draft Agent configuration', async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        const fixedFilter = {
            kind: 'condition' as const,
            field: 'document.folderPath',
            operator: 'under' as const,
            value: { kind: 'variable' as const, selector: 'human.caseKnowledgeFolders.source' }
        }
        const xpertService = {
            findOneByIdWithinTenant: jest.fn(async () => ({
                id: 'xpert-1',
                workspaceId: 'workspace-1',
                agent: { id: 'agent-id-1', key: 'Agent_InquiryEngineer', knowledgebaseIds: [] },
                agentConfig: {},
                graph: { nodes: [] },
                draft: {
                    team: {
                        agent: { id: 'agent-id-1', key: 'Agent_InquiryEngineer', knowledgebaseIds: [] },
                        agentConfig: {}
                    },
                    nodes: []
                }
            })),
            updateXpert: jest.fn(async () => undefined)
        }
        const xpertAgentService = { update: jest.fn(async () => undefined) }
        const queryBus = { execute: jest.fn(async () => [{ id: 'kb-source', name: 'Source KB' }]) }
        const handler = new ConnectAgentKnowledgebasesHandler(
            xpertService as any,
            xpertAgentService as any,
            queryBus as any
        )

        await handler.execute(
            new ConnectAgentKnowledgebasesCommand({
                workspaceId: 'workspace-1',
                xpertId: 'xpert-1',
                agentKey: 'Agent_InquiryEngineer',
                knowledgebaseIds: ['kb-source'],
                retrievals: { 'kb-source': { mode: 'vector', fixedFilter, allowAgentFilter: false } }
            })
        )

        expect(xpertService.updateXpert).toHaveBeenCalledWith(
            'xpert-1',
            expect.objectContaining({
                agentConfig: {
                    retrievals: {
                        'kb-source': {
                            mode: 'vector',
                            filtering: { fixed: fixedFilter, agent: { enabled: false } }
                        }
                    }
                },
                draft: expect.objectContaining({
                    team: expect.objectContaining({
                        agentConfig: expect.objectContaining({
                            retrievals: expect.objectContaining({
                                'kb-source': expect.objectContaining({
                                    filtering: { fixed: fixedFilter, agent: { enabled: false } }
                                })
                            })
                        })
                    })
                })
            })
        )
    })
})
