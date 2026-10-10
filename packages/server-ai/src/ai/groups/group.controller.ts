import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard, AllowClientSecretBindings } from '@xpert-ai/server-core'
import { GroupRuntimeViewService } from '../../chat-group/group-runtime-view.service'
import { GroupCatalogService } from '../../chat-group/group-catalog.service'
import { GroupInteractionsService } from '../../chat-group/group-interactions.service'
import { groupClaimSchema, groupInteractionResponseSchema } from '../../chat-group/group-interactions.schema'
import { GroupControlService } from '../../chat-group/group-control.service'
import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Sse, UseGuards } from '@nestjs/common'
import { Public, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { z } from 'zod'
import { Query } from '@nestjs/common'
import { GroupMembersService } from '../../chat-group/group-members.service'
import { GroupMessagesService } from '../../chat-group/group-messages.service'
import { GroupOutboxService } from '../../chat-group/group-outbox.service'
import { GroupStreamService } from '../../chat-group/group-stream.service'
import { GroupScopeGuard } from './group-scope.guard'
import {
    groupCandidatesSchema,
    groupControlSchema,
    groupCreateSchema,
    groupHistorySchema,
    groupMemberSchema,
    groupPreferencesSchema,
    groupHumanSendSchema
} from '../../chat-group/group.schema'
import { groupInvalid } from '../../chat-group/group.errors'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.USER_CONVERSATION)
@UseGuards(ApiKeyOrClientSecretAuthGuard, GroupScopeGuard)
@Controller('groups')
export class GroupsController {
    constructor(
        private readonly members: GroupMembersService,
        private readonly messages: GroupMessagesService,
        private readonly outbox: GroupOutboxService,
        private readonly streams: GroupStreamService,
        private readonly controls: GroupControlService,
        private readonly interactions: GroupInteractionsService,
        private readonly catalog: GroupCatalogService,
        private readonly runtimeView: GroupRuntimeViewService
    ) {}
    @Get()
    list() {
        return this.catalog.list()
    }
    @Get('candidates')
    candidates(
        @Query(new ZodValidationPipe(groupCandidatesSchema, groupInvalid)) input: z.output<typeof groupCandidatesSchema>
    ) {
        return this.catalog.candidates(input.kind, input.search)
    }
    @Get(':groupId/candidates')
    memberCandidates(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(groupCandidatesSchema, groupInvalid)) input: z.output<typeof groupCandidatesSchema>
    ) {
        return this.catalog.candidates(input.kind, input.search, id)
    }
    @Post()
    create(@Body(new ZodValidationPipe(groupCreateSchema, groupInvalid)) input: z.output<typeof groupCreateSchema>) {
        return this.members.create(input)
    }
    @Get(':groupId')
    snapshot(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(groupHistorySchema, groupInvalid)) input: z.output<typeof groupHistorySchema>
    ) {
        return this.messages.snapshot(id, input.before, input.limit)
    }
    @Post(':groupId/members')
    add(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(groupMemberSchema, groupInvalid)) input: z.output<typeof groupMemberSchema>
    ) {
        return this.members.add(id, input)
    }
    @Delete(':groupId/members/:participantId')
    remove(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Param('participantId', UUIDValidationPipe) participantId: string
    ) {
        return this.members.remove(id, participantId)
    }
    @Get(':groupId/messages/:messageId/runtime/:participantId')
    runtime(
        @Param('groupId', UUIDValidationPipe) groupId: string,
        @Param('messageId', UUIDValidationPipe) messageId: string,
        @Param('participantId', UUIDValidationPipe) participantId: string
    ) {
        return this.runtimeView.get(groupId, messageId, participantId)
    }
    @Post(':groupId/messages')
    async send(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(groupHumanSendSchema, groupInvalid)) input: z.output<typeof groupHumanSendSchema>
    ) {
        const message = await this.messages.submit(id, input)
        await this.outbox.flush(id)
        return message
    }
    @Patch(':groupId/preferences')
    preferences(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(groupPreferencesSchema, groupInvalid))
        input: z.output<typeof groupPreferencesSchema>
    ) {
        return this.messages.preferences(id, input)
    }
    @Post(':groupId/members/:participantId/control')
    control(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Param('participantId', UUIDValidationPipe) participantId: string,
        @Body(new ZodValidationPipe(groupControlSchema, groupInvalid)) input: z.output<typeof groupControlSchema>
    ) {
        return this.controls.act(id, participantId, input)
    }
    @Post(':groupId/messages/:messageId/recipients/:participantId/cancel')
    cancelDelivery(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Param('messageId', UUIDValidationPipe) messageId: string,
        @Param('participantId', UUIDValidationPipe) participantId: string
    ) {
        return this.controls.cancelDelivery(id, messageId, participantId)
    }
    @Post(':groupId/interactions/:interactionId/claim')
    claim(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Param('interactionId', UUIDValidationPipe) interactionId: string,
        @Body(new ZodValidationPipe(groupClaimSchema, groupInvalid)) input: z.output<typeof groupClaimSchema>
    ) {
        return this.interactions.claim(id, interactionId, input.claimId)
    }
    @Post(':groupId/interactions/:interactionId/respond')
    respond(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Param('interactionId', UUIDValidationPipe) interactionId: string,
        @Body(new ZodValidationPipe(groupInteractionResponseSchema, groupInvalid))
        input: z.output<typeof groupInteractionResponseSchema>
    ) {
        return this.interactions.respond(id, interactionId, input)
    }
    @Sse(':groupId/stream')
    stream(@Param('groupId', UUIDValidationPipe) id: string, @Headers('last-event-id') cursor?: string) {
        return this.streams.observe(id, cursor)
    }
}
