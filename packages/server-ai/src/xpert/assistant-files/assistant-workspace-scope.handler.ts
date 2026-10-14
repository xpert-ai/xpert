// Technical actors retain their identity. Only Assistant file storage follows their creator.
// Resolve the persisted principal binding, never a caller's API-key owner or requested file user.
import { ForbiddenException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { UserType } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { resolveXpertDataVolumeScope, XpertDataVolumeScope } from '../../shared/volume/volume'
import { Xpert } from '../xpert.entity'
import { ResolveAssistantWorkspaceScopeCommand } from './resolve-assistant-workspace-scope.command'

@CommandHandler(ResolveAssistantWorkspaceScopeCommand)
export class AssistantWorkspaceScopeHandler implements ICommandHandler<ResolveAssistantWorkspaceScopeCommand> {
    constructor(@InjectRepository(Xpert) private readonly repository: Repository<Xpert>) {}

    async execute({ input }: ResolveAssistantWorkspaceScopeCommand): Promise<XpertDataVolumeScope> {
        const scope = resolveXpertDataVolumeScope(input)
        if (scope.catalog !== 'user-xperts') return scope

        // The principal's server-issued identity points back to the original Assistant.
        // Copies and version backups may retain userId; neither defines its owner.
        const assistant = await this.repository
            .createQueryBuilder('assistant')
            .innerJoin('assistant.user', 'principal')
            .leftJoinAndSelect('assistant.createdBy', 'owner')
            .where('assistant."tenantId" = :tenantId', { tenantId: scope.tenantId })
            .andWhere('principal."tenantId" = :tenantId')
            .andWhere('principal.id = :userId', { userId: scope.userId })
            .andWhere('principal.type = :type', { type: UserType.COMMUNICATION })
            .andWhere('principal."thirdPartyId" = CONCAT(CAST(:prefix AS text), assistant.id)', { prefix: 'xpert:' })
            .getOne()
        if (!assistant) return scope
        const owner = assistant.createdBy
        if (!owner?.id || owner.type !== UserType.USER || owner.tenantId !== scope.tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.WorkspaceFileAccessDenied', { defaultValue: 'Workspace file access was denied.' })
            )
        }
        return { ...scope, userId: owner.id }
    }
}
