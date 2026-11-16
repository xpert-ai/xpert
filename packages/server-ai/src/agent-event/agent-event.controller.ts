import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    ForbiddenException,
    Get,
    NotFoundException,
    Param,
    ParseUUIDPipe,
    Query,
    Post
} from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CommandBus } from '@nestjs/cqrs'
import { z } from 'zod/v3'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { AssertProjectAssistantAccessCommand } from '../xpert-project/commands/assert-project-assistant-access.command'
import { AgentEventSources, sourceContext } from './agent-event.runtime'
import { AgentEventBindingService, type BindingChange } from './agent-event-binding.service'

import { EventBindingAccessService } from './event-binding-access.service'

import { timerSource } from './follow-up-timer.source'

const changeSchema = z
    .object({
        plugin: z.string().min(1).max(200),
        adapter: z.string().min(1).max(200),
        sourceBindingRef: z.string().min(1).max(256),
        projectId: z.string().uuid().optional(),
        expectedRevision: z.number().int().nonnegative(),
        enabled: z.boolean()
    })
    .strict()

@Controller('agent-event')
export class AgentEventController {
    constructor(
        private readonly access: EventBindingAccessService,
        private readonly bindings: AgentEventBindingService,
        private readonly sources: AgentEventSources,
        private readonly published: PublishedXpertAccessService,
        private readonly workspaces: XpertWorkspaceAccessService,
        private readonly commands: CommandBus
    ) {}

    @Post('assistants/:id/bindings')
    async configure(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
        const parsed = changeSchema.safeParse(body)
        if (!parsed.success) throw new BadRequestException('invalid_event_binding')
        const input = parsed.data as BindingChange
        if (
            input.plugin === timerSource.plugin &&
            input.adapter === timerSource.adapter &&
            input.expectedRevision === 0
        )
            throw new ForbiddenException('timer_binding_managed_by_agent')
        const actor = this.actor()
        const target = await this.published.getAccessiblePublishedXpert(id)
        if (!target.publishAt || !target.workspaceId || target.organizationId !== actor.organizationId)
            throw new ForbiddenException()
        await this.workspaces.assertCanAuthor(target.workspaceId)
        if (input.projectId) await this.commands.execute(new AssertProjectAssistantAccessCommand(input.projectId, id))
        const source = this.sources.resolve({
            organizationId: actor.organizationId,
            plugin: input.plugin,
            adapter: input.adapter
        })
        const binding = await this.bindings.configure(
            actor,
            {
                xpertId: id,
                workspaceId: target.workspaceId,
                publishedAt: target.publishAt
            },
            input
        )
        if (binding.state === 'enabled')
            return { bindingId: binding.id, revision: binding.revision, state: binding.state }
        await source.configure(sourceContext(binding, AbortSignal.timeout(15000)), input.enabled)
        if (input.enabled) await this.bindings.updateCapture(binding, true)
        return { bindingId: binding.id, revision: binding.revision, state: input.enabled ? 'enabled' : 'paused' }
    }

    private async ownedBinding(id: string) {
        const actor = this.actor()
        const binding = await this.bindings.findOwned(id, actor)
        if (!binding) throw new NotFoundException()
        await this.access.assertAccessible(binding)
        return binding
    }

    @Post('bindings/:id/rollback')
    async rollback(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
        const expected = z.object({ expectedRevision: z.number().int().positive() }).strict().safeParse(body)
        if (!expected.success) throw new BadRequestException('invalid_event_revision')
        const binding = await this.ownedBinding(id)
        if (binding.revision !== expected.data.expectedRevision || binding.state !== 'enabled')
            throw new ConflictException('event_revision_changed')
        // Changing only capture ownership preserves the authorization revision for existing host-owned facts.
        await this.sources.resolve(binding).configure(sourceContext(binding, AbortSignal.timeout(15000)), false)
        await this.bindings.updateCapture(binding, false)
        return { bindingId: id, revision: binding.revision, capture: false }
    }

    @Post('bindings/:id/retry/:receiptId')
    async retry(@Param('id', ParseUUIDPipe) id: string, @Param('receiptId', ParseUUIDPipe) receiptId: string) {
        const binding = await this.ownedBinding(id)
        await this.bindings.retry(binding, receiptId)
        return { receiptId, state: 'pending' }
    }

    @Get('bindings/:id')
    async diagnostics(@Param('id', ParseUUIDPipe) id: string) {
        const binding = await this.ownedBinding(id)
        return {
            bindingId: id,
            revision: binding.revision,
            state: binding.state,
            capture: binding.capture,
            lastScanAt: binding.lastScanAt,
            lastError: binding.lastError,
            ...(await this.bindings.diagnostics(id))
        }
    }

    @Get('bindings/:id/receipts')
    async receipts(@Param('id', ParseUUIDPipe) id: string, @Query('after') after?: string) {
        await this.ownedBinding(id)
        const cursor = after ?? '0'
        if (!/^[0-9]{1,19}$/.test(cursor) || BigInt(cursor) > BigInt('9223372036854775807'))
            throw new BadRequestException('invalid_receipt_cursor')
        return this.bindings.receipts(id, cursor)
    }

    @Get('receipts/:id')
    async receipt(@Param('id', ParseUUIDPipe) id: string) {
        const row = await this.bindings.findReceipt(id, this.actor())
        if (!row) throw new NotFoundException()
        await this.ownedBinding(row.binding)
        return row
    }

    private actor() {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !userId) throw new ForbiddenException('event_actor_required')
        return { tenantId, organizationId, userId }
    }
}
