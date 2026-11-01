import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { HttpException } from '@nestjs/common'
import { AgentInvocationEntity } from '../invocation.entity'
import { ExecutionReaderService } from './execution-reader.service'
import { InvocationActivityService } from '../activity/activity.service'
import {
    ReadTrailActivityCommand,
    type InvocationTrailActivity,
    type TrailActivityResult
} from './read-trail-activity.command'

@CommandHandler(ReadTrailActivityCommand)
export class ReadTrailActivityHandler implements ICommandHandler<ReadTrailActivityCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly reader: ExecutionReaderService,
        private readonly activity: InvocationActivityService
    ) {}
    async execute({ context, parentExecutionIds }: ReadTrailActivityCommand): Promise<TrailActivityResult> {
        if (!parentExecutionIds.length || !context.organizationId || !context.userId)
            return { items: [], limitReached: false }
        const records = await this.db
            .getRepository(AgentInvocationEntity)
            .createQueryBuilder('invocation')
            .select('invocation.id')
            .where({ tenantId: context.tenantId, organizationId: context.organizationId, ownerId: context.userId })
            .andWhere("invocation.invocation->'scope'->>'parentExecutionId' IN (:...parents)", {
                parents: parentExecutionIds
            })
            .orderBy('invocation.createdAt', 'ASC')
            .addOrderBy('invocation.id', 'ASC')
            .take(41)
            .getMany()
        const result: InvocationTrailActivity[] = []
        for (const record of records.slice(0, 40)) {
            try {
                const invocation = await this.reader.read(context, record.id)
                const page = await this.activity.page(invocation, 0, 100)
                result.push({
                    id: invocation.id,
                    parentExecutionId: invocation.scope.parentExecutionId,
                    sourceToolCallId: invocation.request.callId,
                    title: invocation.handle?.runner?.tool?.id ?? '',
                    status: invocation.status,
                    activity: page
                })
            } catch (error) {
                // Private/revoked invocations must not leak through a readable conversation.
                if (!(error instanceof HttpException) || ![403, 404].includes(error.getStatus())) throw error
            }
        }
        return { items: result, limitReached: records.length > 40 }
    }
}
