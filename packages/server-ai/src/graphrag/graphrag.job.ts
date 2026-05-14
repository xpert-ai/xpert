import { getErrorMessage } from '@xpert-ai/server-common'
import { runWithRequestContext, UserService } from '@xpert-ai/server-core'
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
        private readonly userService: UserService
    ) {}

    @Process({ concurrency: 2 })
    async process(job: Job<TKnowledgeGraphIndexQueueJob>) {
        const user = job.data.userId ? await this.userService.findOne(job.data.userId, { relations: ['role'] }) : null
        return new Promise((resolve, reject) => {
            runWithRequestContext(
                {
                    user,
                    headers: {
                        ['organization-id']: job.data.organizationId,
                        language: user?.preferredLanguage
                    }
                },
                () => {
                    this.service
                        .processIndexJob(job.data.graphIndexJobId)
                        .then(resolve)
                        .catch((error) => {
                            this.logger.error(`Knowledge graph index job failed: ${getErrorMessage(error)}`)
                            reject(error)
                        })
                }
            )
        })
    }
}
