import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { RoleGuard, TenantPermissionGuard } from '@xpert-ai/server-core'
import { randomUUID } from 'node:crypto'
import { ManualRetentionController } from './manual-retention.controller'
import { ManualRetentionService } from './manual-retention.service'

describe('manual retention HTTP validation', () => {
    let app: INestApplication
    let base: string
    const preview = jest.fn(async () => ({}))
    const execute = jest.fn(async () => ({}))
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ManualRetentionController],
            providers: [{ provide: ManualRetentionService, useValue: { preview, execute } }]
        })
            .overrideGuard(RoleGuard)
            .useValue({ canActivate: () => true })
            .overrideGuard(TenantPermissionGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        base = await app.getUrl()
    })
    afterAll(async () => {
        await app?.close()
    })
    const range = { target: 'copilot_checkpoint', start: '2020-01-01T00:00:00+08:00', end: '2020-02-01T00:00:00+08:00' }
    const post = (route: string, body: object) =>
        fetch(`${base}/data-retention/${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('validates date ranges, rejects extra scope fields and requires explicit confirmation', async () => {
        const response = await post('preview', range)
        expect(response.status).toBe(201)
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        for (const input of [
            { ...range, start: range.end },
            { ...range, start: 'bad' },
            { ...range, end: '2099-01-01T00:00:00Z' },
            { ...range, target: 'chat_message' },
            { ...range, tenantId: randomUUID() },
            { ...range, start: '2020-01-01T00:00:00' }
        ])
            expect((await post('preview', input)).status).toBe(400)
        expect(preview).toHaveBeenCalledTimes(1)
        const previewToken = randomUUID()
        for (const input of [
            { previewToken },
            { previewToken, confirmed: false },
            { previewToken: 'bad', confirmed: true },
            { previewToken, confirmed: true, ids: [] }
        ]) {
            expect((await post('execute', input)).status).toBe(400)
        }
        expect(execute).not.toHaveBeenCalled()
        expect((await post('execute', { previewToken, confirmed: true })).status).toBe(201)
    })
})
