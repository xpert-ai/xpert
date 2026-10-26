import { ConflictException, HttpException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { isDeepStrictEqual } from 'node:util'
import { t } from 'i18next'
import { ContentResourceOperation, type ContentOperationPayload } from './content-operation.entity'

@Injectable()
export class ContentOperations {
    constructor(@InjectRepository(ContentResourceOperation) readonly rows: Repository<ContentResourceOperation>) {}
    async retain(payload: ContentOperationPayload) {
        const input = payload.input
        const operationKey =
            payload.kind !== 'refresh'
                ? `create:${payload.input.projectId}:${payload.input.providerKey}:${payload.input.requestId}`
                : `refresh:${payload.input.contentId}`
        const where = { tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, operationKey }
        await this.rows
            .createQueryBuilder()
            .insert()
            .values({ ...where, payload, nextAttemptAt: new Date(Date.now() + 60_000) })
            .orIgnore()
            .execute()
        const row = await this.rows.findOneByOrFail(where)
        // A request identity is immutable; a timeout retry may not silently change a template/title.
        if (payload.kind !== 'refresh' && !isDeepStrictEqual(row.payload, JSON.parse(JSON.stringify(payload))))
            throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
        // A newly authorized collaborator can resume projection work after the previous
        // actor loses access. Only refresh intents may change actor; creates stay immutable.
        if (payload.kind === 'refresh' && !isDeepStrictEqual(row.payload, JSON.parse(JSON.stringify(payload)))) {
            await this.rows.update(row.id, { payload })
            row.payload = payload
        }
        return row
    }
    async finish(row: ContentResourceOperation, error?: unknown) {
        await this.rows.update(row.id, {
            status: error ? 'failed' : row.payload.kind === 'refresh' ? 'pending' : 'complete',
            attempts: error ? row.attempts + 1 : 0,
            failureCode: error
                ? error instanceof HttpException
                    ? `HTTP_${error.getStatus()}`
                    : 'RECOVERY_FAILED'
                : null,
            nextAttemptAt: new Date(
                Date.now() + (error ? Math.min(600_000, 30_000 * 2 ** Math.min(row.attempts, 5)) : 300_000)
            )
        })
    }
}
