import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PermissionGuard } from '@xpert-ai/server-core'
import { ModelReplacementController } from './replacement.controller'
import { ModelReplacementService } from './replacement.service'

describe('model replacement HTTP validation', () => {
    let app: INestApplication
    let url: string
    const service = { preview: jest.fn().mockResolvedValue([]), execute: jest.fn().mockResolvedValue([]) }
    const input = {
        source: { copilotId: 'd5b9502e-5a48-41a1-a17f-cba367827c81', model: 'source', modelType: 'llm' },
        target: { copilotId: 'd5b9502e-5a48-41a1-a17f-cba367827c81', model: 'target', modelType: 'llm' },
        policy: 'reset'
    }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ModelReplacementController],
            providers: [{ provide: ModelReplacementService, useValue: service }]
        })
            .overrideGuard(PermissionGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        url = await app.getUrl()
    })
    afterAll(async () => {
        await app?.close()
    })
    const post = (body: unknown) =>
        fetch(`${url}/model-replacement/preview`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('passes a validated request to the business service', async () => {
        expect((await post(input)).status).toBe(201)
        expect(service.preview).toHaveBeenCalledWith(input)
    })
    it.each([
        { ...input, tenantId: 'untrusted-scope' },
        { ...input, target: { ...input.target, modelType: 'text-embedding' } },
        { ...input, target: input.source },
        { ...input, source: { ...input.source, copilotId: 'invalid' } },
        { ...input, policy: 'copy-everything' }
    ])('rejects invalid payloads and scope overrides', async (body) => {
        service.preview.mockClear()
        expect((await post(body)).status).toBe(400)
        expect(service.preview).not.toHaveBeenCalled()
    })
})
