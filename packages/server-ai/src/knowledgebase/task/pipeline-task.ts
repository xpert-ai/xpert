import { CommandBus } from '@nestjs/cqrs'
import {
    channelName,
    KnowledgebaseChannel,
    KnowledgeTask,
    KNOWLEDGE_SOURCES_NAME,
    KNOWLEDGE_PROCESSING_MODE_NAME,
    KnowledgeDocumentProcessingMode,
    STATE_VARIABLE_HUMAN,
    XpertAgentExecutionStatusEnum,
    IXpertAgentExecution
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { getErrorMessage } from '@xpert-ai/server-common'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution'
import { XpertEnqueueTriggerDispatchCommand } from '../../xpert/commands'
import type { KnowledgebaseTaskService } from './task.service'
import { KNOWLEDGE_PIPELINE_CALLBACK } from '../types'

export interface KnowledgePipelineInputs {
    sources?: { [key: string]: { documents: string[] } }
    stage: 'preview' | 'prod'
    mode?: KnowledgeDocumentProcessingMode
    isDraft?: boolean
}

// Preallocation tracks dispatch; Chat owns the first thread binding.
export async function dispatchKnowledgePipeline(
    commandBus: CommandBus,
    taskService: KnowledgebaseTaskService,
    knowledgebaseId: string,
    pipelineId: string,
    taskId: string,
    inputs: KnowledgePipelineInputs
) {
    const execution = await commandBus.execute<XpertAgentExecutionUpsertCommand, IXpertAgentExecution>(
        new XpertAgentExecutionUpsertCommand({ threadId: null, status: XpertAgentExecutionStatusEnum.RUNNING })
    )
    const context = { knowledgebaseId, taskId, executionId: execution.id }
    if (inputs.stage === 'prod' && !inputs.isDraft) {
        await taskService.startDocumentExecution(
            taskId,
            execution.id,
            inputs.sources ? Object.values(inputs.sources).flatMap((source) => source.documents) : undefined
        )
    } else {
        await taskService.update(taskId, {
            status: 'running',
            executionId: execution.id,
            error: null,
            finishedAt: null
        })
    }
    const sources = inputs.sources ? Object.keys(inputs.sources) : null
    try {
        await commandBus.execute(
            new XpertEnqueueTriggerDispatchCommand(
                pipelineId,
                RequestContext.currentUserId(),
                {
                    [STATE_VARIABLE_HUMAN]: { input: 'Process knowledges pipeline' },
                    [KnowledgebaseChannel]: {
                        knowledgebaseId,
                        [KnowledgeTask]: taskId,
                        [KNOWLEDGE_SOURCES_NAME]: sources,
                        [KNOWLEDGE_PROCESSING_MODE_NAME]: inputs.mode ?? 'full',
                        stage: inputs.stage
                    },
                    ...Object.fromEntries(
                        (sources ?? []).map((key) => [channelName(key), { documents: inputs.sources[key].documents }])
                    )
                },
                {
                    isDraft: inputs.isDraft,
                    from: 'knowledge',
                    executionId: execution.id,
                    callback: { messageType: KNOWLEDGE_PIPELINE_CALLBACK, context }
                }
            )
        )
    } catch (error) {
        await taskService.failExecution(
            {
                ...context,
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId() ?? null
            },
            getErrorMessage(error)
        )
        throw error
    }
}
