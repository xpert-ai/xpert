import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TXpertTeamDraft } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { t } from 'i18next'
import { Xpert } from '../xpert.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { fingerprint } from '../../xpert-template/lifecycle/portable-template'

@Injectable()
export class TemplateAuthoring {
    constructor(
        private readonly database: DataSource,
        private readonly access: XpertWorkspaceAccessService
    ) {}
    async load(id: string) {
        const organizationId = RequestContext.getOrganizationId()
        const xpert =
            organizationId &&
            (await this.database.getRepository(Xpert).findOne({
                where: { id, tenantId: RequestContext.currentTenantId(), organizationId },
                relations: ['agent', 'agent.copilotModel', 'copilotModel', 'agents']
            }))
        if (!xpert?.workspaceId) throw new ForbiddenException(t('server-ai:Error.AssistantConfigurationForbidden'))
        await this.access.assertCanAuthor(xpert.workspaceId)
        const { draft: saved, graph, agents, ...team } = xpert
        if (!saved && !graph) throw new BadRequestException(t('server-ai:Error.TemplateCapabilityDraftInvalid'))
        const draft: TXpertTeamDraft = structuredClone({
            team: { ...team, ...saved?.team, agent: saved?.team?.agent ?? xpert.agent },
            nodes: saved?.nodes ?? graph.nodes,
            connections: saved?.connections ?? graph.connections
        })
        return { xpert, draft, revision: fingerprint([xpert.updatedAt, saved, graph]) }
    }
}
