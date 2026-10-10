// Invariants: personal Assistants must not inherit a shared workspace's audience or credentials.
// Creation is serialized by the caller; organization access is resolved by the shared policy command.
import { ForbiddenException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from '../../workspace-access.service'
import { XpertWorkspace } from '../../workspace.entity'
import { EnsurePersonalDefaultWorkspaceCommand } from '../ensure-personal-default-workspace.command'

@CommandHandler(EnsurePersonalDefaultWorkspaceCommand)
export class EnsurePersonalDefaultWorkspaceHandler implements ICommandHandler<EnsurePersonalDefaultWorkspaceCommand> {
    constructor(
        @InjectRepository(XpertWorkspace) private readonly workspaces: Repository<XpertWorkspace>,
        private readonly commands: CommandBus,
        private readonly access: XpertWorkspaceAccessService
    ) {}

    async execute({ name }: EnsurePersonalDefaultWorkspaceCommand): Promise<XpertWorkspace> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !userId) {
            throw new ForbiddenException(t('server-ai:Error.PersonalWorkspaceScopeRequired'))
        }
        const user = await this.commands.execute(
            new ResolveUserOrganizationAccessCommand({ tenantId, organizationId, userId })
        )
        if (!user) {
            throw new ForbiddenException(t('server-ai:Error.PersonalWorkspaceOrganizationAccessDenied'))
        }

        const candidates = await this.workspaces
            .createQueryBuilder('workspace')
            .leftJoinAndSelect('workspace.members', 'members')
            .where('workspace.tenantId = :tenantId', { tenantId })
            .andWhere('workspace.organizationId = :organizationId', { organizationId })
            .andWhere('workspace.ownerId = :userId', { userId })
            .andWhere(`COALESCE((workspace.settings)::jsonb -> 'system' ->> 'kind', '') = :kind`, {
                kind: 'user-default'
            })
            // ownerId makes the shared parameter a UUID; JSON ->> yields text.
            .andWhere(`COALESCE((workspace.settings)::jsonb -> 'system' ->> 'userId', '') = CAST(:userId AS text)`, {
                userId
            })
            .orderBy('workspace.createdAt', 'ASC')
            .addOrderBy('workspace.id', 'ASC')
            .getMany()
        const existing = candidates.find(
            (workspace) =>
                (!workspace.status || workspace.status === 'active') &&
                (workspace.settings?.access?.visibility ?? 'private') === 'private' &&
                !workspace.members?.length
        )
        if (existing) {
            await this.access.assertCanAuthor(existing.id)
            return existing
        }

        const workspace = await this.workspaces.save(
            this.workspaces.create({
                name,
                tenantId,
                organizationId,
                ownerId: userId,
                createdBy: { id: userId },
                updatedBy: { id: userId },
                status: 'active',
                members: [],
                settings: { access: { visibility: 'private' }, system: { kind: 'user-default', userId } }
            })
        )
        await this.access.assertCanAuthor(workspace.id)
        return workspace
    }
}
