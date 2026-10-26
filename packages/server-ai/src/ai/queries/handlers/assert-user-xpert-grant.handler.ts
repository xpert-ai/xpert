import { ForbiddenException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AssertUserXpertGrantQuery } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { PublishedXpertAccessService } from '../../../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../../../xpert-project/services/project-access.service'
import { WorkbenchAssistantConversationNavigationService } from '../../../chat-conversation/workbench-assistant-conversation-navigation.service'

@QueryHandler(AssertUserXpertGrantQuery)
export class AssertUserXpertGrantHandler implements IQueryHandler<AssertUserXpertGrantQuery> {
    constructor(
        private readonly assistants: PublishedXpertAccessService,
        private readonly projects: XpertProjectAccessService,
        private readonly navigation: WorkbenchAssistantConversationNavigationService
    ) {}

    async execute() {
        const principal = RequestContext.currentApiPrincipal()
        if (
            principal?.clientSecretBindingType !== SecretTokenBindingType.USER_XPERT ||
            principal.resourceScope?.kind !== 'assistant'
        )
            throw denied()
        const id = principal.resourceScope.xpertId
        const source = principal.grantSource
        if (!source || source.kind === 'assistant') {
            // Legacy secrets have no provenance: only a current direct grant can validate them.
            // Never infer a Project delegation from unrelated membership or token ownership.
            await this.assistants.getAccessiblePublishedXpertForCurrentUser(id)
        } else if (source.kind === 'project') {
            await this.projects.assertCanReadXpert(source.projectId, id)
        } else {
            const result = await this.navigation.resolve(source.conversationId, source.requesterXpertId)
            if (result.xpertId !== id) throw denied()
        }
    }
}

function denied() {
    return new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
}
