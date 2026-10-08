import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from './runtime-message.entity'
import { RuntimeMessageAccessService } from './runtime-message-access.service'
import { runtimeMessageError } from './runtime-message.errors'
import { resetRuntimeDelivery } from './runtime-result-check.handler'

export const runtimeDeliveryIdSchema = z.string().uuid()
export const runtimeRedriveSchema = z.object({}).strict()

/** Owner-authorized transport operations. Redrive never changes an Invocation or clears a user stop. */
@Controller('agent-invocations')
export class RuntimeDeliveryController {
    constructor(
        private readonly dataSource: DataSource,
        private readonly access: RuntimeMessageAccessService
    ) {}

    private owner() {
        const tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId(),
            ownerId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !ownerId) throw runtimeMessageError('Access')
        return { tenantId, organizationId, ownerId }
    }

    @Get(':id/delivery')
    async inspect(
        @Param('id', new ZodValidationPipe(runtimeDeliveryIdSchema, () => runtimeMessageError('Invalid'))) id: string
    ) {
        const owner = this.owner()
        return this.access.withReceiptOwner(id, owner, async () => {
            const where = { ...owner, invocationId: id }
            const [delivery, consumption] = await Promise.all([
                this.dataSource.getRepository(AgentRuntimeDelivery).find({
                    where,
                    order: { createdAt: 'ASC' },
                    select: {
                        messageId: true,
                        event: true,
                        state: true,
                        attempts: true,
                        lastError: true,
                        nextAttemptAt: true
                    }
                }),
                this.dataSource.getRepository(AgentRuntimeInbox).find({
                    where,
                    order: { createdAt: 'ASC' },
                    select: {
                        messageId: true,
                        event: true,
                        state: true,
                        phase: true,
                        claim: true,
                        lastError: true,
                        nextAttemptAt: true
                    }
                })
            ])
            return { delivery, consumption }
        })
    }

    @Post(':id/delivery/redrive')
    async redrive(
        @Param('id', new ZodValidationPipe(runtimeDeliveryIdSchema, () => runtimeMessageError('Invalid'))) id: string,
        @Body(new ZodValidationPipe(runtimeRedriveSchema, () => runtimeMessageError('Invalid')))
        _body: z.output<typeof runtimeRedriveSchema>
    ) {
        const owner = this.owner()
        return this.access.withReply(id, owner, async () => {
            await this.dataSource.transaction((manager) => resetRuntimeDelivery(manager, id, owner))
            return this.inspect(id)
        })
    }
}
