import { AiModelTypeEnum, CredentialFormTypeEnum, ProviderCredentialValidationPolicy } from '@xpert-ai/contracts'
import { checkProviderCredentials, credentialValidationCapabilities } from './credential-validation'

function setup() {
    const validateModel = jest.fn().mockResolvedValue(undefined)
    const validateProviderCredentials = jest.fn().mockResolvedValue(undefined)
    const discoverModels = jest.fn().mockResolvedValue([])
    const strategy = {
        getProviderSchema: jest.fn().mockReturnValue({
            supported_model_types: [AiModelTypeEnum.LLM],
            provider_credential_schema: {
                credential_form_schemas: [
                    { variable: 'api_key', type: CredentialFormTypeEnum.SECRET_INPUT, required: true },
                    { variable: 'base_url', type: CredentialFormTypeEnum.TEXT_INPUT }
                ]
            }
        }),
        getProviderModels: jest.fn().mockReturnValue([{ model: 'reference-model' }]),
        getModelManager: jest.fn().mockReturnValue({ validateCredentials: validateModel }),
        validateProviderCredentials,
        discoverModels: undefined as typeof discoverModels | undefined,
        credentialValidation: undefined as ProviderCredentialValidationPolicy | undefined
    }
    return { strategy, validateModel, validateProviderCredentials, discoverModels }
}
const credentials = { api_key: 'test-key', base_url: 'https://models.example/v1' }
const target = { modelType: AiModelTypeEnum.LLM, model: 'ep-user-selected' }

describe('provider credentials before saving', () => {
    it('reuses discovery with filtered unsaved credentials, accepts an empty list and never invokes inference', async () => {
        const { strategy, discoverModels, validateProviderCredentials, validateModel } = setup()
        strategy.discoverModels = discoverModels
        expect(credentialValidationCapabilities(strategy)).toEqual({ method: 'discovery' })
        const check = await checkProviderCredentials(strategy, { ...credentials, ignored: 'not-forwarded' })
        expect(discoverModels).toHaveBeenCalledWith(credentials)
        expect(check).toEqual({ credentials, result: { method: 'discovery', models: [] } })
        expect(validateProviderCredentials).not.toHaveBeenCalled()
        expect(validateModel).not.toHaveBeenCalled()
    })
    it('does not fall back to inference when listing fails, and rechecks on every save', async () => {
        const { strategy, discoverModels, validateModel, validateProviderCredentials } = setup()
        strategy.discoverModels = discoverModels
        await checkProviderCredentials(strategy, credentials)
        discoverModels.mockRejectedValue(new Error('401 revoked'))
        await expect(checkProviderCredentials(strategy, credentials)).rejects.toMatchObject({
            status: 403,
            message: '401 revoked'
        })
        expect(discoverModels).toHaveBeenCalledTimes(2)
        expect(validateModel).not.toHaveBeenCalled()
        expect(validateProviderCredentials).not.toHaveBeenCalled()
    })
    it('uses the selected Endpoint ID even when it is absent from the reference catalog', async () => {
        const { strategy, validateModel } = setup()
        strategy.credentialValidation = { mode: 'model', modelTypes: [AiModelTypeEnum.LLM] }
        expect(credentialValidationCapabilities(strategy)).toEqual({
            method: 'model',
            modelTypes: [AiModelTypeEnum.LLM],
            models: [{ model: 'reference-model', modelType: AiModelTypeEnum.LLM }]
        })
        await expect(checkProviderCredentials(strategy, credentials, target)).resolves.toEqual({
            credentials,
            result: { method: 'model', target }
        })
        expect(validateModel).toHaveBeenCalledWith('ep-user-selected', credentials)
    })
    it.each([undefined, { model: 'image-model', modelType: AiModelTypeEnum.IMAGE }])(
        'rejects a missing or unsupported target: %p',
        async (selection) => {
            const { strategy, validateModel } = setup()
            strategy.credentialValidation = { mode: 'model', modelTypes: [AiModelTypeEnum.LLM] }
            await expect(checkProviderCredentials(strategy, credentials, selection)).rejects.toThrow()
            expect(validateModel).not.toHaveBeenCalled()
        }
    )
    it('propagates failure from the selected model and preserves legacy provider validation', async () => {
        const { strategy, validateModel, validateProviderCredentials } = setup()
        await checkProviderCredentials(strategy, credentials)
        expect(validateProviderCredentials).toHaveBeenCalledWith(credentials)
        strategy.credentialValidation = { mode: 'model', modelTypes: [AiModelTypeEnum.LLM] }
        validateModel.mockRejectedValue(new Error('404 target unavailable'))
        await expect(checkProviderCredentials(strategy, credentials, target)).rejects.toThrow('404 target unavailable')
    })
    it('rejects absent required credentials before making a provider request', async () => {
        const { strategy, discoverModels } = setup()
        strategy.discoverModels = discoverModels
        await expect(checkProviderCredentials(strategy, {})).rejects.toThrow()
        expect(discoverModels).not.toHaveBeenCalled()
    })
})
