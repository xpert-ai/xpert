import { AGENT_OUTPUT_ACCEPT, outputPreferenceSchema, type OutputPreference } from '@xpert-ai/contracts'
import { OutputPreferences } from './output/output-preferences'
import { Body, Controller, Get, Header, Headers, Param, Post, Put, Query, Sse } from '@nestjs/common'
import { UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { z } from 'zod/v3'
import { DataSource } from 'typeorm'
import {
    invalidNotification,
    notificationClientQuerySchema,
    notificationPageSchema
} from '../announcement/announcement.controller'
import { UserNotificationService } from './notification.service'
import { NotificationRealtime } from './notification.realtime'
import { announcementManagementScope, notificationScope, notificationStreamLifetime } from './notification.scope'
import { NotificationOutbox } from './notification.entities'

const outputVersion = { outputs: z.literal('1').optional() }
const page = notificationPageSchema.extend(outputVersion)
const sync = notificationClientQuerySchema.extend(outputVersion)

@Controller('user-notifications')
export class UserNotificationController {
    constructor(
        private readonly service: UserNotificationService,
        private readonly preferences: OutputPreferences,
        private readonly realtime: NotificationRealtime
    ) {}
    @Get()
    @Header('Cache-Control', 'no-store')
    list(
        @Query(new ZodValidationPipe(page, invalidNotification))
        query: z.output<typeof page>,
        @Headers('accept') accept?: string
    ) {
        return this.service.list(query.offset, query.limit, accept === AGENT_OUTPUT_ACCEPT || query.outputs === '1')
    }
    @Get('sync')
    @Header('Cache-Control', 'no-store')
    sync(
        @Query(new ZodValidationPipe(sync, invalidNotification))
        query: z.output<typeof sync>,
        @Headers('accept') accept?: string
    ) {
        return this.service.snapshot(query.client, accept === AGENT_OUTPUT_ACCEPT || query.outputs === '1')
    }
    @Get('preferences') listPreferences() {
        return this.preferences.list()
    }
    @Put('preferences') savePreference(
        @Body(new ZodValidationPipe(outputPreferenceSchema, invalidNotification)) input: OutputPreference
    ) {
        return this.preferences.save(input)
    }
    @Sse('stream')
    @Header('Cache-Control', 'no-store')
    @Header('X-Accel-Buffering', 'no')
    stream() {
        return this.realtime.stream(notificationScope(), notificationStreamLifetime())
    }
    @Put(':id/read') read(@Param('id', UUIDValidationPipe) id: string) {
        return this.service.read(id)
    }
}

@Controller('notification-delivery-admin')
export class NotificationDeliveryAdminController {
    constructor(
        private readonly database: DataSource,
        private readonly realtime: NotificationRealtime
    ) {}
    @Get() async status() {
        const { tenantId } = announcementManagementScope()
        const repository = this.database.getRepository(NotificationOutbox)
        const [pending, blocked] = await Promise.all([
            repository.countBy({ tenantId, state: 'pending' }),
            repository.find({
                where: { tenantId, state: 'blocked' },
                select: ['id', 'createdAt', 'attempts', 'lastError'],
                take: 50,
                order: { createdAt: 'ASC' }
            })
        ])
        const due = await repository
            .createQueryBuilder('o')
            .select('MIN(o.availableAt)', 'oldest')
            .addSelect('COUNT(*)', 'count')
            .where('o.tenantId = :tenantId AND o.state = :state AND o.availableAt <= CURRENT_TIMESTAMP', {
                tenantId,
                state: 'pending'
            })
            .getRawOne<{ oldest: Date | null; count: string }>()
        return {
            pending,
            blocked,
            due: Number(due.count),
            oldestDueAt: due.oldest,
            activeConnectionsOnInstance: this.realtime.activeConnections(tenantId)
        }
    }
    @Post(':id/retry') async retry(@Param('id', UUIDValidationPipe) id: string) {
        const { tenantId } = announcementManagementScope()
        const result = await this.database
            .getRepository(NotificationOutbox)
            .update({ id, tenantId, state: 'blocked' }, { state: 'pending', attempts: 0, availableAt: new Date() })
        return { scheduled: result.affected === 1 }
    }
}
