import { ToolParameterForm, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { isNil } from 'lodash'
import { Subject } from 'rxjs'
import {
    ApiBasedToolSchemaParser,
    createBuiltinToolset,
    MCPToolset,
    ODataToolset,
    OpenAPIToolset,
    ToolNotSupportedError,
    XpertToolsetService
} from '../../../xpert-toolset'
import { ToolInvokeCommand } from '../tool-invoke.command'
import { EnvStateQuery } from '../../../environment'
import { TBuiltinToolsetParams } from '../../../shared'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime.service'
import { MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'

@CommandHandler(ToolInvokeCommand)
export class ToolInvokeHandler implements ICommandHandler<ToolInvokeCommand> {
    readonly #logger = new Logger(ToolInvokeHandler.name)

    constructor(
        private readonly toolsetService: XpertToolsetService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly modelRuntime: AgentMiddlewareRuntimeService,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly managedQueue: ManagedQueueService
    ) {}

    public async execute(command: ToolInvokeCommand): Promise<any> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        // Default enabled tool for invoke
        const tool = { ...command.tool, enabled: true }
        const toolset = tool.toolset

        // Parse parameters types
        const parameters = tool.schema.parameters?.reduce(
            (acc, param) => {
                if (!isNil(tool.parameters?.[param.name])) {
                    acc[param.form === ToolParameterForm.FORM ? 'form' : 'llm'][param.name] =
                        ApiBasedToolSchemaParser.convertPropertyValueType(param.schema, tool.parameters[param.name])
                }
                return acc
            },
            { llm: {}, form: {} }
        ) ?? { llm: command.tool.parameters }

        const events = []
        const subscriber = new Subject()
        const originId = randomUUID()

        subscriber.subscribe((event) => events.push(event))

        const toolContext = {
            tenantId,
            organizationId,
            user: RequestContext.currentUser(),
            userId,
            tool_call_id: originId,
            subscriber
        }

        const envState = await this.queryBus.execute(new EnvStateQuery(toolset.workspaceId))
        const scopedModelRuntime = this.modelRuntime.createScopedApi({
            tenantId,
            organizationId,
            userId,
            workspaceId: toolset.workspaceId,
            xpertId: parameters?.form?.xpertId,
            agentKey: parameters?.form?.agentKey
        })
        const getModelProvider = scopedModelRuntime.getModelProvider
        const context: TBuiltinToolsetParams = {
            tenantId,
            organizationId,
            // toolsetService: this.toolsetService,
            commandBus: this.commandBus,
            queryBus: this.queryBus,
            userId,
            xpertId: parameters?.form?.xpertId,
            agentKey: parameters?.form?.agentKey,
            env: envState,
            managedQueue: this.managedQueue,
            modelRuntime: {
                createModelClient: scopedModelRuntime.createModelClient,
                getModelProvider
            }
        }

        switch (toolset.category) {
            case XpertToolsetCategoryEnum.BUILTIN: {
                const builtinToolset = await createBuiltinToolset(
                    toolset.type,
                    {
                        ...toolset,
                        tools: [
                            {
                                ...tool,
                                enabled: true
                            }
                        ]
                    },
                    context
                )

                await builtinToolset.initTools()

                const result = await builtinToolset.getTool(tool.name).invoke(parameters?.llm ?? {}, {
                    configurable: toolContext
                })

                if (events.length) {
                    return {
                        events,
                        result
                    }
                }
                return result
            }
            case XpertToolsetCategoryEnum.API: {
                switch (toolset.type) {
                    case 'openapi': {
                        const openapiToolset = new OpenAPIToolset({ ...toolset, tools: [tool] })
                        const toolRuntime = openapiToolset.getTool(tool.name)
                        return await toolRuntime.invoke(parameters.llm, {
                            configurable: toolContext
                        })
                    }

                    case 'odata': {
                        const openapiToolset = new ODataToolset({ ...toolset, tools: [tool] })
                        const toolRuntime = openapiToolset.getTool(tool.name)
                        return await toolRuntime.invoke(parameters.llm, {
                            configurable: toolContext
                        })
                    }
                }
                break
            }
            case XpertToolsetCategoryEnum.MCP: {
                const mcpToolset = new MCPToolset({ ...toolset, tools: [tool] }, context)
                try {
                    await mcpToolset.initTools()
                    const toolRuntime = mcpToolset.getTool(tool.name)
                    return await toolRuntime.invoke(parameters?.llm, {
                        configurable: toolContext
                    })
                } finally {
                    mcpToolset.close().catch((err) => this.#logger.debug(err))
                }
            }
        }

        throw new ToolNotSupportedError(`Toolset type ${toolset.type}`)
    }
}
