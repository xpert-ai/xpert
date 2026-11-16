import { Injectable } from '@nestjs/common'
import { USER_EVENT_INBOX_SLOT, type XpertViewHostContext, type XpertViewSlot } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ViewHostDefinition, type ViewHostDefinitionContract } from '@xpert-ai/server-core'

@Injectable()
@ViewHostDefinition('user')
export class UserInboxHostDefinition implements ViewHostDefinitionContract {
    readonly hostType = 'user'
    readonly slots: XpertViewSlot[] = [{ key: USER_EVENT_INBOX_SLOT, mode: 'sections' }]
    resolve(id: string) {
        return id === 'me' ? {} : null
    }
    canRead(context: XpertViewHostContext) {
        return (
            !RequestContext.currentApiPrincipal() &&
            !!context.organizationId &&
            !!context.tenantId &&
            !!context.userId &&
            context.hostId === 'me' &&
            context.userId === RequestContext.currentUserId()
        )
    }
}
