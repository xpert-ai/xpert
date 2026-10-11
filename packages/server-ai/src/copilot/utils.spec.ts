import { CredentialFormTypeEnum, ICopilot, ICopilotProviderModel, ModelCredentialSchema } from '@xpert-ai/contracts'
import { usesOrganizationCredentials } from './utils'

describe('usesOrganizationCredentials', () => {
    const copilot: Pick<ICopilot, 'modelProvider'> = {
        modelProvider: { id: 'provider-1', organizationId: 'org-1', credentials: null, isValid: null }
    }
    const model: ICopilotProviderModel = {
        providerId: 'provider-1',
        isValid: null,
        modelProperties: { access_token: 'test-key' }
    }
    const schema: ModelCredentialSchema = {
        model: { label: { en_US: 'Model' } },
        credential_form_schemas: [
            {
                variable: 'access_token',
                type: CredentialFormTypeEnum.SECRET_INPUT,
                label: { en_US: 'Token' },
                placeholder: { en_US: 'Token' },
                required: false
            }
        ]
    }

    it('recognizes model secrets using the schema rather than a particular key name', () => {
        expect(usesOrganizationCredentials(copilot, 'org-1', model, schema)).toBe(true)
    })

    it.each([undefined, null, '', '  ', 123, false, {}, []])('ignores an empty or non-string secret: %p', (value) => {
        expect(
            usesOrganizationCredentials(
                copilot,
                'org-1',
                {
                    ...model,
                    modelProperties: { access_token: value }
                },
                schema
            )
        ).toBe(false)
    })

    it('does not treat ordinary settings or undeclared keys as credentials', () => {
        expect(
            usesOrganizationCredentials(
                copilot,
                'org-1',
                {
                    ...model,
                    modelProperties: {
                        api_key: 'undeclared-key',
                        endpoint_url: 'https://example.com/v1',
                        context_size: 4096
                    }
                },
                schema
            )
        ).toBe(false)
        expect(
            usesOrganizationCredentials(copilot, 'org-1', model, {
                ...schema,
                credential_form_schemas: [
                    { ...schema.credential_form_schemas[0], type: CredentialFormTypeEnum.TEXT_INPUT }
                ]
            })
        ).toBe(false)
    })

    it('requires the model and its credential schema', () => {
        expect(usesOrganizationCredentials(copilot, 'org-1', null, schema)).toBe(false)
        expect(usesOrganizationCredentials(copilot, 'org-1', model)).toBe(false)
    })

    it('does not accept a secret from another provider or an invalid model', () => {
        expect(usesOrganizationCredentials(copilot, 'org-1', { ...model, providerId: 'other' }, schema)).toBe(false)
        expect(usesOrganizationCredentials(copilot, 'org-1', { ...model, isValid: false }, schema)).toBe(false)
    })

    it.each([undefined, null, 'other-org'])('requires the owning organization: %p', (organizationId) => {
        expect(usesOrganizationCredentials(copilot, organizationId, model, schema)).toBe(false)
    })

    it('rejects a missing or invalid provider', () => {
        expect(usesOrganizationCredentials({}, 'org-1', model, schema)).toBe(false)
        expect(
            usesOrganizationCredentials(
                {
                    modelProvider: { ...copilot.modelProvider, isValid: false }
                },
                'org-1',
                model,
                schema
            )
        ).toBe(false)
    })

    it('preserves existing provider credential recognition without requiring a model schema', () => {
        expect(
            usesOrganizationCredentials(
                {
                    modelProvider: { ...copilot.modelProvider, credentials: { configured: 'provider-secret' } }
                },
                'org-1'
            )
        ).toBe(true)
    })
})
