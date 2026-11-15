import { ForbiddenException, NotFoundException } from '@nestjs/common'
import {
    AGENT_WORKBENCH_SLOT,
    EVENT_INBOX_FEATURE,
    USER_EVENT_INBOX_SLOT,
    SecretTokenBindingType,
    type IconDefinition,
    type XpertExtensionViewManifest,
    type XpertResolvedViewHostContext,
    type XpertViewQuery,
    type XpertViewActionRequest
} from '@xpert-ai/contracts'
import { RequestContext, ViewExtensionProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { builtinRemoteEntry } from '../../view-extension/builtin-remote-entry'
import { EventInboxService } from './event-inbox.service'

const provider = 'platform.event-inbox'
const title = { en_US: 'Event Inbox', zh_Hans: '事件收件箱' }
// The native menus use Lucide Inbox. Remote hosts receive its self-contained SVG.
const inboxIcon = {
    type: 'svg',
    alt: 'Event Inbox',
    value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>`
} satisfies IconDefinition

@ViewExtensionProvider(provider)
export class EventInboxViewProvider implements IXpertViewExtensionProvider {
    constructor(private readonly inbox: EventInboxService) {}
    supports(context: XpertResolvedViewHostContext) {
        const principal = RequestContext.currentApiPrincipal()
        if (
            !context.userId ||
            !context.organizationId ||
            context.userId !== RequestContext.currentUserId() ||
            context.tenantId !== RequestContext.currentTenantId() ||
            context.organizationId !== RequestContext.getOrganizationId()
        )
            return false
        if (context.hostType === 'user') return context.hostId === 'me' && !principal
        return (
            context.hostType === 'agent' &&
            (!principal ||
                (principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT &&
                    principal.resourceScope?.kind === 'assistant' &&
                    principal.resourceScope.xpertId === context.hostId))
        )
    }
    getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        if (
            !this.supports(context) ||
            slot !== (context.hostType === 'agent' ? AGENT_WORKBENCH_SLOT : USER_EVENT_INBOX_SLOT)
        )
            return []
        return [
            {
                key: 'inbox',
                title,
                icon: inboxIcon,
                hostType: context.hostType,
                slot,
                order: 50,
                source: { provider },
                refreshable: true,
                ...(context.hostType === 'agent'
                    ? {
                          activation: { requiredFeatures: [EVENT_INBOX_FEATURE] },
                          workbench: { openMode: 'on-demand', menu: { enabled: true, order: 50, icon: inboxIcon } }
                      }
                    : {}),
                view: {
                    type: 'remote_component',
                    runtime: 'react',
                    protocolVersion: 1,
                    component: { isolation: 'iframe', entry: 'event-inbox' },
                    dataSource: { mode: 'platform' }
                },
                dataSource: {
                    mode: 'platform',
                    cache: { enabled: false },
                    querySchema: {
                        supportsSelection: true,
                        supportsSearch: true,
                        supportsCursor: true,
                        supportsParameters: true,
                        supportsPagination: true,
                        defaultPageSize: 30
                    }
                },
                clientCommands: [{ key: 'open_conversation' }],
                actions: [
                    {
                        key: 'retry',
                        label: { en_US: 'Retry', zh_Hans: '重新尝试' },
                        actionType: 'invoke',
                        placement: 'row'
                    }
                ]
            }
        ]
    }
    getRemoteComponentEntry() {
        return builtinRemoteEntry(__dirname, 'event-inbox', 'Event Inbox')
    }
    getViewData(context: XpertResolvedViewHostContext, _key: string, query: XpertViewQuery) {
        if (!this.supports(context)) throw new ForbiddenException()
        return this.inbox.data(context, query)
    }
    executeViewAction(
        context: XpertResolvedViewHostContext,
        _key: string,
        key: string,
        request: XpertViewActionRequest
    ) {
        if (!this.supports(context)) throw new ForbiddenException()
        if (key !== 'retry' || !request.targetId) throw new NotFoundException()
        return this.inbox.retry(context, request.targetId)
    }
}
