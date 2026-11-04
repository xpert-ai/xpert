import { GetAccessiblePublishedXpertQuery } from '../published-agent/get-accessible-published-xpert.query'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserType } from '@xpert-ai/contracts'
import { createExecutionIdentity, projectExecutionUser } from '@xpert-ai/server-core'
import { ResolveAssistantPrincipalCommand } from './resolve-assistant-principal.command'
import { Xpert } from '../xpert.entity'
import { AssistantPrincipalAccessService, assistantPrincipalDenied } from './assistant-principal-access.service'

// This Assistant-domain adapter mints an identity only after live binding and actor authorization.
@CommandHandler(ResolveAssistantPrincipalCommand)
export class ResolveAssistantPrincipalHandler implements ICommandHandler<ResolveAssistantPrincipalCommand> {
    constructor(
        private readonly database: DataSource,
        private readonly access: AssistantPrincipalAccessService,
        private readonly queries: QueryBus
    ) {}

    async execute({ input }: ResolveAssistantPrincipalCommand) {
        if (!input.tenantId || !input.organizationId) {
            if (input.assistantId) throw assistantPrincipalDenied()
            return null
        }
        const assistant = input.assistantId
            ? await this.database.getRepository(Xpert).findOneBy({
                  id: input.assistantId,
                  tenantId: input.tenantId,
                  organizationId: input.organizationId,
                  latest: true
              })
            : null
        const userId = assistant?.userId ?? input.userId
        if (!userId || (input.assistantId && (!assistant || (input.userId && input.userId !== userId))))
            throw assistantPrincipalDenied()
        const actor = { tenantId: input.tenantId, organizationId: input.organizationId, userId }
        if (!(await this.access.isPrincipal(actor))) {
            if (input.assistantId) throw assistantPrincipalDenied()
            return null
        }
        const resolved = await this.access.find(actor, { assistantId: input.assistantId, projectId: input.projectId })
        if (!resolved) throw assistantPrincipalDenied()
        const current = RequestContext.currentUser()
        if (
            current &&
            (current.tenantId !== actor.tenantId ||
                (RequestContext.getOrganizationId() && RequestContext.getOrganizationId() !== actor.organizationId))
        )
            throw assistantPrincipalDenied()
        if (input.assistantId && current?.type === UserType.COMMUNICATION && current.id !== userId) {
            if (
                !input.projectId ||
                !(await this.access.find(
                    { ...actor, userId: current.id },
                    { projectId: input.projectId, assistantId: input.assistantId }
                ))
            )
                throw assistantPrincipalDenied()
        }
        if (input.assistantId && current?.type === UserType.USER)
            await this.queries.execute(new GetAccessiblePublishedXpertQuery(input.assistantId))
        if (resolved.user.type !== UserType.COMMUNICATION) throw assistantPrincipalDenied()
        return createExecutionIdentity(projectExecutionUser(resolved.user), { ...actor, kind: 'service' })
    }
}
