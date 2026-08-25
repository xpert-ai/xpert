import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Xpert } from '../../../xpert/xpert.entity'
import { ConnectAgentKnowledgebasesCommand } from '../connect-agent-knowledgebases.command'
import { XpertAgent } from '../../xpert-agent.entity'
import { ConnectAgentKnowledgebasesHandler } from './connect-agent-knowledgebases.handler'

describe('ConnectAgentKnowledgebasesHandler', () => {
    afterEach(() => jest.restoreAllMocks())

    it('persists fail-closed folder retrieval policies on published and draft Agent configuration', async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        const fixedFilter = {
            kind: 'condition' as const,
            field: 'document.folderPath',
            operator: 'under' as const,
            value: { kind: 'variable' as const, selector: 'human.knowledgeFolders.source' }
        }
        const xpertService = {
            findOneByIdWithinTenant: jest.fn(async () => ({
                id: 'xpert-1',
                workspaceId: 'workspace-1',
                agent: { id: 'agent-id-1', key: 'Agent_InquiryEngineer', knowledgebaseIds: [] },
                agentConfig: {},
                graph: {
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_InquiryEngineer',
                            position: { x: 0, y: 0 },
                            entity: { id: 'agent-id-1', key: 'Agent_InquiryEngineer', knowledgebaseIds: [] }
                        }
                    ],
                    connections: []
                },
                draft: {
                    team: {
                        agent: { id: 'agent-id-1', key: 'Agent_InquiryEngineer', knowledgebaseIds: [] },
                        agentConfig: {}
                    },
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_InquiryEngineer',
                            position: { x: 0, y: 0 },
                            entity: { id: 'agent-id-1', key: 'Agent_InquiryEngineer', knowledgebaseIds: [] }
                        }
                    ],
                    connections: []
                }
            })),
            updateXpert: jest.fn(async () => undefined)
        }
        const queryBus = { execute: jest.fn(async () => [{ id: 'kb-source', name: 'Source KB' }]) }
        const agentRepository = { update: jest.fn(async (_id: string, _patch: unknown) => undefined) }
        const xpertRepository = { update: jest.fn(async (_id: string, _patch: unknown) => undefined) }
        const manager = {
            getRepository: jest.fn((entity) => (entity === XpertAgent ? agentRepository : xpertRepository))
        }
        const dataSource = { transaction: jest.fn(async (run) => run(manager)) }
        const handler = new ConnectAgentKnowledgebasesHandler(xpertService as any, queryBus as any, dataSource as any)

        await handler.execute(
            new ConnectAgentKnowledgebasesCommand({
                workspaceId: 'workspace-1',
                xpertId: 'xpert-1',
                agentKey: 'Agent_InquiryEngineer',
                knowledgebaseIds: ['kb-source'],
                retrievals: { 'kb-source': { mode: 'vector', fixedFilter, allowAgentFilter: false } }
            })
        )

        expect(xpertRepository.update).toHaveBeenCalledWith(
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
                    }),
                    nodes: expect.arrayContaining([expect.objectContaining({ type: 'knowledge', key: 'kb-source' })]),
                    connections: [
                        expect.objectContaining({
                            type: 'knowledge',
                            from: 'Agent_InquiryEngineer',
                            to: 'kb-source'
                        })
                    ]
                })
            })
        )
        expect(xpertRepository.update).toHaveBeenCalledWith(
            'xpert-1',
            expect.objectContaining({
                graph: expect.objectContaining({
                    nodes: expect.arrayContaining([expect.objectContaining({ type: 'knowledge', key: 'kb-source' })]),
                    connections: [
                        expect.objectContaining({
                            type: 'knowledge',
                            from: 'Agent_InquiryEngineer',
                            to: 'kb-source'
                        })
                    ]
                })
            })
        )
        expect(agentRepository.update).toHaveBeenCalledWith('agent-id-1', { knowledgebaseIds: ['kb-source'] })
        expect(dataSource.transaction).toHaveBeenCalledTimes(1)
    })

    it('keeps existing Agent knowledgebase IDs that are outside the bounded workspace metadata result', async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        const agent = { id: 'agent-id-1', key: 'Agent_InquiryEngineer', knowledgebaseIds: ['kb-existing'] }
        const existingKnowledgeNode = {
            type: 'knowledge',
            key: 'kb-existing',
            position: { x: 320, y: 0 },
            entity: { id: 'kb-existing', name: 'Existing KB' }
        }
        const xpertService = {
            findOneByIdWithinTenant: jest.fn(async () => ({
                id: 'xpert-1',
                workspaceId: 'workspace-1',
                agent,
                agentConfig: {},
                graph: {
                    nodes: [
                        { type: 'agent', key: agent.key, position: { x: 0, y: 0 }, entity: { ...agent } },
                        existingKnowledgeNode
                    ],
                    connections: [
                        { type: 'knowledge', key: `${agent.key}/kb-existing`, from: agent.key, to: 'kb-existing' }
                    ]
                },
                draft: {
                    team: { agent: { ...agent }, knowledgebases: [existingKnowledgeNode.entity], agentConfig: {} },
                    nodes: [
                        { type: 'agent', key: agent.key, position: { x: 0, y: 0 }, entity: { ...agent } },
                        existingKnowledgeNode
                    ],
                    connections: [
                        { type: 'knowledge', key: `${agent.key}/kb-existing`, from: agent.key, to: 'kb-existing' }
                    ]
                }
            }))
        }
        const queryBus = { execute: jest.fn(async () => [{ id: 'kb-new', name: 'New KB' }]) }
        const agentRepository = { update: jest.fn(async (_id: string, _patch: unknown) => undefined) }
        const xpertRepository = { update: jest.fn(async (_id: string, _patch: unknown) => undefined) }
        const manager = {
            getRepository: jest.fn((entity) =>
                entity === XpertAgent ? agentRepository : entity === Xpert ? xpertRepository : undefined
            )
        }
        const dataSource = { transaction: jest.fn(async (run) => run(manager)) }
        const handler = new ConnectAgentKnowledgebasesHandler(xpertService as any, queryBus as any, dataSource as any)

        const result = await handler.execute(
            new ConnectAgentKnowledgebasesCommand({
                workspaceId: 'workspace-1',
                xpertId: 'xpert-1',
                agentKey: agent.key,
                knowledgebaseIds: ['kb-new']
            })
        )

        expect(result.knowledgebaseIds).toEqual(['kb-existing', 'kb-new'])
        expect(agentRepository.update).toHaveBeenCalledWith('agent-id-1', {
            knowledgebaseIds: ['kb-existing', 'kb-new']
        })
        const patch = xpertRepository.update.mock.calls[0][1] as any
        expect(patch.graph.nodes.find((node) => node.type === 'agent').entity.knowledgebaseIds).toEqual([
            'kb-existing',
            'kb-new'
        ])
        expect(patch.draft.team.agent.knowledgebaseIds).toEqual(['kb-existing', 'kb-new'])
        expect(patch.graph.nodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'knowledge', key: 'kb-existing' }),
                expect.objectContaining({ type: 'knowledge', key: 'kb-new' })
            ])
        )
        expect(patch.graph.connections).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'knowledge', to: 'kb-existing' }),
                expect.objectContaining({ type: 'knowledge', to: 'kb-new' })
            ])
        )
    })
})
