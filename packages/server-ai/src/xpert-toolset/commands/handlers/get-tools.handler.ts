import { Tool } from '@langchain/core/tools'
import { XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/server-core'
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { In } from 'typeorm'
import { ToolProviderNotFoundError } from '../../errors'
import { createBuiltinToolset, MCPToolset, ODataToolset } from '../../provider'
import { OpenAPIToolset } from '../../provider/openapi/openapi-toolset'
import { BaseToolset } from '../../toolset'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { ToolsetGetToolsCommand } from '../get-tools.command'
import { TBuiltinToolsetParams } from '../../../shared'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime.service'
import { createExecutionModelUsageRecorder, XpertAgentExecutionAddTokensCommand } from '../../../xpert-agent-execution'

@CommandHandler(ToolsetGetToolsCommand)
export class ToolsetGetToolsHandler implements ICommandHandler<ToolsetGetToolsCommand> {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly toolsetService: XpertToolsetService,
        private readonly modelRuntime: AgentMiddlewareRuntimeService,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly managedQueue: ManagedQueueService
    ) {}

    public async execute(command: ToolsetGetToolsCommand): Promise<BaseToolset<Tool>[]> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()

        const ids = command.ids
        if (!ids?.length) {
            return []
        }
        const workspaceId = normalizeWorkspaceId(command.environment?.workspaceId)
        const execution = command.environment?.execution
        const getExecution = command.environment?.getExecution ?? (execution ? () => execution : undefined)
        const originExecutionId = getExecution?.().id ?? command.environment?.executionId
        const userId = RequestContext.currentUserId()
        const usageRecorder = getExecution
            ? createExecutionModelUsageRecorder(getExecution, async (executionId, usage) => {
                  await this.commandBus.execute(
                      new XpertAgentExecutionAddTokensCommand(executionId, usage.tokens, usage.type)
                  )
              })
            : undefined
        const { items: toolsets } = await this.toolsetService.findAll({
            where: {
                id: In(ids),
                ...(workspaceId ? { workspaceId } : {})
            },
            relations: ['tools']
        })

        const scopedModelRuntime = this.modelRuntime.createScopedApi({
            tenantId,
            organizationId,
            userId,
            workspaceId: command.environment?.workspaceId,
            projectId: command.environment?.projectId,
            xpertId: command.environment?.xpertId,
            conversationId: command.environment?.conversationId,
            agentKey: command.environment?.agentKey,
            executionId: originExecutionId,
            usageCallback: usageRecorder?.usageCallback
        })
        const getModelProvider = scopedModelRuntime.getModelProvider
        const baseContext: Omit<TBuiltinToolsetParams, 'modelRuntime'> = {
            conversationId: command.environment?.conversationId,
            tenantId,
            organizationId,
            // toolsetService: this.toolsetService,
            commandBus: this.commandBus,
            queryBus: this.queryBus,
            userId,
            projectId: command.environment?.projectId,
            xpertId: command.environment?.xpertId,
            agentKey: command.environment?.agentKey,
            executionId: originExecutionId,
            signal: command.environment?.signal,
            env: command.environment?.env,
            store: command.environment?.store,
            managedQueue: this.managedQueue
        }

        return Promise.all(
            toolsets.map(async (toolset) => {
                const context: TBuiltinToolsetParams = {
                    ...baseContext,
                    modelRuntime: {
                        createModelClient: scopedModelRuntime.createModelClient,
                        getModelProvider,
                        reportUsage: usageRecorder?.reportUsage
                    }
                }
                switch (toolset.category) {
                    case XpertToolsetCategoryEnum.BUILTIN: {
                        return await createBuiltinToolset(toolset.type, toolset, context)
                    }
                    case XpertToolsetCategoryEnum.API: {
                        switch (toolset.type) {
                            case 'openapi': {
                                return new OpenAPIToolset(toolset, context.modelRuntime.reportUsage)
                            }
                            case 'odata': {
                                return new ODataToolset(toolset)
                            }
                            default: {
                                throw new ToolProviderNotFoundError(`API Tool type '${toolset.type}' not found`)
                            }
                        }
                    }
                    case XpertToolsetCategoryEnum.MCP: {
                        return new MCPToolset(toolset, context)
                    }
                    default: {
                        throw new ToolProviderNotFoundError(`Tool category '${toolset.category}' not found`)
                    }
                }
            })
        )
    }
}

function normalizeWorkspaceId(value?: string | null) {
    const workspaceId = value?.trim()
    return workspaceId && workspaceId !== 'null' && workspaceId !== 'undefined' ? workspaceId : null
}
