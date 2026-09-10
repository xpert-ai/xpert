import { Injectable } from '@nestjs/common'
import { t } from 'i18next'
import {
    AgentChatCallbackEnvelopePayload,
    HandoffMessage,
    HandoffProcessorStrategy,
    IHandoffProcessor,
    ProcessResult
} from '@xpert-ai/plugin-sdk'
import { KnowledgebaseTaskService } from './task.service'
import { KNOWLEDGE_PIPELINE_CALLBACK } from '../types'

@Injectable()
@HandoffProcessorStrategy(KNOWLEDGE_PIPELINE_CALLBACK, {
    types: [KNOWLEDGE_PIPELINE_CALLBACK],
    policy: { lane: 'main' }
})
export class KnowledgePipelineCallbackProcessor implements IHandoffProcessor<AgentChatCallbackEnvelopePayload> {
    constructor(private readonly tasks: KnowledgebaseTaskService) {}

    async process(message: HandoffMessage<AgentChatCallbackEnvelopePayload>): Promise<ProcessResult> {
        // Agent streams can persist an error and still complete normally.
        if (message.payload.kind === 'stream') return { status: 'ok' }
        const context = message.payload.context
        if (
            !message.tenantId ||
            typeof context?.knowledgebaseId !== 'string' ||
            typeof context.taskId !== 'string' ||
            typeof context.executionId !== 'string'
        ) {
            return {
                status: 'dead',
                reason: t('server-ai:Error.InvalidKnowledgePipelineCallback', {
                    defaultValue: 'Invalid knowledge pipeline callback context'
                })
            }
        }
        const scope = {
            tenantId: message.tenantId,
            organizationId: message.headers?.organizationId ?? null,
            knowledgebaseId: context.knowledgebaseId,
            taskId: context.taskId,
            executionId: context.executionId
        }
        if (message.payload.kind === 'complete') {
            await this.tasks.syncExecutionFailure(scope)
            return { status: 'ok' }
        }
        await this.tasks.failExecution(
            scope,
            message.payload.error ||
                t('server-ai:Error.KnowledgePipelineFailed', {
                    defaultValue: 'Knowledge pipeline execution failed'
                })
        )
        return { status: 'ok' }
    }
}
