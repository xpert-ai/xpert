import { ApiKeyBindingType, IApiPrincipal, IChatConversation, IUser, SecretTokenBindingType } from '@xpert-ai/contracts'
import { assertWorkbenchPrincipal } from './workbench-principal'

const principal = {
    id: 'user',
    tenantId: 'tenant',
    principalType: 'client_secret',
    clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
    requestedOrganizationId: 'org',
    apiKey: { type: ApiKeyBindingType.ASSISTANT, entityId: 'assistant', tenantId: 'tenant', organizationId: 'org' }
} as IApiPrincipal
const conversation = {
    id: 'conversation',
    xpertId: 'assistant',
    tenantId: 'tenant',
    organizationId: 'org'
} as IChatConversation

describe('Workbench delegated authorization', () => {
    it('accepts a delegated user within the bound Assistant, tenant and organization', () => {
        expect(() => assertWorkbenchPrincipal(principal, conversation)).not.toThrow()
    })
    it.each([{ xpertId: 'another' }, { tenantId: 'another' }, { organizationId: 'another' }])(
        'rejects a conversation outside the credential scope: %p',
        (scope) => {
            expect(() => assertWorkbenchPrincipal(principal, { ...conversation, ...scope })).toThrow()
        }
    )
    it.each([
        SecretTokenBindingType.PUBLIC_XPERT,
        SecretTokenBindingType.ENTERPRISE_XPERT,
        SecretTokenBindingType.API_KEY
    ])('rejects non-interactive secret binding %s', (clientSecretBindingType) => {
        expect(() => assertWorkbenchPrincipal({ ...principal, clientSecretBindingType }, conversation)).toThrow()
    })
    it('rejects a mismatched requested organization or malformed Assistant binding', () => {
        expect(() => assertWorkbenchPrincipal({ ...principal, requestedOrganizationId: 'another' })).toThrow()
        expect(() => assertWorkbenchPrincipal({ ...principal, apiKey: undefined })).toThrow()
    })
    it('leaves ordinary login users to the existing service access policy', () => {
        expect(() => assertWorkbenchPrincipal({ id: 'user', tenantId: 'tenant' } as IUser, conversation)).not.toThrow()
    })
})
