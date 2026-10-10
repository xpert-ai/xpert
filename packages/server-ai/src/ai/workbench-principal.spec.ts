import { ApiKeyBindingType, IApiPrincipal, IChatConversation, IUser, SecretTokenBindingType } from '@xpert-ai/contracts'
import { assertWorkbenchPrincipal } from './workbench-principal'

const principal = {
    id: 'user',
    tenantId: 'tenant',
    principalType: 'client_secret',
    clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
    requestedOrganizationId: 'org',
    resourceScope: { kind: 'assistant', xpertId: 'assistant' },
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
        expect(() => assertWorkbenchPrincipal({ ...principal, resourceScope: undefined })).toThrow()
    })
    it('leaves ordinary login users to the existing service access policy', () => {
        expect(() => assertWorkbenchPrincipal({ id: 'user', tenantId: 'tenant' } as IUser, conversation)).not.toThrow()
    })
})

it('uses the canonical audience even if deprecated key metadata names another Assistant', () => {
    const scoped = { ...principal, apiKey: { ...principal.apiKey!, entityId: 'old-metadata' } }
    expect(() => assertWorkbenchPrincipal(scoped, conversation)).not.toThrow()
    expect(() => assertWorkbenchPrincipal(scoped, { ...conversation, xpertId: 'old-metadata' })).toThrow()
})
it('accepts normalized Assistant sessions without a synthetic API key', () => {
    expect(() => assertWorkbenchPrincipal({ ...principal, apiKey: undefined }, conversation)).not.toThrow()
})
it.each([
    { kind: 'workspace', workspaceId: 'assistant' },
    { kind: 'conversation', conversationId: 'assistant' }
] as const)('does not confuse %s scope with an Assistant ID', (resourceScope) => {
    expect(() => assertWorkbenchPrincipal({ ...principal, resourceScope }, conversation)).toThrow()
})
