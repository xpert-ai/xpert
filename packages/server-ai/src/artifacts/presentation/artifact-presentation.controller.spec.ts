import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { ArtifactPresentationController } from './artifact-presentation.controller'
import { ArtifactPresentationService } from './artifact-presentation.service'

describe('Artifact presentation HTTP contract', () => {
    let app: INestApplication
    let base: string
    const query = jest.fn(async () => ({ rows: [] }))
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ArtifactPresentationController],
            providers: [
                { provide: ArtifactPresentationService, useValue: { read: async () => ({ readOnly: true }), query } }
            ]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        base = await app.getUrl()
    })
    afterAll(async () => {
        await app.close()
    })
    const url = '/artifacts/shared-links/team-link-12/presentation'
    const body = () => ({
        target: { artifactId: randomUUID(), versionId: randomUUID() },
        operation: 'query',
        input: { controls: {} }
    })
    it('serves private non-cacheable presentation data', async () => {
        const response = await fetch(base + url)
        expect(response.status).toBe(200)
        expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    })
    it('validates the target and rejects scope overrides at the HTTP boundary', async () => {
        const valid = body()
        const post = (input: object) =>
            fetch(`${base}${url}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            })
        expect((await post(valid)).status).toBe(201)
        expect(query).toHaveBeenLastCalledWith('team-link-12', valid)
        for (const invalid of [
            { ...body(), userId: 'creator' },
            { ...body(), target: { artifactId: randomUUID(), draftRevision: 2 } },
            { ...body(), input: [] },
            { ...body(), operation: '' },
            { ...body(), target: { artifactId: 'invalid', versionId: randomUUID() } }
        ]) {
            expect((await post(invalid)).status).toBe(400)
        }
        expect(query).toHaveBeenCalledTimes(1)
    })
})
