import { t } from 'i18next'
import { BadRequestException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { type AssistantCapabilityToolsetBinding } from '@xpert-ai/contracts'
import { XpertWorkspaceAccessService } from '../../../xpert-workspace'
import { XpertToolset } from '../../xpert-toolset.entity'
import { ResolveCapabilityToolsetsQuery } from '../resolve-capability-toolsets.query'
import { resolveCapabilityToolsets } from '../../utils/capability-toolsets'

@QueryHandler(ResolveCapabilityToolsetsQuery)
export class ResolveCapabilityToolsetsHandler implements IQueryHandler<ResolveCapabilityToolsetsQuery> {
    constructor(
        @InjectRepository(XpertToolset) private readonly repository: Repository<XpertToolset>,
        private readonly access: XpertWorkspaceAccessService
    ) {}

    async execute(query: ResolveCapabilityToolsetsQuery): Promise<AssistantCapabilityToolsetBinding[]> {
        if (!query.workspaceId) throw new BadRequestException(t('server-ai:Error.CapabilityWorkspaceRequired'))
        const { workspace } = await this.access.assertCanAuthor(query.workspaceId)
        const candidates = await this.repository.find({
            where: { workspaceId: workspace.id, tenantId: workspace.tenantId },
            relations: ['tools']
        })
        return resolveCapabilityToolsets(query.requirements, candidates)
    }
}
