jest.mock('isolated-vm', () => ({
    ExternalCopy: class ExternalCopy {},
    Isolate: class Isolate {}
}))

import { RequestContext } from '@metad/server-core'
import { I18nService } from 'nestjs-i18n'
import { Observable } from 'rxjs'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'
import { VolumeClient, ExecutionCancelService } from '../../../shared'

describe('XpertAgentInvokeHandler', () => {
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let checkpointSaver: { getCopilotCheckpoint: jest.Mock }
    let envService: { findOne: jest.Mock }
    let i18nService: { t: jest.Mock }
    let executionCancelService: { register: jest.Mock; unregister: jest.Mock }
    let handler: XpertAgentInvokeHandler

    beforeEach(() => {
        commandBus = {
            execute: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }
        checkpointSaver = {
            getCopilotCheckpoint: jest.fn().mockResolvedValue({
                checkpoint: null,
                pendingWrites: []
            })
        }
        envService = {
            findOne: jest.fn()
        }
        i18nService = {
            t: jest.fn()
        }
        executionCancelService = {
            register: jest.fn(),
            unregister: jest.fn()
        }

        handler = new XpertAgentInvokeHandler(
            commandBus as any,
            queryBus as any,
            checkpointSaver as any,
            envService as any,
            i18nService as unknown as I18nService,
            executionCancelService as unknown as ExecutionCancelService
        )

        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'user-1',
            email: 'user@example.com',
            timeZone: 'Asia/Shanghai',
            preferredLanguage: 'en-US'
        } as any)
        jest.spyOn(VolumeClient, 'getWorkspacePath').mockResolvedValue('/tmp/workspace')
        jest.spyOn(VolumeClient, 'getWorkspaceUrl').mockReturnValue('/workspace/')
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('replays from checkpoint without sending a fresh graph input', async () => {
        const graph = {
            streamEvents: jest.fn().mockReturnValue(
                (async function* () {
                    //
                })()
            ),
            getState: jest.fn().mockResolvedValue({
                config: {
                    configurable: {
                        thread_id: 'thread-1',
                        checkpoint_ns: '',
                        checkpoint_id: 'checkpoint-new'
                    }
                },
                parentConfig: {
                    configurable: {
                        thread_id: 'thread-1',
                        checkpoint_ns: ''
                    }
                },
                values: {},
                tasks: []
            })
        }

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) {
                return {
                    graph,
                    agent: {
                        key: 'agent-1',
                        team: {
                            id: 'team-1',
                            agentConfig: {}
                        }
                    },
                    xpertGraph: {
                        nodes: []
                    }
                }
            }
            return null
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: {
                        input: 'Original prompt'
                    }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    features: {}
                } as any,
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    checkpointId: 'checkpoint-parent',
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber: {
                        next: jest.fn()
                    },
                    store: null
                } as any
            )
        )

        await new Promise<void>((resolve, reject) => {
            ;(stream as Observable<unknown>).subscribe({
                error: reject,
                complete: () => resolve()
            })
        })

        expect(graph.streamEvents).toHaveBeenCalledTimes(1)
        expect(graph.streamEvents.mock.calls[0][0]).toBeNull()
        expect(graph.streamEvents.mock.calls[0][1]).toMatchObject({
            configurable: {
                thread_id: 'thread-1',
                checkpoint_id: 'checkpoint-parent'
            }
        })
    })
})
