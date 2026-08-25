import { McpConsumerApps } from './apps/mcp-consumer-apps'
import { McpConsumerCompletion } from './completion/mcp-consumer-completion'
import { McpConsumerConnection } from './connection/mcp-consumer-connection'
import { McpConsumerElicitation } from './elicitation/mcp-consumer-elicitation'
import { McpConsumerPrompts } from './prompts/mcp-consumer-prompts'
import { McpConsumerResources } from './resources/mcp-consumer-resources'
import { McpConsumerSubscriptions } from './subscriptions/mcp-consumer-subscriptions'
import { McpConsumerTasks } from './tasks/mcp-consumer-tasks'
import { McpConsumerTools } from './tools/mcp-consumer-tools'

/** Protocol-first MCP Consumer. LangChain is only exposed by tools.asLangChain(). */
export class McpConsumer {
    readonly tools: McpConsumerTools
    readonly resources: McpConsumerResources
    readonly prompts: McpConsumerPrompts
    readonly completion: McpConsumerCompletion
    readonly elicitation: McpConsumerElicitation
    readonly apps: McpConsumerApps
    readonly tasks: McpConsumerTasks
    readonly subscriptions: McpConsumerSubscriptions

    constructor(readonly connection: McpConsumerConnection) {
        this.elicitation = new McpConsumerElicitation(connection)
        this.tools = new McpConsumerTools(connection, (inputRequests, serverName, handler) =>
            this.elicitation.respond(inputRequests, serverName, handler)
        )
        this.resources = new McpConsumerResources(connection)
        this.prompts = new McpConsumerPrompts(connection)
        this.completion = new McpConsumerCompletion(connection)
        this.apps = new McpConsumerApps(this.tools, this.resources, () => connection.serverNames())
        this.tasks = new McpConsumerTasks(connection, (name, arguments_, serverName, signal) =>
            this.tools.startTask(name, arguments_, serverName, signal)
        )
        this.tools.setTaskRunner(async (name, arguments_, serverName, signal, handler) => {
            const started = await this.tasks.start(name, arguments_, serverName, signal)
            const completed = await this.tasks.wait(started, {
                serverName,
                signal,
                ...(handler
                    ? {
                          onInputRequired: async (task) =>
                              this.elicitation.respond(taskInputRequests(task.inputRequests), serverName, handler)
                      }
                    : {})
            })
            return this.tasks.result(completed)
        })
        this.subscriptions = new McpConsumerSubscriptions(connection)
    }
}

function taskInputRequests(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value))
        : {}
}
