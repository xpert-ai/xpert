import { KnowledgeProcessingReadyService } from '../knowledge-document/processing-lifecycle.module'
import { CommandBus } from '@nestjs/cqrs'
import { getErrorMessage } from '@xpert-ai/server-common'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { Job } from 'bull'
import { GraphragService } from './graphrag.service'
import { JOB_KNOWLEDGE_GRAPH_INDEX, TKnowledgeGraphIndexQueueJob } from './types'

@Processor({
    name: JOB_KNOWLEDGE_GRAPH_INDEX
})
export class KnowledgeGraphIndexConsumer {
    private readonly logger = new Logger(KnowledgeGraphIndexConsumer.name)

    constructor(
        @Inject(JOB_REF) jobRef: Job,
        private readonly service: GraphragService,
        private readonly commandBus: CommandBus,
        private readonly lifecycle: KnowledgeProcessingReadyService
    ) {}

    @Process({ concurrency: 2 })
    async process(job: Job<TKnowledgeGraphIndexQueueJob>) {
        await this.lifecycle.waitUntilReady()
        try {
            const identity = await this.commandBus.execute(
                new ResolveExecutionIdentityCommand({
                    kind: 'user',
                    userId: job.data.userId,
                    tenantId: job.data.tenantId,
                    organizationId: job.data.organizationId
                })
            )
            return await runWithExecutionIdentity(identity, () =>
                this.service.processIndexJob(job.data.graphIndexJobId)
            )
        } catch (error) {
            this.logger.error(`Knowledge graph index job failed: ${getErrorMessage(error)}`)
            throw error
        }
    }
}
