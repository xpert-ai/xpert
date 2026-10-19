import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
    AIPermissionsEnum,
    AiModelTypeEnum,
    CredentialFormTypeEnum,
    ProviderCredentialCheckInput
} from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { PermissionGuard } from '@xpert-ai/server-core'
import { AIProvidersService } from '../ai-model.service'
import { ProviderCredentialValidationController } from './credential-validation.controller'
import { checkProviderCredentials } from './credential-validation'

describe('credential validation HTTP boundary', () => {
    const providers = { credentialValidationCapabilities: jest.fn(), checkCredentials: jest.fn() }
    let app: INestApplication
    let origin: string
    let allowed = true
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProviderCredentialValidationController],
            providers: [{ provide: AIProvidersService, useValue: providers }]
        })
            .overrideGuard(PermissionGuard)
            .useValue({ canActivate: () => allowed })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        allowed = true
        providers.credentialValidationCapabilities.mockReturnValue({ method: 'discovery' })
        providers.checkCredentials.mockResolvedValue({ method: 'discovery', models: [] })
    })
    afterAll(async () => app?.close())
    const request = (body: unknown) =>
        fetch(`${origin}/provider/volcengine/credential-validation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('requires the edit permission and never forwards a denied request', async () => {
        expect(Reflect.getMetadata(PERMISSIONS_METADATA, ProviderCredentialValidationController)).toContain(
            AIPermissionsEnum.COPILOT_EDIT
        )
        allowed = false
        const response = await request({ credentials: { api_key: 'test' } })
        expect(response.status).toBe(403)
        expect(providers.checkCredentials).not.toHaveBeenCalled()
    })
    it('validates and normalizes a user-entered target without echoing credentials', async () => {
        const response = await request({
            credentials: { api_key: 'private-test' },
            validationTarget: { modelType: 'llm', model: ' ep-test ' }
        })
        expect(response.status).toBe(201)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(await response.json()).toEqual({ method: 'discovery', models: [] })
        expect(providers.checkCredentials).toHaveBeenCalledWith('volcengine', {
            credentials: { api_key: 'private-test' },
            validationTarget: { modelType: 'llm', model: 'ep-test' }
        })
    })
    it('returns an actionable discovery rejection instead of a generic server error', async () => {
        const discoverModels = jest.fn().mockRejectedValue(new Error('Model discovery returned HTTP 401'))
        providers.checkCredentials.mockImplementationOnce(
            async (_provider: string, input: ProviderCredentialCheckInput) => {
                return (
                    await checkProviderCredentials(
                        {
                            getProviderSchema: jest.fn().mockReturnValue({
                                supported_model_types: [AiModelTypeEnum.LLM],
                                provider_credential_schema: {
                                    credential_form_schemas: [
                                        {
                                            variable: 'api_key',
                                            type: CredentialFormTypeEnum.SECRET_INPUT,
                                            required: true
                                        }
                                    ]
                                }
                            }),
                            getProviderModels: jest.fn(),
                            getModelManager: jest.fn(),
                            validateProviderCredentials: jest.fn(),
                            discoverModels
                        },
                        input.credentials
                    )
                ).result
            }
        )
        const response = await request({ credentials: { api_key: 'invalid-test-key' } })
        expect(response.status).toBe(403)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(await response.json()).toEqual({
            message: 'Model discovery returned HTTP 401',
            error: 'Forbidden',
            statusCode: 403
        })
        expect(discoverModels).toHaveBeenCalledTimes(1)
    })
    it.each([
        {},
        { credentials: 'key' },
        { credentials: {}, verified: true },
        { credentials: {}, validationTarget: { modelType: 'llm', model: ' ' } },
        { credentials: {}, validationTarget: { modelType: 'invalid', model: 'x' } },
        { credentials: {}, validationTarget: { modelType: 'llm', model: 'x', baseUrl: 'override' } }
    ])('rejects malformed or extra fields before provider access: %p', async (body) => {
        expect((await request(body)).status).toBe(400)
        expect(providers.checkCredentials).not.toHaveBeenCalled()
    })
})
