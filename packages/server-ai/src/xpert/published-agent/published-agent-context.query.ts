import { ForbiddenException } from '@nestjs/common'
import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { resolveRuntimeXpert } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, type AgentMiddlewarePublishedContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { resolveTemplateSourceFromOptions } from '../template-source'
import { agentCapabilities } from './agent-capabilities'

/** Describe only the accessible published revision; runtime actions still recheck their own authority. */
export class PublishedAgentContextQuery extends Query<AgentMiddlewarePublishedContext> {
    constructor(readonly xpertId: string) {
        super()
    }
}
@QueryHandler(PublishedAgentContextQuery)
export class PublishedAgentContextHandler implements IQueryHandler<PublishedAgentContextQuery> {
    constructor(
        private readonly access: PublishedXpertAccessService,
        private readonly middleware: AgentMiddlewareRegistry
    ) {}
    async execute(query: PublishedAgentContextQuery): Promise<AgentMiddlewarePublishedContext> {
        const xpert = resolveRuntimeXpert(
            await this.access.getAccessiblePublishedXpert(query.xpertId, { relations: ['agent'] }),
            false
        )
        if (!xpert.publishAt || xpert.active === false)
            throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
        const context = agentCapabilities(xpert, this.middleware),
            source = resolveTemplateSourceFromOptions(xpert.options)
        return {
            primaryAgentKey: context.agentKey,
            publishedVersion: xpert.version,
            templateSource: source ? { pluginName: source.pluginName, templateKey: source.templateKey } : null,
            features: context.features,
            availableAgents: context.availableAgents
        }
    }
}
