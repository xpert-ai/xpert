import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { AssistantSharingService } from './sharing.service'
import {
    sharingGroupsSchema,
    SharingGroupsInput,
    sharingSearchSchema,
    SharingSearch,
    sharingUserIdsSchema,
    SharingUsersInput
} from './sharing.schema'
const invalid = () => new BadRequestException(t('server-ai:Error.AssistantSharingInvalidInput'))
@Controller()
export class AssistantSharingController {
    constructor(private readonly sharing: AssistantSharingService) {}
    @Get(':id/sharing')
    get(@Param('id', UUIDValidationPipe) id: string) {
        return this.sharing.get(id)
    }
    @Get(':id/sharing/users')
    users(
        @Param('id', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(sharingSearchSchema, invalid)) query: SharingSearch
    ) {
        return this.sharing.candidates(id, query)
    }
    @Get(':id/sharing/groups')
    groups(
        @Param('id', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(sharingSearchSchema, invalid)) query: SharingSearch
    ) {
        return this.sharing.candidates(id, query, true)
    }
    @Post(':id/sharing/users')
    async share(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(sharingUserIdsSchema, invalid)) input: SharingUsersInput
    ) {
        await this.sharing.grantUsers(id, input.userIds)
        return this.sharing.get(id)
    }
    @Delete(':id/sharing/users/:userId')
    async revoke(@Param('id', UUIDValidationPipe) id: string, @Param('userId', UUIDValidationPipe) userId: string) {
        await this.sharing.revokeUser(id, userId)
        return this.sharing.get(id)
    }
    @Put(':id/sharing/groups')
    async saveGroups(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(sharingGroupsSchema, invalid)) input: SharingGroupsInput
    ) {
        await this.sharing.setGroups(id, input.groupIds, input.revision)
        return this.sharing.get(id)
    }
}
