import { ForbiddenException, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { init } from 'i18next'
import { GroupComposerService } from '../../chat-group/group-composer.service'
import { GroupComposerController } from './group-composer.controller'
import { GroupScopeGuard } from './group-scope.guard'

const id = '11111111-1111-4111-8111-111111111111'
describe('group Composer HTTP validation and member scope', () => {
    const composer = {
        member: jest.fn(),
        resourceCatalog: jest.fn(),
        validateResources: jest.fn(),
        authorizeResource: jest.fn()
    }
    let app: INestApplication
    let origin: string
    beforeAll(async () => {
        await init({
            lng: 'en',
            resources: { en: { 'server-ai': { Error: { GroupInputInvalid: 'Invalid group input' } } } }
        })
        const module = await Test.createTestingModule({
            controllers: [GroupComposerController],
            providers: [{ provide: GroupComposerService, useValue: composer }]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .overrideGuard(GroupScopeGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = `${await app.getUrl()}/groups/${id}/members/${id}/composer/assistants/${id}/resources`
    })
    afterAll(async () => app?.close())
    beforeEach(() => {
        jest.clearAllMocks()
        composer.member.mockResolvedValue({ subjectId: id })
        composer.authorizeResource.mockResolvedValue({})
        composer.resourceCatalog.mockResolvedValue({ items: [], total: 0 })
        composer.validateResources.mockImplementation(async (_member, selection) => selection)
    })
    const post = (action: string, body: unknown) =>
        fetch(`${origin}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    const authorize = (body: unknown) => post('authorize', body)
    const input = { bindingId: id, version: '1', serverName: 'example' }
    it('coerces resource pagination and supplies defaults at the HTTP boundary', async () => {
        expect((await fetch(`${origin}?offset=2`)).status).toBe(200)
        expect(composer.member).toHaveBeenCalledWith(id, id, id)
        expect(composer.resourceCatalog).toHaveBeenCalledWith({ subjectId: id }, { offset: 2, limit: 50 })
    })
    it('preserves selection lookup purpose after validating group member scope', async () => {
        expect((await fetch(`${origin}?purpose=selection`)).status).toBe(200)
        expect(composer.resourceCatalog).toHaveBeenCalledWith(
            { subjectId: id },
            { offset: 0, limit: 50, purpose: 'selection' }
        )
    })
    it.each(['limit=101', 'offset=-1', 'userId=spoofed', 'kind=unknown', 'purpose=unknown'])(
        'rejects invalid resource query %s before member or resource work',
        async (query) => {
            expect((await fetch(`${origin}?${query}`)).status).toBe(400)
            expect(composer.member).not.toHaveBeenCalled()
            expect(composer.resourceCatalog).not.toHaveBeenCalled()
        }
    )
    it('authorizes a binding only after checking the selected group member and Assistant', async () => {
        expect((await authorize({ ...input, projectId: id })).status).toBe(201)
        expect(composer.member).toHaveBeenCalledWith(id, id, id)
        expect(composer.authorizeResource).toHaveBeenCalledWith({ subjectId: id }, { ...input, projectId: id })
        expect(composer.member.mock.invocationCallOrder[0]).toBeLessThan(
            composer.authorizeResource.mock.invocationCallOrder[0]
        )
    })
    it.each([
        { bindingId: 'invalid' },
        { projectId: 'invalid' },
        { version: 'x'.repeat(65) },
        { serverName: 'x'.repeat(256) },
        { userId: id }
    ])('rejects malformed or forged authorization input %j', async (override) => {
        const response = await authorize({ ...input, ...override })
        expect(response.status).toBe(400)
        expect((await response.json()).message).toBe('Invalid group input')
        expect(composer.member).not.toHaveBeenCalled()
        expect(composer.authorizeResource).not.toHaveBeenCalled()
    })
    it('does not authorize resources when membership fails', async () => {
        composer.member.mockRejectedValueOnce(new ForbiddenException())
        expect((await authorize(input)).status).toBe(403)
        expect(composer.authorizeResource).not.toHaveBeenCalled()
    })
    it('passes the verified member and parsed selection to resource validation', async () => {
        const selection = { revision: 1, resources: [{ bindingId: id, version: 'a'.repeat(64) }] }
        const response = await post('validate', { projectId: id, runtimeResources: selection })
        expect(response.status).toBe(201)
        expect(await response.json()).toEqual(selection)
        expect(composer.member).toHaveBeenCalledWith(id, id, id)
        expect(composer.validateResources).toHaveBeenCalledWith({ subjectId: id }, selection, id)
        expect(composer.member.mock.invocationCallOrder[0]).toBeLessThan(
            composer.validateResources.mock.invocationCallOrder[0]
        )
    })
    it.each([
        { runtimeResources: { revision: -1, resources: [] } },
        { runtimeResources: { revision: 0, resources: [{ bindingId: id, version: 'invalid' }] } },
        { runtimeResources: { revision: 0, resources: [] }, userId: id }
    ])('rejects invalid or forged resource selection before resolving the member: %j', async (body) => {
        expect((await post('validate', body)).status).toBe(400)
        expect(composer.member).not.toHaveBeenCalled()
        expect(composer.validateResources).not.toHaveBeenCalled()
    })
    it('does not validate resources when membership fails', async () => {
        composer.member.mockRejectedValueOnce(new ForbiddenException())
        expect((await post('validate', { runtimeResources: { revision: 0, resources: [] } })).status).toBe(403)
        expect(composer.validateResources).not.toHaveBeenCalled()
    })
})
