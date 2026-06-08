import { XpertAgentExecutionStatusEnum, type IXpertAgentExecution } from '@xpert-ai/contracts'
import { instanceToPlain } from 'class-transformer'
import { ChatMessageDTO } from './conversation.dto'
import { buildChatMessageAgentRuns } from './conversation.dto'

describe('ChatMessageDTO', () => {
    it('exposes persisted agent runs for history-loaded assistant messages', () => {
        const dto = new ChatMessageDTO({
            id: 'message-1',
            role: 'ai',
            content: [],
            executionId: 'root-execution',
            agentRuns: [
                {
                    id: 'child-execution',
                    parentId: 'root-execution',
                    parentExecutionId: 'root-execution',
                    agentKey: 'Agent_child',
                    title: 'Single File Agent',
                    status: XpertAgentExecutionStatusEnum.SUCCESS
                }
            ]
        })

        expect(instanceToPlain(dto)).toMatchObject({
            id: 'message-1',
            agentRuns: [
                {
                    id: 'child-execution',
                    parentId: 'root-execution',
                    parentExecutionId: 'root-execution',
                    agentKey: 'Agent_child',
                    title: 'Single File Agent',
                    status: XpertAgentExecutionStatusEnum.SUCCESS
                }
            ]
        })
    })

    it('builds agent runs from the message execution subtree', () => {
        const executions: IXpertAgentExecution[] = [
            {
                id: 'root-execution',
                agentKey: 'Agent_root',
                status: XpertAgentExecutionStatusEnum.SUCCESS
            },
            {
                id: 'child-execution',
                parentId: 'root-execution',
                agentKey: 'Agent_child',
                title: 'Single File Agent',
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                elapsedTime: 42
            },
            {
                id: 'middleware-execution',
                parentId: 'child-execution',
                agentKey: 'Middleware_writer',
                title: 'Knowledge Writer',
                status: XpertAgentExecutionStatusEnum.SUCCESS
            },
            {
                id: 'other-execution',
                agentKey: 'Agent_other',
                status: XpertAgentExecutionStatusEnum.RUNNING
            }
        ]

        expect(buildChatMessageAgentRuns(executions, 'root-execution')).toEqual([
            {
                id: 'root-execution',
                agentKey: 'Agent_root',
                status: XpertAgentExecutionStatusEnum.SUCCESS
            },
            {
                id: 'child-execution',
                parentId: 'root-execution',
                parentExecutionId: 'root-execution',
                agentKey: 'Agent_child',
                title: 'Single File Agent',
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                elapsedTime: 42
            },
            {
                id: 'middleware-execution',
                parentId: 'child-execution',
                parentExecutionId: 'child-execution',
                agentKey: 'Middleware_writer',
                title: 'Knowledge Writer',
                status: XpertAgentExecutionStatusEnum.SUCCESS
            }
        ])
    })

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
