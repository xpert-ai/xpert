import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { BadRequestException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { ChatMessage } from './chat-message.entity'

@Injectable()
export class ChatMessageService extends TenantOrganizationAwareCrudService<ChatMessage> {
    private readonly logger = new Logger(ChatMessageService.name)

    constructor(
        @InjectRepository(ChatMessage)
        repository: Repository<ChatMessage>,
        readonly commandBus: CommandBus,
        readonly queryBus: QueryBus
    ) {
        super(repository)
    }

    async save(entity: Partial<ChatMessage>): Promise<ChatMessage> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()

        try {
            return await this.repository.save({
                ...entity,
                tenantId: tenantId ?? (entity as ChatMessage).tenantId,
                organizationId: organizationId ?? (entity as ChatMessage).organizationId
            })
        } catch (error) {
            this.logger.error(error)
            throw new BadRequestException(error)
        }
    }

    async deleteByIds(ids: string[]) {
        for await (const id of ids) {
            await this.softRemove(id)
        }
    }
}
