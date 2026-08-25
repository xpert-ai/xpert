import { ToolParameterForm } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { isNil } from 'lodash'
import { Subject } from 'rxjs'
import { ApiBasedToolSchemaParser } from '../../../xpert-toolset'
import { XpertToolset } from '../../../xpert-toolset/xpert-toolset.entity'
import { ToolInvokeCommand } from '../tool-invoke.command'
import { EnvStateQuery } from '../../../environment'
import { randomUUID } from 'node:crypto'
import { ToolRuntimeService } from '../../../tool-runtime'

@CommandHandler(ToolInvokeCommand)
export class ToolInvokeHandler implements ICommandHandler<ToolInvokeCommand> {
    constructor(
        private readonly queryBus: QueryBus,
        private readonly toolRuntime: ToolRuntimeService
    ) {}

    public async execute(command: ToolInvokeCommand): Promise<unknown> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        // Default enabled tool for invoke
        const tool = { ...command.tool, enabled: true }
        const toolset = tool.toolset
        const workspaceId = toolset?.workspaceId?.trim()
        if (!toolset || !tenantId || !workspaceId) {
            throw new BadRequestException(
                translatedMessage(
                    'server-ai:Error.McpToolInvocationScopeRequired',
                    'Tool invocation requires explicit tenant and workspace context.'
                )
            )
        }

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

        const events: unknown[] = []
        const subscriber = new Subject<unknown>()
        const originId = randomUUID()

        subscriber.subscribe((event) => events.push(event))

        const envState = await this.queryBus.execute<EnvStateQuery, Record<string, unknown>>(
            new EnvStateQuery(workspaceId)
        )
        const toolsetId = toolset.id ?? randomUUID()
        const snapshot = Object.assign(new XpertToolset(), toolset, {
            id: toolsetId,
            tenantId,
            organizationId: organizationId ?? null,
            workspaceId,
            tools: [tool]
        })
        try {
            const result = await this.toolRuntime.executeTool({
                source: 'api',
                principal: userId
                    ? { type: 'user', id: userId, userId }
                    : { type: 'service_account', id: 'api-tool-invoke' },
                tenantId,
                organizationId,
                workspaceId,
                toolsetId,
                toolName: tool.name,
                arguments: parameters.llm ?? {},
                executionId: originId,
                requestId: originId,
                xpertId: stringFormValue(parameters.form, 'xpertId'),
                agentKey: stringFormValue(parameters.form, 'agentKey'),
                env: envState,
                configurable: { user: RequestContext.currentUser(), subscriber },
                toolsetSnapshots: [snapshot]
            })
            return events.length ? { events, result } : result
        } finally {
            subscriber.complete()
        }
    }
}

function stringFormValue(form: Record<string, unknown>, key: string) {
    const value = form[key]
    return typeof value === 'string' && value ? value : undefined
}

function translatedMessage(key: string, defaultValue: string) {
    const message = t(key, { defaultValue })
    return typeof message === 'string' && message ? message : defaultValue
}
