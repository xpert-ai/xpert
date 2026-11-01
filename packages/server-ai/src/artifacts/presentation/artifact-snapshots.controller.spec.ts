import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ArtifactSnapshotsController } from './artifact-snapshots.controller'
import { ArtifactSnapshotsService } from './artifact-snapshots.service'
import { ArtifactsService } from '../artifacts.service'

describe('Snapshot HTTP boundary', () => {
    let app: INestApplication, base: string
    const read = jest.fn(async () => ({ readOnly: true, operations: [] }))
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ArtifactSnapshotsController],
            providers: [
                { provide: ArtifactSnapshotsService, useValue: { presentation: read } },
                {
                    provide: ArtifactsService,
                    useValue: {
                        resolveAccessContextFromRequest: async () => ({ principal: null }),
                        summarizeRequest: () => ({})
                    }
                }
            ]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        base = await app.getUrl()
    })
    afterAll(async () => {
        await app.close()
    })
    it('does not cache/index snapshot responses or accept query-string identity overrides', async () => {
        const response = await fetch(
            `${base}/artifacts/shared-links/Abc234Def567/snapshot?userId=owner&tenantId=foreign`
        )
        expect(response.status).toBe(200)
        expect(response.headers.get('Cache-Control')).toBe('private, no-store')
        expect(response.headers.get('X-Robots-Tag')).toContain('noindex')
        expect(read).toHaveBeenCalledWith({ slug: 'Abc234Def567', principal: null, requestSummary: {} })
    })
    it('validates slugs and exposes no anonymous query endpoint', async () => {
        expect((await fetch(`${base}/artifacts/shared-links/x/snapshot`)).status).toBe(400)
        expect(
            (await fetch(`${base}/artifacts/shared-links/Abc234Def567/snapshot/query`, { method: 'POST' })).status
        ).toBe(404)
    })
})
