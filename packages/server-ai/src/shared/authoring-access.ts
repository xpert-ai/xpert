import { assistantRuntimeCredential } from '@xpert-ai/server-core'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'

export function assertAuthoringUser() {
    if (
        assistantRuntimeCredential(RequestContext.currentUser()) ||
        !RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT)
    ) {
        throw new ForbiddenException(
            t('server-ai:Error.ApplicationAuthoringDenied', {
                defaultValue: 'You do not have permission to access Assistant configuration.'
            })
        )
    }
}
