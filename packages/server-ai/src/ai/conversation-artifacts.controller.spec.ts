jest.mock('@xpert-ai/server-core', () => ({
    Public: () => () => undefined,
    AllowClientSecretBindings: jest.requireActual(
        '../../../server/src/shared/decorators/allowed-client-secret-bindings.decorator'
    ).AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard: class {
        canActivate() {
            return true
        }
    },
    UUIDValidationPipe: jest.requireActual('../../../server/src/shared/pipes/uuid-validation.pipe').UUIDValidationPipe
}))
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import type { INestApplication } from '@nestjs/common'
import { ForbiddenException, NotFoundException, GoneException } from '@nestjs/common'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { ALLOWED_CLIENT_SECRET_BINDINGS_METADATA } from '../../../server/src/shared/decorators/allowed-client-secret-bindings.decorator'
import { ConversationArtifactsController } from './conversation-artifacts.controller'
import { ReadConversationArtifactCommand } from '../chat-conversation/commands/read-conversation-artifact.command'

const conversation = '10000000-0000-4000-8000-000000000001'
const artifact = '20000000-0000-4000-8000-000000000001'
const version = '30000000-0000-4000-8000-000000000001'
const path = (c = conversation, a = artifact, v = version) =>
    `/ai/conversations/${c}/artifacts/${a}/versions/${v}/content`
describe('ChatKit artifact content route', () => {
    const execute = jest.fn()
    const auth = { canActivate: jest.fn(() => true) }
    let app: INestApplication
    let baseUrl: string
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ConversationArtifactsController],
            providers: [{ provide: CommandBus, useValue: { execute } }]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue(auth)
            .compile()
        app = module.createNestApplication()
        app.setGlobalPrefix('ai')
        await app.listen(0, '127.0.0.1')
        baseUrl = await app.getUrl()
    })
    afterAll(async () => {
        await app.close()
    })
    beforeEach(() => {
        execute.mockReset()
        auth.canActivate.mockReset().mockReturnValue(true)
    })
    it('requires the shared authentication guard and explicitly permits enterprise sessions', async () => {
        expect(Reflect.getMetadata(ALLOWED_CLIENT_SECRET_BINDINGS_METADATA, ConversationArtifactsController)).toEqual([
            SecretTokenBindingType.ENTERPRISE_XPERT
        ])
        auth.canActivate.mockReturnValue(false)
        expect((await fetch(baseUrl + path())).status).toBe(403)
        expect(auth.canActivate).toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()
    })
    it('streams bytes without a JSON/host envelope and forces safe standalone download headers', async () => {
        execute.mockResolvedValue({ buffer: Buffer.from('<h1>saved</h1>'), mimeType: 'text/html' })
        const result = await fetch(baseUrl + path())
        expect(result.status).toBe(200)
        expect(execute).toHaveBeenCalledWith(
            new ReadConversationArtifactCommand(conversation, { artifactId: artifact, artifactVersionId: version })
        )
        expect(await result.text()).toBe('<h1>saved</h1>')
        expect(result.headers.get('content-type')).toContain('text/html')
        expect(result.headers.get('cache-control')).toBe('private, no-store')
        expect(result.headers.get('content-disposition')).toBe('attachment')
        expect(result.headers.get('content-security-policy')).toContain('sandbox')
        expect(result.headers.get('content-length')).toBe(String(Buffer.byteLength('<h1>saved</h1>')))
        expect(result.headers.get('x-content-type-options')).toBe('nosniff')
        expect(result.headers.get('referrer-policy')).toBe('no-referrer')
    })
    it('validates each identifier through HTTP before looking up files', async () => {
        for (const url of [path('bad'), path(conversation, 'bad'), path(conversation, artifact, 'bad')])
            expect((await fetch(baseUrl + url)).status).toBe(406)
        expect(execute).not.toHaveBeenCalled()
    })
    it('preserves denied, unavailable and checksum error responses', async () => {
        for (const error of [new ForbiddenException(), new NotFoundException(), new GoneException()]) {
            execute.mockRejectedValueOnce(error)
            expect((await fetch(baseUrl + path())).status).toBe(error.getStatus())
        }
    })
})
