import { SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertBillingPayer } from '../membership/membership.service'
import { currentServiceOperation } from '../shared/service-operation'

/** Model validation during a scoped delivery checks the beneficiary's rights, never the technical creator's balance. */
export function resolveCatalogBillingPayer(input: { tenantId: string; organizationId?: string | null; userId: string }): XpertBillingPayer {
    const maintenance = currentServiceOperation()
    if (maintenance && input.userId === maintenance.subjectId && input.tenantId === maintenance.tenantId &&
        input.organizationId === maintenance.organizationId) return XpertBillingPayer.RuntimeUser
    const principal = RequestContext.currentApiPrincipal()
    if (principal) {
        const delegated = (principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT ||
            principal.clientSecretBindingType === SecretTokenBindingType.ENTERPRISE_XPERT) &&
            principal.requestedUserId?.trim() === input.userId
        return delegated ? XpertBillingPayer.RuntimeUser : XpertBillingPayer.Creator
    }
    const currentUser = RequestContext.currentUser()
    return currentUser?.id === input.userId && currentUser.type === UserType.USER
        ? XpertBillingPayer.RuntimeUser : XpertBillingPayer.Creator
}
