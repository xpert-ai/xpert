import { ChatMessageDTO } from './conversation.dto'
import { instanceToPlain } from 'class-transformer'

describe('ChatMessageDTO', () => {
    it('serializes derived execution summaries without exposing raw execution metadata', () => {
        const dto = new ChatMessageDTO({ id: 'a', role: 'ai' })
        dto.agentRuns = [{ id: 'external', invocationKind: 'external_assistant', model: 'model-a' }]
        expect(instanceToPlain(dto)).toMatchObject({
            agentRuns: [{ id: 'external', invocationKind: 'external_assistant', model: 'model-a' }]
        })
    })
    it('exposes normalized runtime capabilities saved in third-party metadata', () => {
        const dto = new ChatMessageDTO({
            id: 'message-1',
            role: 'human',
            content: 'Try this',
            thirdPartyMessage: {
                model: 'mdl_primary',
                runtimeCapabilities: {
                    mode: 'allowlist',
                    skills: {
                        workspaceId: 'workspace-1',
                        ids: ['skill-available']
                    },
                    plugins: {
                        nodeKeys: []
                    },
                    recommended: {
                        skills: {
                            ids: ['skill-recommended']
                        },
                        plugins: {
                            nodeKeys: ['middleware-recommended']
                        },
                        subAgents: {
                            nodeKeys: ['researcher']
                        }
                    }
                }
            }
        })

        expect(dto.runtimeCapabilities).toEqual({
            mode: 'allowlist',
            skills: {
                workspaceId: 'workspace-1',
                ids: ['skill-available', 'skill-recommended']
            },
            plugins: {
                nodeKeys: ['middleware-recommended']
            },
            subAgents: {
                nodeKeys: ['researcher']
            },
            recommended: {
                skills: {
                    workspaceId: 'workspace-1',
                    ids: ['skill-recommended']
                },
                plugins: {
                    nodeKeys: ['middleware-recommended']
                },
                subAgents: {
                    nodeKeys: ['researcher']
                }
            }
        })
        expect(dto.model).toBe('mdl_primary')
    })
})
