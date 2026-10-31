import { AiModelTypeEnum, ConfigurateMethod, type ProviderCredentialValidationTarget } from '@xpert-ai/contracts'

jest.mock('../../../ai-model', () => ({
    AIProvidersService: class AIProvidersService {},
    AiProviderCredentialsValidateCommand: class AiProviderCredentialsValidateCommand {
        constructor(
            public readonly provider: string,
            public readonly credentials: Record<string, any>,
            public readonly validationTarget?: ProviderCredentialValidationTarget
        ) {}
    }
}))

jest.mock('../../copilot-provider.service', () => ({
    CopilotProviderService: class CopilotProviderService {}
}))

import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CopilotProviderUpsertCommand } from '../upsert.command'
import { CopilotProviderUpsertHandler } from './upsert.handler'

describe('CopilotProviderUpsertHandler', () => {
    let commandBus: { execute: jest.Mock }
    let providersService: { getProvider: jest.Mock }
    let service: { create: jest.Mock; update: jest.Mock; findOne: jest.Mock; saveNamedConnection: jest.Mock }
    let handler: CopilotProviderUpsertHandler

    beforeEach(() => {
        commandBus = {
            execute: jest.fn()
        }
        providersService = {
            getProvider: jest.fn()
        }
        service = {
            saveNamedConnection: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findOne: jest.fn()
        }

        handler = new CopilotProviderUpsertHandler(commandBus as never, providersService as never, service as never)
    })

    it('allows a named model-scoped connection without claiming provider credential validation', async () => {
        providersService.getProvider.mockReturnValue({
            getProviderSchema: () => ({
                configurate_methods: [ConfigurateMethod.CUSTOMIZABLE_MODEL],
                model_credential_schema: {}
            })
        })
        const entity = { providerName: 'custom-provider' }
        await handler.execute(new CopilotProviderUpsertCommand(entity, undefined, 'Private endpoint'))
        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(service.saveNamedConnection).toHaveBeenCalledWith(entity, 'Private endpoint')
    })

    it('requires credentials for named connections with a shared provider schema', async () => {
        providersService.getProvider.mockReturnValue({ getProviderSchema: () => ({ provider_credential_schema: {} }) })
        await expect(
            handler.execute(new CopilotProviderUpsertCommand({ providerName: 'provider' }, undefined, 'Connection'))
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(service.saveNamedConnection).not.toHaveBeenCalled()
    })

    it('enables current non-deprecated preset models after validating a new shared connection', async () => {
        const credentials = { key: 'test-key' }
        commandBus.execute.mockResolvedValue(credentials)
        providersService.getProvider.mockReturnValue({
            getProviderSchema: () => ({ provider_credential_schema: {} }),
            getProviderModels: () => [
                { model: 'same', model_type: AiModelTypeEnum.LLM },
                { model: 'same', model_type: AiModelTypeEnum.TEXT_EMBEDDING },
                { model: 'old', model_type: AiModelTypeEnum.LLM, deprecated: true }
            ]
        })
        await handler.execute(
            new CopilotProviderUpsertCommand({ providerName: 'provider', credentials }, undefined, 'New connection')
        )
        expect(service.saveNamedConnection).toHaveBeenCalledWith(
            expect.objectContaining({
                options: {
                    enabledModels: [
                        { model: 'same', modelType: AiModelTypeEnum.LLM },
                        { model: 'same', modelType: AiModelTypeEnum.TEXT_EMBEDDING }
                    ]
                }
            }),
            'New connection'
        )
    })

    it('does not enable presets for a new configured-only catalog', async () => {
        const credentials = { key: 'test-key' }
        commandBus.execute.mockResolvedValue(credentials)
        providersService.getProvider.mockReturnValue({
            getProviderSchema: () => ({ provider_credential_schema: {} }),
            getProviderModels: () => [{ model: 'preset', model_type: AiModelTypeEnum.LLM }]
        })
        await handler.execute(
            new CopilotProviderUpsertCommand(
                {
                    providerName: 'provider',
                    credentials,
                    options: {
                        modelDiscovery: { mode: 'configured', availableModelIds: [], syncedAt: '2026-10-31T00:00:00Z' }
                    }
                },
                undefined,
                'Configured catalog'
            )
        )
        expect(service.saveNamedConnection).toHaveBeenCalledWith(
            expect.objectContaining({
                options: expect.objectContaining({ enabledModels: [] })
            }),
            'Configured catalog'
        )
    })

    it('keeps the explicit disabled selection when editing an existing connection', async () => {
        const credentials = { key: 'test-key' }
        commandBus.execute.mockResolvedValue(credentials)
        const getProviderModels = jest.fn()
        providersService.getProvider.mockReturnValue({
            getProviderSchema: () => ({ provider_credential_schema: {} }),
            getProviderModels
        })
        const entity = { id: 'provider-id', providerName: 'provider', credentials, options: { enabledModels: [] } }
        await handler.execute(new CopilotProviderUpsertCommand(entity, undefined, 'Renamed connection'))
        expect(getProviderModels).not.toHaveBeenCalled()
        expect(service.saveNamedConnection).toHaveBeenCalledWith(entity, 'Renamed connection')
        expect(entity.options.enabledModels).toEqual([])
    })

    it('rejects provider-level secrets for a model-scoped connection', async () => {
        providersService.getProvider.mockReturnValue({
            getProviderSchema: () => ({
                configurate_methods: [ConfigurateMethod.CUSTOMIZABLE_MODEL],
                model_credential_schema: {}
            })
        })
        await expect(
            handler.execute(
                new CopilotProviderUpsertCommand(
                    { providerName: 'provider', credentials: { key: 'secret' } },
                    undefined,
                    'Connection'
                )
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(service.saveNamedConnection).not.toHaveBeenCalled()
    })

    it('validates provider availability before creating a provider record', async () => {
        const entity = {
            providerName: 'volcengine'
        }
        const created = { id: 'provider-id', ...entity }

        providersService.getProvider.mockReturnValue({ provider: 'volcengine' })
        service.create.mockResolvedValue(created)

        await expect(handler.execute(new CopilotProviderUpsertCommand(entity))).resolves.toEqual(created)

        expect(providersService.getProvider).toHaveBeenCalledWith('volcengine', true)
        expect(service.create).toHaveBeenCalledWith({ ...entity, options: { enabledModels: [] } })
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('stops persistence when the provider strategy cannot be resolved', async () => {
        providersService.getProvider.mockImplementation(() => {
            throw new NotFoundException('AI Model Provider strategy not found for provider: missing-provider')
        })

        await expect(
            handler.execute(
                new CopilotProviderUpsertCommand({
                    providerName: 'missing-provider'
                })
            )
        ).rejects.toBeInstanceOf(NotFoundException)

        expect(service.create).not.toHaveBeenCalled()
        expect(service.update).not.toHaveBeenCalled()
    })

    it('passes the user-selected target to the save-time check without persisting it', async () => {
        const credentials = { ark_api_key: 'test-key' }
        const entity = { providerName: 'volcengine', credentials }
        const target = { modelType: AiModelTypeEnum.LLM, model: 'ep-private' }
        commandBus.execute.mockResolvedValue(credentials)
        await handler.execute(new CopilotProviderUpsertCommand(entity, target))
        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'volcengine',
                credentials,
                validationTarget: target
            })
        )
        expect(service.create).toHaveBeenCalledWith({ ...entity, options: { enabledModels: [] } })
        expect(service.create.mock.calls[0][0]).not.toHaveProperty('validationTarget')
    })

    it.each([undefined, 'provider-id'])('does not save invalid credentials for id %p', async (id) => {
        const error = new Error('Invalid API key')
        commandBus.execute.mockRejectedValue(error)
        await expect(
            handler.execute(
                new CopilotProviderUpsertCommand({
                    id,
                    providerName: 'volcengine',
                    credentials: { ark_api_key: 'invalid-key' }
                })
            )
        ).rejects.toBe(error)
        expect(service.create).not.toHaveBeenCalled()
        expect(service.update).not.toHaveBeenCalled()
    })
})
