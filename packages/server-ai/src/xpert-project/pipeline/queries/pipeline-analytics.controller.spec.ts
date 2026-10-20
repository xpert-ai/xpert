import { Test } from '@nestjs/testing'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectPipelineAnalyticsController } from './pipeline-analytics.controller'
import { ProjectPipelineAnalyticsService } from './pipeline-analytics.service'

describe('Project Pipeline analytics HTTP boundary', () => {
    const actor = { userId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID() }
    const projectId = randomUUID(),
        input = { from: '2026-10-18T00:00:00Z', to: '2026-10-19T00:00:00Z' }
    const access = { assertCanRead: jest.fn() },
        analytics = { read: jest.fn(async () => ({})) }
    let app: INestApplication, url: string
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProjectPipelineAnalyticsController],
            providers: [
                { provide: ProjectPipelineAnalyticsService, useValue: analytics },
                { provide: XpertProjectAccessService, useValue: access }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        app.use((request: Request, _response: Response, next: NextFunction) => {
            request.user = { id: actor.userId, tenantId: actor.tenantId }
            next()
        })
        await app.listen(0, '127.0.0.1')
        url = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        access.assertCanRead.mockResolvedValue(undefined)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: actor.userId,
            tenantId: actor.tenantId
        } as IUser)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())
    const get = (query: object) =>
        fetch(`${url}/${projectId}/pipelines/analytics?${new URLSearchParams(Object.entries(query))}`)
    it('uses the authenticated Project scope and validates the time window', async () => {
        expect((await get(input)).status).toBe(200)
        expect(analytics.read).toHaveBeenCalledWith({ projectId, actor }, input)
    })
    it.each([
        {},
        { ...input, from: 'yesterday' },
        { ...input, to: input.from },
        { ...input, tenantId: 'forged' },
        { ...input, from: '2025-01-01T00:00:00Z' }
    ])('rejects missing, malformed, extra and unbounded query fields', async (query) => {
        expect((await get(query)).status).toBe(400)
        expect(analytics.read).not.toHaveBeenCalled()
    })
    it('does not query statistics after a Project authorization denial', async () => {
        access.assertCanRead.mockRejectedValue(new ForbiddenException())
        expect((await get(input)).status).toBe(403)
        expect(analytics.read).not.toHaveBeenCalled()
    })
})
