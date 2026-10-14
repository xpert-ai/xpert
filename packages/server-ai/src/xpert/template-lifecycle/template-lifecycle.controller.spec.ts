import { Test } from '@nestjs/testing'
import { INestApplication, ConflictException } from '@nestjs/common'
import { TemplateLifecycleController } from './template-lifecycle.controller'
import { TemplatePublicationService } from './template-publication.service'
import { TemplateUpgradeService } from './template-upgrade.service'

describe('template lifecycle HTTP validation', () => {
    let app: INestApplication, origin: string
    const publications = {
        preview: jest.fn(),
        publish: jest.fn().mockResolvedValue({ id: 'shared' }),
        revoke: jest.fn()
    }
    const upgrades = {
        preview: jest.fn().mockResolvedValue({ templateId: 'target' }),
        sources: jest.fn().mockResolvedValue([]),
        apply: jest.fn().mockResolvedValue({ state: 'draft' }),
        resume: jest.fn(),
        rollback: jest.fn()
    }
    const post = (path: string, body: object) =>
        fetch(`${origin}/assistant/template-lifecycle/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    beforeAll(async () => {
        app = (
            await Test.createTestingModule({
                controllers: [TemplateLifecycleController],
                providers: [
                    { provide: TemplatePublicationService, useValue: publications },
                    { provide: TemplateUpgradeService, useValue: upgrades }
                ]
            }).compile()
        ).createNestApplication({ logger: false })
        app.use((request, _response, next) => {
            request.i18nContext = { lang: 'en' }
            next()
        })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(() => app.close())
    beforeEach(() => jest.clearAllMocks())
    const valid = { revision: 'a'.repeat(64), contentHash: 'b'.repeat(64), visibility: 'team', version: '1.0.0' }
    it('validates publishing and supplies release-note default', async () => {
        expect((await post('publication', valid)).status).toBe(201)
        expect(publications.publish).toHaveBeenCalledWith('assistant', { ...valid, releaseNotes: '' })
    })
    it.each([
        { ...valid, organizationId: 'injected' },
        { ...valid, visibility: 'anonymous' },
        { ...valid, version: 'latest' },
        { ...valid, contentHash: 'bad' }
    ])('rejects invalid publication before business service', async (body) => {
        expect((await post('publication', body)).status).toBe(400)
        expect(publications.publish).not.toHaveBeenCalled()
    })
    it('rejects unknown upgrade sections and implicit decisions', async () => {
        for (const choices of [{ secrets: 'replace' }, { instructions: 'automatic' }])
            expect(
                (await post('upgrade', { revision: valid.revision, sourceHash: valid.contentHash, choices })).status
            ).toBe(400)
        expect(upgrades.apply).not.toHaveBeenCalled()
    })
    it('accepts explicit keep and replace choices', async () => {
        expect(
            (
                await post('upgrade', {
                    revision: valid.revision,
                    sourceHash: valid.contentHash,
                    choices: { instructions: 'keep', runtime: 'replace' }
                })
            ).status
        ).toBe(201)
        expect(upgrades.apply).toHaveBeenCalledTimes(1)
    })
    it('validates explicit migration targets at the actual HTTP boundary', async () => {
        expect(
            (
                await fetch(
                    `${origin}/assistant/template-lifecycle/upgrade?targetTemplateId=agent-plugin%2Fexample%2Fdesk`
                )
            ).status
        ).toBe(200)
        expect(upgrades.preview).toHaveBeenCalledWith('assistant', expect.any(String), 'agent-plugin/example/desk')
        upgrades.preview.mockClear()
        expect((await fetch(`${origin}/assistant/template-lifecycle/upgrade?organizationId=other`)).status).toBe(400)
        expect(upgrades.preview).not.toHaveBeenCalled()
        expect(
            (
                await post('upgrade', {
                    revision: valid.revision,
                    sourceHash: valid.contentHash,
                    choices: {},
                    targetTemplateId: ''
                })
            ).status
        ).toBe(400)
    })
    it('requires an operation UUID and rejects resource overrides for recovery', async () => {
        expect((await post('upgrade/resume', { operationId: 'invalid' })).status).toBe(400)
        expect(
            (
                await post('upgrade/rollback', {
                    operationId: '22222222-2222-4222-8222-222222222222',
                    assistantId: 'other'
                })
            ).status
        ).toBe(400)
        expect(upgrades.resume).not.toHaveBeenCalled()
        expect(upgrades.rollback).not.toHaveBeenCalled()
    })
    it('preserves conflict responses from the business boundary', async () => {
        publications.publish.mockRejectedValueOnce(new ConflictException('stale'))
        expect((await post('publication', valid)).status).toBe(409)
    })
})
