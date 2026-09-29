import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentJson, RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { AgentInvocationEntity } from './invocation.entity'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { invocationError } from './invocation-runtime'
import { isNativeInvocation, NativeAgentInvocationReader } from './native-invocation-reader'

const json: z.ZodType<AgentJson> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
)
const reply = z.object({ interactionId: z.string().min(1), response: json }).strict()

/** Owner-scoped inspection; native graph/task controls retain their existing routes. */
@Controller('agent-invocations')
export class AgentInvocationsController {
    constructor(
        @InjectRepository(AgentInvocationEntity) private readonly records: Repository<AgentInvocationEntity>,
        private readonly factory: AgentInvocationFactoryService,
        private readonly native: NativeAgentInvocationReader
    ) {}
    @Get(':id') async inspect(@Param('id') id: string) {
        const entity = await this.findOwned(id)
        return isNativeInvocation(entity.invocation)
            ? this.native.inspect(entity.invocation)
            : this.api(entity).inspect(id)
    }
    @Post(':id/cancel') async cancel(@Param('id') id: string) {
        const entity = await this.findOwned(id)
        if (isNativeInvocation(entity.invocation)) throw invocationError('Unsupported')
        return this.api(entity).cancel(id)
    }
    @Post(':id/respond') async respond(@Param('id') id: string, @Body() body: unknown) {
        const parsed = reply.safeParse(body)
        if (!parsed.success) throw invocationError('InvalidRequest')
        const entity = await this.findOwned(id)
        if (isNativeInvocation(entity.invocation)) throw invocationError('Unsupported')
        return this.api(entity).respond(id, parsed.data.interactionId, parsed.data.response)
    }
    private async findOwned(id: string) {
        const ownerId = RequestContext.currentUserId(),
            tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId()
        if (!ownerId || !tenantId || !organizationId || !z.string().uuid().safeParse(id).success) {
            throw invocationError('NotFound')
        }
        const entity = await this.records.findOneBy({ id, ownerId, tenantId, organizationId })
        if (!entity || !entity.invocation.scope.callerXpertId) throw invocationError('NotFound')
        const scope = entity.invocation.scope
        if (
            entity.invocation.id !== id ||
            scope.userId !== ownerId ||
            scope.tenantId !== tenantId ||
            scope.organizationId !== organizationId
        )
            throw invocationError('NotFound')
        return entity
    }
    private api(entity: AgentInvocationEntity) {
        const scope = entity.invocation.scope
        return this.factory.createScopedApi({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            conversationId: scope.conversationId,
            executionId: scope.parentExecutionId,
            agentKey: scope.callerAgentKey,
            xpertId: scope.callerXpertId
        })
    }
}
