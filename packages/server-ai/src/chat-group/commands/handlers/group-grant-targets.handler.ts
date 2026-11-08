import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { XpertProject } from '../../../xpert-project/entities/project.entity'
import { GroupParticipant } from '../../group.entity'
import { GroupAccessService } from '../../group-access.service'
import { groupDenied } from '../../group.errors'
import { ListGroupGrantTargetsCommand } from '../group-grant-targets.command'

@CommandHandler(ListGroupGrantTargetsCommand)
export class ListGroupGrantTargetsHandler implements ICommandHandler<ListGroupGrantTargetsCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService
    ) {}
    async execute({ page }: ListGroupGrantTargetsCommand) {
        if (RequestContext.currentApiPrincipal() || RequestContext.currentApiKey()) throw groupDenied()
        const { userId, ...scope } = this.access.scope()
        await this.access.user(scope, userId)
        const rows = await this.db
            .getRepository(ChatConversation)
            .createQueryBuilder('g')
            .innerJoin(
                GroupParticipant,
                'm',
                'm."groupId" = g.id AND m."tenantId" = g."tenantId" AND m."organizationId" = g."organizationId"'
            )
            .innerJoin(
                XpertProject,
                'p',
                'p.id = g."projectId" AND p."tenantId" = g."tenantId" AND p."organizationId" = g."organizationId"'
            )
            .where({ ...scope, purpose: 'group' })
            .andWhere('m."subjectId" = :userId AND m.kind = :kind AND m.active = true', { userId, kind: 'user' })
            .andWhere('p.status != :archived', { archived: 'archived' })
            .orderBy('g.id', 'ASC')
            .skip(page.offset)
            .take(page.limit)
            .getMany()
        return {
            items: rows.map((g) => ({ id: g.id, title: g.title, projectId: g.projectId })),
            nextOffset: rows.length === page.limit ? page.offset + page.limit : null
        }
    }
}
