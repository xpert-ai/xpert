import { mapChatMessagesToStoredMessages } from '@langchain/core/messages'
import { RolesEnum } from '@xpert-ai/contracts'
import { PaginationParams, ParseJsonPipe, RequestContext, TransformInterceptor } from '@xpert-ai/server-core'
import { Controller, ForbiddenException, Get, Logger, Param, Query, UseInterceptors } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { t } from 'i18next'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import type { XpertAgentExecution } from './agent-execution.entity'
import { XpertAgentExecutionService } from './agent-execution.service'
import { XpertAgentExecutionDTO } from './dto'
import {
    AssertXpertAgentExecutionAccessQuery,
    XpertAgentExecutionCheckpointsQuery,
    XpertAgentExecutionOneQuery,
    XpertAgentExecutionStateQuery
} from './queries'

@ApiTags('XpertAgentExecution')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertAgentExecutionController {
    readonly #logger = new Logger(XpertAgentExecutionController.name)
    constructor(
        private readonly service: XpertAgentExecutionService,
        private readonly queryBus: QueryBus,
        private readonly organizationScopeService: SuperAdminOrganizationScopeService
    ) {}

    @Get(':id/log')
    async getOne(
        @Param('id') id: string,
        @Query('data', ParseJsonPipe) params?: PaginationParams<XpertAgentExecution>,
        @Query('organizationId') organizationId?: string
    ) {
        return this.organizationScopeService.run(organizationId, async () => {
            await this.queryBus.execute(new AssertXpertAgentExecutionAccessQuery(id))
            const execution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(id, params))
            return new XpertAgentExecutionDTO(execution)
        })
    }

    @Get(':id/state')
    async getState(
        @Param('id') id: string,
        @Query('checkpointId') checkpointId?: string,
        @Query('organizationId') organizationId?: string
    ) {
        return this.organizationScopeService.run(organizationId, async () => {
            await this.queryBus.execute(new AssertXpertAgentExecutionAccessQuery(id))
            const state = await this.queryBus.execute(new XpertAgentExecutionStateQuery(id, checkpointId))
            try {
                return serializeStateMessages(state)
            } catch (error) {
                console.error(error)
                return {}
            }
        })
    }

    @Get(':id/checkpoints')
    async getCheckpoints(@Param('id') id: string, @Query('organizationId') organizationId?: string) {
        return this.organizationScopeService.run(organizationId, async () => {
            await this.queryBus.execute(new AssertXpertAgentExecutionAccessQuery(id))
            return this.queryBus.execute(new XpertAgentExecutionCheckpointsQuery(id))
        })
    }

    @Get('xpert/:id/agent/:key')
    async findAllByXpertAgent(
        @Param('id') xpertId: string,
        @Param('key') agentKey: string,
        @Query('data', ParseJsonPipe) data: PaginationParams<XpertAgentExecution>
    ) {
        const isAdmin = RequestContext.hasRoles([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])
        const currentUserId = RequestContext.currentUserId()
        if (!isAdmin && !currentUserId) {
            throw new ForbiddenException(
                t('server-ai:Error.ExecutionAccessDenied', {
                    defaultValue: 'You do not have access to this execution'
                })
            )
        }
        return this.service.findAllByXpertAgent(xpertId, agentKey, data, isAdmin ? undefined : currentUserId)
    }
}

function serializeStateMessages(value: unknown, key?: string): unknown {
    if (key === 'messages' && Array.isArray(value)) {
        return mapChatMessagesToStoredMessages(value as any[])
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeStateMessages(item))
    }
    if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).reduce(
            (acc, [entryKey, entryValue]) => ({
                ...acc,
                [entryKey]: serializeStateMessages(entryValue, entryKey)
            }),
            {}
        )
    }
    return value
}
