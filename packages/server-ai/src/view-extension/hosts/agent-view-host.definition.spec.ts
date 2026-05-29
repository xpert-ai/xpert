import { WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import { AgentViewHostDefinition } from './agent-view-host.definition'

describe('AgentViewHostDefinition', () => {
    it('loads the primary agent relation and derives middleware feature capabilities', async () => {
        const xpertService = {
            findOneByIdWithinTenant: jest.fn().mockResolvedValue({
                id: 'agent-host-1',
                type: XpertTypeEnum.Agent,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                name: 'CEO Assistant',
                title: 'CEO Assistant',
                active: true,
                features: {
                    sandbox: {
                        enabled: true
                    }
                },
                agent: {
                    key: 'Agent_BusinessAssistant',
                    knowledgebaseIds: ['kb-1']
                },
                graph: {
                    nodes: [
                        {
                            key: 'Agent_BusinessAssistant',
                            type: 'agent',
                            entity: {
                                key: 'Agent_BusinessAssistant',
                                name: 'CEO Assistant'
                            }
                        },
                        {
                            key: 'Middleware_BOM',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'BomDocumentIntakeMiddleware'
                            }
                        }
                    ],
                    connections: [
                        {
                            key: 'Agent_BusinessAssistant/Middleware_BOM',
                            type: 'workflow',
                            from: 'Agent_BusinessAssistant',
                            to: 'Middleware_BOM'
                        }
                    ]
                }
            })
        }
        const middlewareRegistry = {
            get: jest.fn().mockReturnValue({
                meta: {
                    features: ['bom_document_intake']
                }
            })
        }
        const definition = new AgentViewHostDefinition(xpertService as any, {} as any, middlewareRegistry as any)

        const resolved = await definition.resolve('agent-host-1')

        expect(xpertService.findOneByIdWithinTenant).toHaveBeenCalledWith('agent-host-1', {
            relations: ['agent']
        })
        expect(middlewareRegistry.get).toHaveBeenCalledWith('BomDocumentIntakeMiddleware', 'org-1')
        expect(resolved?.context).toEqual({
            capabilities: {
                features: ['bom_document_intake', 'sandbox']
            },
            hostState: {
                agent: {
                    connections: [
                        {
                            id: 'kb-1',
                            type: 'knowledgebase'
                        }
                    ],
                    key: 'Agent_BusinessAssistant',
                    middlewareNodeKeys: ['Middleware_BOM'],
                    middlewareProviders: ['BomDocumentIntakeMiddleware']
                }
            }
        })
        expect((resolved?.hostSnapshot as any).agent.key).toBe('Agent_BusinessAssistant')
    })
})
