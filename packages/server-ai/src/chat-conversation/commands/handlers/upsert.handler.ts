import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationUpsertCommand } from '../upsert.command'
import { ChatConversation } from '../../conversation.entity'
import { applicationTracing } from '../../../tracing'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import { IsNull } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { RequestContext } from '@xpert-ai/server-core'

@CommandHandler(ChatConversationUpsertCommand)
export class ChatConversationUpsertHandler implements ICommandHandler<ChatConversationUpsertCommand> {
    constructor(private readonly service: ChatConversationService) {}

    public async execute(command: ChatConversationUpsertCommand): Promise<ChatConversation> {
        return applicationTracing.traceAsync(
            'conversation.upsert',
            {
                'conversation.id': command.entity.id,
                'conversation.status': command.entity.status,
                'conversation.operation': command.entity.id ? 'update' : 'create'
            },
            async () => {
                const entity = command.entity
                const tenantId = RequestContext.currentTenantId()
                const organizationId = RequestContext.getOrganizationId()
                if (!tenantId) {
                    throw this.scopeMismatch()
                }

                let id = entity.id
                if (id) {
                    const existing = await this.service.repository.findOne({
                        where: {
                            id,
                            tenantId,
                            organizationId: organizationId ?? IsNull()
                        }
                    })
                    if (!existing) {
                        const idAlreadyExists = await this.service.repository.existsBy({ id })
                        if (idAlreadyExists) {
                            throw this.scopeMismatch()
                        }

                        const newEntity = await this.service.create(entity)
                        id = newEntity.id
                    } else {
                        await this.service.assertAccess(existing, 'manage')
                        this.assertImmutableBindings(existing, entity)
                        const update = this.pickMutableFields(entity)
                        if (Object.keys(update).length > 0) {
                            await this.service.update(
                                {
                                    id,
                                    tenantId,
                                    organizationId: organizationId ?? IsNull()
                                },
                                update
                            )
                        }
                    }
                } else {
                    const newEntity = await this.service.create(entity)
                    id = newEntity.id
                }
                const result = await this.service.repository.findOne({
                    where: {
                        id,
                        tenantId,
                        organizationId: organizationId ?? IsNull()
                    },
                    relations: command.relations
                })
                if (!result) {
                    throw this.scopeMismatch()
                }
                return result
            }
        )
    }

    private scopeMismatch() {
        return new ForbiddenException(
            t('server-ai:Error.ConversationScopeMismatch', {
                defaultValue: 'The conversation does not belong to the current tenant and Organization'
            })
        )
    }

    private assertImmutableBindings(existing: ChatConversation, entity: ChatConversationUpsertCommand['entity']) {
        if (
            Object.prototype.hasOwnProperty.call(entity, 'projectId') &&
            (entity.projectId ?? null) !== (existing.projectId ?? null)
        ) {
            throw new ForbiddenException(
                t('server-ai:Error.ConversationProjectImmutable', {
                    defaultValue: 'A conversation cannot be moved to another Project'
                })
            )
        }
        if (
            Object.prototype.hasOwnProperty.call(entity, 'xpertId') &&
            (entity.xpertId ?? null) !== (existing.xpertId ?? null)
        ) {
            throw new ForbiddenException(
                t('server-ai:Error.ConversationXpertImmutable', {
                    defaultValue: 'A conversation cannot be moved to another Xpert'
                })
            )
        }
    }

    private pickMutableFields(
        entity: ChatConversationUpsertCommand['entity']
    ): QueryDeepPartialEntity<ChatConversation> {
        return {
            ...(entity.title !== undefined ? { title: entity.title } : {}),
            ...(entity.status !== undefined ? { status: entity.status } : {}),
            ...(entity.options !== undefined ? { options: entity.options } : {}),
            ...(entity.sourceAudit !== undefined ? { sourceAudit: entity.sourceAudit } : {}),
            ...(entity.error !== undefined ? { error: entity.error } : {}),
            ...(entity.operation !== undefined ? { operation: entity.operation } : {}),
            ...(entity.from !== undefined ? { from: entity.from } : {}),
            ...(entity.fromEndUserId !== undefined ? { fromEndUserId: entity.fromEndUserId } : {}),
            ...(entity.taskId !== undefined ? { taskId: entity.taskId } : {})
        }
    }
}
