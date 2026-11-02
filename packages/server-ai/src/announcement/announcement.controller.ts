import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { z } from 'zod/v3'
import {
    announcementRevisionSchema,
    createAnnouncementSchema,
    notificationClientSchema,
    updateAnnouncementSchema
} from '@xpert-ai/contracts'
import { notificationError } from '../user-notification/notification.errors'
import { AnnouncementService } from './announcement.service'

export const notificationPageSchema = z
    .object({
        offset: z.coerce.number().int().min(0).max(100000).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(30)
    })
    .strict()
export const notificationClientQuerySchema = z.object({ client: notificationClientSchema }).strict()
const historySchema = notificationPageSchema.extend({ client: notificationClientSchema })
export const invalidNotification = () => notificationError('invalid')

@Controller('announcements')
export class AnnouncementController {
    constructor(private readonly announcements: AnnouncementService) {}
    @Get('pending') pending(
        @Query(new ZodValidationPipe(notificationClientQuerySchema, invalidNotification))
        query: z.output<typeof notificationClientQuerySchema>
    ) {
        return this.announcements.list(query.client, true)
    }
    @Get('history') history(
        @Query(new ZodValidationPipe(historySchema, invalidNotification)) query: z.output<typeof historySchema>
    ) {
        return this.announcements.list(query.client, false, query.offset, query.limit)
    }
    @Get(':id') get(
        @Param('id', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(notificationClientQuerySchema, invalidNotification))
        query: z.output<typeof notificationClientQuerySchema>
    ) {
        return this.announcements.get(id, query.client)
    }
    @Put(':id/dismissal') dismiss(@Param('id', UUIDValidationPipe) id: string) {
        return this.announcements.dismiss(id)
    }
}

@Controller('announcement-admin')
export class AnnouncementAdminController {
    constructor(private readonly announcements: AnnouncementService) {}
    @Get() list(
        @Query(new ZodValidationPipe(notificationPageSchema, invalidNotification))
        query: z.output<typeof notificationPageSchema>
    ) {
        return this.announcements.adminList(query.offset, query.limit)
    }
    @Post() create(
        @Body(new ZodValidationPipe(createAnnouncementSchema, invalidNotification))
        input: z.output<typeof createAnnouncementSchema>
    ) {
        return this.announcements.create(input)
    }
    @Patch(':id') update(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(updateAnnouncementSchema, invalidNotification))
        input: z.output<typeof updateAnnouncementSchema>
    ) {
        return this.announcements.update(id, input)
    }
    @Post(':id/publish') publish(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(announcementRevisionSchema, invalidNotification))
        input: z.output<typeof announcementRevisionSchema>
    ) {
        return this.announcements.publish(id, input.revision)
    }
    @Post(':id/withdraw') withdraw(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(announcementRevisionSchema, invalidNotification))
        input: z.output<typeof announcementRevisionSchema>
    ) {
        return this.announcements.withdraw(id, input.revision)
    }
    @Get(':id/audit') audit(@Param('id', UUIDValidationPipe) id: string) {
        return this.announcements.auditHistory(id)
    }
}
