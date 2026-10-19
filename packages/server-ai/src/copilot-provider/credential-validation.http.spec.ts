import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { PermissionGuard } from '@xpert-ai/server-core'
import { ConfigService } from '@xpert-ai/server-config'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { AIProvidersService } from '../ai-model'
import { CopilotProviderController } from './copilot-provider.controller'
import { CopilotProviderService } from './copilot-provider.service'
import { CopilotProviderModelService } from './models/copilot-provider-model.service'
import { CopilotProviderUpsertCommand } from './commands'

describe('credential target through provider save HTTP routes', () => {
    const execute = jest.fn()
    let app: INestApplication
    let origin: string
    const id = '00000000-0000-4000-8000-000000000001'
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [CopilotProviderController],
            providers: [
                { provide: CopilotProviderService, useValue: {} },
                { provide: CopilotProviderModelService, useValue: {} },
                { provide: AIProvidersService, useValue: {} },
                { provide: ConfigService, useValue: { get: () => '' } },
                { provide: CommandBus, useValue: { execute } },
                { provide: QueryBus, useValue: {} }
            ]
        })
            .overrideGuard(PermissionGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        execute.mockReset().mockResolvedValue({ id })
    })
    afterAll(async () => app?.close())

    it.each(['POST', 'PUT'])(
        'passes a normalized target separately from persisted credentials for %s',
        async (method) => {
            const response = await fetch(`${origin}/${method === 'PUT' ? id : ''}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerName: 'volcengine',
                    credentials: { ark_api_key: 'test' },
                    validationTarget: { modelType: 'llm', model: ' ep-private ' }
                })
            })
            expect(response.status).toBe(method === 'POST' ? 201 : 200)
            const command: CopilotProviderUpsertCommand = execute.mock.calls[0][0]
            expect(command.validationTarget).toEqual({ modelType: AiModelTypeEnum.LLM, model: 'ep-private' })
            expect(command.entity).not.toHaveProperty('validationTarget')
            expect(command.entity.credentials).toEqual({ ark_api_key: 'test' })
        }
    )
    it.each(['POST', 'PUT'])('rejects a malformed target on %s before persistence', async (method) => {
        const response = await fetch(`${origin}/${method === 'PUT' ? id : ''}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                providerName: 'volcengine',
                credentials: { ark_api_key: 'test' },
                validationTarget: { modelType: 'llm', model: ' ' }
            })
        })
        expect(response.status).toBe(400)
        expect(execute).not.toHaveBeenCalled()
    })
})
