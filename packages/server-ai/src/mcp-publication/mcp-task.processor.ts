import { PluginJobProcessor, type ManagedQueueJob } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { McpTaskService } from './mcp-task.service'
import { MCP_TASK_QUEUE_CONTROL_CONTRACT } from './control/mcp-task-queue-contract'

@Injectable()
@PluginJobProcessor({
    pluginName: '@xpert-ai/platform',
    queueName: 'mcp-publication',
    jobName: 'execute-tool',
    controlContract: MCP_TASK_QUEUE_CONTROL_CONTRACT,
    concurrency: 4
})
export class McpTaskProcessor {
    constructor(private readonly tasks: McpTaskService) {}

    async handle(job: ManagedQueueJob<unknown>) {
        await this.tasks.process(job.data)
    }
}
