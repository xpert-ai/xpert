jest.mock('../../../chat-conversation/message-checkpoint.service', () => ({ MessageCheckpointService: class {} }))
jest.mock('../../../chat-conversation/thread-run-control.service', () => ({ ThreadRunControlService: class {} }))
jest.mock('isolated-vm', () => ({ ExternalCopy: class {}, Isolate: class {} }))
jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext
}))
jest.mock('../../../copilot-checkpoint', () => ({ CopilotCheckpointSaver: class {} }))
jest.mock('../../agent', () => ({ createMapStreamEvents: jest.fn() }))
jest.mock('../../../environment', () => ({ EnvironmentService: class {} }))
jest.mock('../../../shared', () => ({ ExecutionCancelService: class {}, XpertWorkAreaResolver: class {} }))
jest.mock('../../../chat-message/chat-message.entity', () => ({ ChatMessage: class {} }))
jest.mock('../../../knowledgebase', () => ({ KnowledgebaseTaskService: class {}, KnowledgeTaskServiceQuery: class {} }))

import { Logger } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Subscriber } from 'rxjs'
import { SandboxAcquireBackendCommand } from '../../../sandbox/commands'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'

describe('Agent sandbox target selection', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(null)
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    })

    afterEach(() => jest.restoreAllMocks())

    it.each(['local-shell-sandbox', 'nsjail', 'docker-sandbox'])(
        'acquires the explicit environment without replacing the project work area: %s',
        async (provider) => {
            const binding = {
                volumeRoot: '/server/project',
                workspaceRoot: '/workspace/projects/project',
                workspacePath: '/workspace/projects/project/agents/assistant'
            }
            const volumeScope = { tenantId: 'tenant', userId: 'user', catalog: 'projects', projectId: 'project' }
            const workAreas = { resolve: jest.fn().mockResolvedValue({ volumeScope, workspaceBinding: binding }) }
            const stopBeforeAcquisition = new Error('Stop at the runtime boundary')
            const commandBus = { execute: jest.fn().mockRejectedValue(stopBeforeAcquisition) }
            const handler = new XpertAgentInvokeHandler(
                commandBus as never,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                workAreas as never,
                undefined,
                undefined
            )

            await expect(
                handler.execute(
                    new XpertAgentInvokeCommand(
                        { human: { input: 'Run the project task' } },
                        'agent',
                        {
                            id: 'assistant',
                            features: {
                                opener: { enabled: false, message: '', questions: [] },
                                suggestion: { enabled: false, prompt: '' },
                                textToSpeech: { enabled: false },
                                speechToText: { enabled: false },
                                sandbox: { enabled: true, provider }
                            }
                        },
                        {
                            isDraft: false,
                            projectId: 'project',
                            sandboxEnvironmentId: 'environment',
                            rootExecutionId: 'execution',
                            execution: { id: 'execution', threadId: 'thread' },
                            subscriber: new Subscriber<MessageEvent>(),
                            store: null
                        }
                    )
                )
            ).rejects.toBe(stopBeforeAcquisition)

            expect(workAreas.resolve).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectId: 'project',
                    environmentId: 'environment',
                    provider
                })
            )
            expect(commandBus.execute).toHaveBeenCalledTimes(1)
            const command = commandBus.execute.mock.calls[0][0]
            expect(command).toBeInstanceOf(SandboxAcquireBackendCommand)
            expect(command.params).toMatchObject({
                provider,
                workFor: { type: 'environment', id: 'environment' },
                volumeScope,
                workspaceBinding: binding,
                workingDirectory: binding.workspacePath
            })
        }
    )
})
