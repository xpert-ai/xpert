import { UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertBillingPayer } from '../../membership/membership.service'
import { runWithServiceOperation } from '../../shared/service-operation'
import { resolveCatalogBillingPayer } from './model-access-payer'

describe('scoped maintenance model entitlement subject', () => {
    afterEach(() => jest.restoreAllMocks())
    it.each(['matching', 'user', 'tenant', 'organization', 'actor'])(
        'uses only the matching beneficiary with %s context',
        async (kind) => {
            jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
            jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(kind === 'actor' ? 'other' : 'actor')
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
            jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
                id: kind === 'actor' ? 'other' : 'actor',
                tenantId: 'tenant',
                type: UserType.COMMUNICATION
            } as never)
            const payer = await runWithServiceOperation(
                {
                    tenantId: 'tenant',
                    organizationId: 'organization',
                    actorId: 'actor',
                    subjectId: 'beneficiary',
                    application: { pluginName: 'plugin', appName: 'app' }
                },
                async () =>
                    resolveCatalogBillingPayer({
                        tenantId: kind === 'tenant' ? 'other' : 'tenant',
                        organizationId: kind === 'organization' ? 'other' : 'organization',
                        userId: kind === 'user' ? 'other' : 'beneficiary'
                    })
            )
            expect(payer).toBe(kind === 'matching' ? XpertBillingPayer.RuntimeUser : XpertBillingPayer.Creator)
        }
    )
})
