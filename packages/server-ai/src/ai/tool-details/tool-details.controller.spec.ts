jest.mock('@xpert-ai/server-core', () => ({
    Public: () => () => undefined,
    Permissions: () => () => undefined,
    AllowClientSecretBindings: jest.requireActual(
        '../../../../server/src/shared/decorators/allowed-client-secret-bindings.decorator'
    ).AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard: class {
        canActivate() {
            return true
        }
    },
    UUIDValidationPipe: jest.requireActual('../../../../server/src/shared/pipes/uuid-validation.pipe')
        .UUIDValidationPipe,
    ZodValidationPipe: jest.requireActual('../../../../server/src/shared/pipes/zod-validation.pipe').ZodValidationPipe
}))
jest.mock('../../chat-conversation/tool-details/tool-details.service', () => ({ ToolDetailsService: class {} }))
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { ToolDetailsController } from './tool-details.controller'
import { ToolDetailsService } from '../../chat-conversation/tool-details/tool-details.service'
const id = '10000000-0000-4000-8000-000000000001'
const params = new URLSearchParams({ executionId: id, toolCallId: 'call', phase: 'output', sha256: 'a'.repeat(64) })
describe('tool detail HTTP boundary', () => {
    const read = jest.fn()
    const guard = { canActivate: jest.fn(() => true) }
    let app: INestApplication
    let url: string
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ToolDetailsController],
            providers: [{ provide: ToolDetailsService, useValue: { read } }]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue(guard)
            .compile()
        app = module.createNestApplication()
        app.setGlobalPrefix('api/ai')
        await app.listen(0, '127.0.0.1')
        url = `${await app.getUrl()}/api/ai/conversations/${id}/tool-details/${id}?${params}`
    })
    afterAll(async () => {
        await app.close()
    })
    beforeEach(() => {
        read.mockReset()
        guard.canActivate.mockReturnValue(true)
    })
    it('authenticates requests and validates scope plus offset before storage', async () => {
        guard.canActivate.mockReturnValueOnce(false)
        expect((await fetch(url)).status).toBe(403)
        for (const suffix of ['&offset=-1', '&offset=0.5', '&extra=private'])
            expect((await fetch(url + suffix)).status).toBe(400)
        expect(read).not.toHaveBeenCalled()
    })
    it('returns a non-cacheable chunk with complete invocation scope', async () => {
        read.mockResolvedValue({ content: 'safe', nextOffset: null })
        const result = await fetch(url)
        expect(result.status).toBe(200)
        expect(result.headers.get('cache-control')).toBe('private, no-store')
        expect(read).toHaveBeenCalledWith(
            { conversationId: id, executionId: id, id, toolCallId: 'call', phase: 'output', sha256: 'a'.repeat(64) },
            0
        )
        expect(await result.json()).toEqual({ content: 'safe', nextOffset: null })
    })
})
