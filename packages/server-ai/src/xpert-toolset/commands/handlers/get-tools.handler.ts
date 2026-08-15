import { Tool } from '@langchain/core/tools'
import { XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import type { TToolModelUsageReporter } from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/server-core'
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
import { ModelInvocationService } from '../../../model-invocation'

@CommandHandler(ToolsetGetToolsCommand)
export class ToolsetGetToolsHandler implements ICommandHandler<ToolsetGetToolsCommand> {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly toolsetService: XpertToolsetService,
        private readonly modelRuntime: AgentMiddlewareRuntimeService,
        private readonly modelInvocationService: ModelInvocationService
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
        const originExecutionId = execution?.id ?? command.environment?.executionId
        const userId = RequestContext.currentUserId()
        const usageRecorder = execution
            ? createExecutionModelUsageRecorder(execution, async (executionId, usage) => {
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
            store: command.environment?.store
        }

        return Promise.all(
            toolsets.map(async (toolset) => {
                const context: TBuiltinToolsetParams = {
                    ...baseContext,
                    modelRuntime: {
                        createModelClient: scopedModelRuntime.createModelClient,
                        getModelProvider: getModelProvider
                            ? async (provider) => {
                                  const connection = await getModelProvider(provider)
                                  const providerRecorder =
                                      toolset.id && connection.copilotId && originExecutionId
                                          ? this.modelInvocationService.createRecorder({
                                                tenantId,
                                                organizationId,
                                                userId: userId ?? execution?.createdById,
                                                agentKey: command.environment?.agentKey,
                                                toolsetId: toolset.id,
                                                providerScopeId: connection.providerScopeId,
                                                copilotId: connection.copilotId,
                                                resolveOrigin: () => ({
                                                    type: 'execution',
                                                    id: originExecutionId,
                                                    executionId: originExecutionId
                                                })
                                            })
                                          : undefined
                                  const reportUsage: TToolModelUsageReporter | undefined = usageRecorder
                                      ? async (usage) => {
                                            const scopedUsage = { ...usage, provider: connection.provider }
                                            await usageRecorder.reportUsage(scopedUsage)
                                        }
                                      : undefined
                                  return {
                                      ...connection,
                                      reportUsage,
                                      recordInvocation: providerRecorder
                                  }
                              }
                            : undefined,
                        reportUsage: usageRecorder?.reportUsage,
                        recordInvocation: undefined
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
