import { ChatMessageDTO } from './conversation.dto'

describe('ChatMessageDTO', () => {
    it('exposes normalized runtime capabilities saved in third-party metadata', () => {
        const dto = new ChatMessageDTO({
            id: 'message-1',
            role: 'human',
            content: 'Try this',
            thirdPartyMessage: {
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
    })
})
