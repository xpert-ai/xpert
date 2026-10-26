import type { McpConsumerExecutor, McpConsumerExecution } from './execution/mcp-consumer-executor'
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

    constructor(
        readonly connection: McpConsumerConnection,
        private readonly execute?: McpConsumerExecutor
    ) {
        this.elicitation = new McpConsumerElicitation(connection)
        this.tools = new McpConsumerTools(
            connection,
            (inputRequests, serverName, handler) => this.elicitation.respond(inputRequests, serverName, handler),
            execute
        )
        this.resources = new McpConsumerResources(connection)
        this.prompts = new McpConsumerPrompts(connection)
        this.completion = new McpConsumerCompletion(connection)
        this.apps = new McpConsumerApps(this.tools, this.resources, () => connection.serverNames())
        this.tasks = new McpConsumerTasks(connection, (name, arguments_, serverName, signal, identity) =>
            this.tools.startTask(name, arguments_, serverName, signal, identity)
        )
        this.tools.setTaskRunner((name, arguments_, serverName, signal, input, operationKey) =>
            this.runTask({
                mode: 'task',
                toolName: name,
                arguments: arguments_,
                serverName,
                signal,
                input,
                operationKey
            })
        )
        this.subscriptions = new McpConsumerSubscriptions(connection)
    }
    async runTask(input: McpConsumerExecution) {
        if (this.execute) return this.execute(input)
        const started = await this.tasks.start(input.toolName, input.arguments, input.serverName, input.signal)
        const completed = await this.tasks.wait(started, {
            serverName: input.serverName,
            signal: input.signal,
            ...(input.input
                ? {
                      onInputRequired: (task) =>
                          this.elicitation.respond(taskInputRequests(task.inputRequests), input.serverName, input.input)
                  }
                : {})
        })
        return this.tasks.result(completed)
    }
}

function taskInputRequests(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value))
        : {}
}
