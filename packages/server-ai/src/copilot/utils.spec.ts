import {
    AI_MODEL_TYPE_VARIABLE,
    AiModelTypeEnum,
    CredentialFormTypeEnum,
    FormShowOnObject,
    ICopilot,
    ICopilotProviderModel,
    ModelCredentialSchema
} from '@xpert-ai/contracts'
import { usesOrganizationCredentials } from './utils'

describe('usesOrganizationCredentials', () => {
    const copilot: Pick<ICopilot, 'modelProvider'> = {
        modelProvider: { id: 'provider-1', organizationId: 'org-1', credentials: null, isValid: null }
    }
    const model: ICopilotProviderModel = {
        providerId: 'provider-1',
        modelType: AiModelTypeEnum.LLM,
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

    function conditionalSchema(showOn: FormShowOnObject[]): ModelCredentialSchema {
        return {
            ...schema,
            credential_form_schemas: [{ ...schema.credential_form_schemas[0], show_on: showOn }]
        }
    }

    it.each([
        ['api_key', true],
        ['managed', false],
        [undefined, false],
        [false, false]
    ])('counts a retained secret only when auth_mode %p matches show_on', (authMode, expected) => {
        const configuredModel: ICopilotProviderModel = {
            ...model,
            modelProperties: { ...model.modelProperties, auth_mode: authMode }
        }
        expect(
            usesOrganizationCredentials(
                copilot,
                'org-1',
                configuredModel,
                conditionalSchema([{ variable: 'auth_mode', value: 'api_key' }])
            )
        ).toBe(expected)
    })

    it.each([
        [AiModelTypeEnum.RERANK, AiModelTypeEnum.LLM, true],
        [AiModelTypeEnum.LLM, AiModelTypeEnum.RERANK, false],
        [undefined, AiModelTypeEnum.RERANK, false]
    ])('uses saved model type %p rather than modelProperties.__model_type %p', (modelType, storedType, expected) => {
        const configuredModel: ICopilotProviderModel = {
            ...model,
            modelType,
            modelProperties: { ...model.modelProperties, [AI_MODEL_TYPE_VARIABLE]: storedType }
        }
        expect(
            usesOrganizationCredentials(
                copilot,
                'org-1',
                configuredModel,
                conditionalSchema([{ variable: AI_MODEL_TYPE_VARIABLE, value: AiModelTypeEnum.RERANK }])
            )
        ).toBe(expected)
    })

    it.each([
        [AiModelTypeEnum.LLM, 'api_key', true],
        [AiModelTypeEnum.LLM, 'managed', false],
        [AiModelTypeEnum.RERANK, 'api_key', false]
    ])('requires every model type and credential condition to match: %p / %p', (modelType, authMode, expected) => {
        const configuredModel: ICopilotProviderModel = {
            ...model,
            modelType,
            modelProperties: { ...model.modelProperties, auth_mode: authMode }
        }
        expect(
            usesOrganizationCredentials(
                copilot,
                'org-1',
                configuredModel,
                conditionalSchema([
                    { variable: AI_MODEL_TYPE_VARIABLE, value: AiModelTypeEnum.LLM },
                    { variable: 'auth_mode', value: 'api_key' }
                ])
            )
        ).toBe(expected)
    })

    it('keeps an empty show_on list unconditional', () => {
        expect(usesOrganizationCredentials(copilot, 'org-1', model, conditionalSchema([]))).toBe(true)
    })

    it('ignores an inactive secret while allowing another active secret', () => {
        const credentialsSchema = conditionalSchema([{ variable: 'auth_mode', value: 'managed' }])
        credentialsSchema.credential_form_schemas.push({
            ...schema.credential_form_schemas[0],
            variable: 'active_key'
        })
        const configuredModel: ICopilotProviderModel = {
            ...model,
            modelProperties: { ...model.modelProperties, auth_mode: 'api_key', active_key: 'active-test-key' }
        }
        expect(usesOrganizationCredentials(copilot, 'org-1', configuredModel, credentialsSchema)).toBe(true)
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
