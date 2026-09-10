import { AgentChatCallbackEnvelopePayload, HandoffMessage } from '@xpert-ai/plugin-sdk'
import { KnowledgePipelineCallbackProcessor } from './pipeline-callback.processor'
import { KNOWLEDGE_PIPELINE_CALLBACK } from '../types'

describe('knowledge pipeline callback', () => {
    function setup(kind: AgentChatCallbackEnvelopePayload['kind'] = 'error') {
        const tasks = { failExecution: jest.fn(), syncExecutionFailure: jest.fn() }
        const processor = new KnowledgePipelineCallbackProcessor(tasks as never)
        const message: HandoffMessage<AgentChatCallbackEnvelopePayload> = {
            id: 'callback',
            type: KNOWLEDGE_PIPELINE_CALLBACK,
            version: 1,
            tenantId: 'tenant',
            headers: { organizationId: 'org' },
            sessionKey: 'execution',
            businessKey: 'execution',
            attempt: 1,
            maxAttempts: 1,
            enqueuedAt: 0,
            traceId: 'trace',
            payload: {
                kind,
                sourceMessageId: 'dispatch',
                sequence: 1,
                error: 'Thread conflict',
                context: { knowledgebaseId: 'kb', taskId: 'task', executionId: 'execution' }
            }
        }
        return { processor, tasks, message }
    }

    it('writes asynchronous failure using the envelope scope instead of ambient request context', async () => {
        const { processor, tasks, message } = setup()
        await expect(processor.process(message)).resolves.toEqual({ status: 'ok' })
        expect(tasks.failExecution).toHaveBeenCalledWith(
            {
                tenantId: 'tenant',
                organizationId: 'org',
                knowledgebaseId: 'kb',
                taskId: 'task',
                executionId: 'execution'
            },
            'Thread conflict'
        )
    })

    it('checks persisted execution errors even when the chat stream completes normally', async () => {
        const { processor, tasks, message } = setup('complete')
        await processor.process(message)
        expect(tasks.syncExecutionFailure).toHaveBeenCalledWith({
            tenantId: 'tenant',
            organizationId: 'org',
            knowledgebaseId: 'kb',
            taskId: 'task',
            executionId: 'execution'
        })
        expect(tasks.failExecution).not.toHaveBeenCalled()
    })

    it.each(['stream'] as const)('leaves %s persistence to the workflow', async (kind) => {
        const { processor, tasks, message } = setup(kind)
        await processor.process(message)
        expect(tasks.failExecution).not.toHaveBeenCalled()
    })

    it('rejects malformed callback identity', async () => {
        const { processor, tasks, message } = setup()
        message.payload.context.executionId = 12
        expect((await processor.process(message)).status).toBe('dead')
        expect(tasks.failExecution).not.toHaveBeenCalled()
    })
})
