import { PluginJobProcessor, type ManagedQueueJob } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { McpTaskService } from './mcp-task.service'

@Injectable()
@PluginJobProcessor({
    pluginName: '@xpert-ai/platform',
    queueName: 'mcp-publication',
    jobName: 'execute-tool',
    concurrency: 4
})
export class McpTaskProcessor {
    constructor(private readonly tasks: McpTaskService) {}

    async handle(job: ManagedQueueJob<unknown>) {
        await this.tasks.process(job.data)
    }
}
