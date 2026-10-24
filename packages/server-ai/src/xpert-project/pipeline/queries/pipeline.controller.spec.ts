import { Test } from '@nestjs/testing'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectPipelineController } from './pipeline.controller'
import { ProjectPipelineQueryService } from './pipeline-query.service'

describe('pipeline history HTTP boundary', () => {
    const actor = { userId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID() }
    const instanceId = randomUUID(),
        roundId = randomUUID()
    const access = { assertCanRead: jest.fn() }
    const query = { graph: jest.fn(), rounds: jest.fn() }
    let app: INestApplication, url: string
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProjectPipelineController],
            providers: [
                { provide: ProjectPipelineQueryService, useValue: query },
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
        query.graph.mockResolvedValue({ historical: true })
        query.rounds.mockResolvedValue({ items: [], next: null })
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
    const get = (suffix: string) => fetch(`${url}/project/pipelines/${instanceId}/${suffix}`)
    it('parses the round selector and bounded pagination with the authenticated scope', async () => {
        expect((await get(`graph?roundId=${roundId}`)).status).toBe(200)
        expect(query.graph).toHaveBeenCalledWith({ projectId: 'project', actor }, instanceId, { roundId })
        expect((await get(`rounds?limit=10&after=${roundId}`)).status).toBe(200)
        expect(query.rounds).toHaveBeenCalledWith({ projectId: 'project', actor }, instanceId, {
            after: roundId,
            limit: 10
        })
    })
    it.each([
        'graph?roundId=not-a-uuid',
        `graph?roundId=${roundId}&tenantId=override`,
        'rounds?limit=101',
        'rounds?limit=0',
        'rounds?after=invalid',
        'rounds?actor=override'
    ])('rejects invalid or scope-overriding queries: %s', async (suffix) => {
        expect((await get(suffix)).status).toBe(400)
        expect(query.graph).not.toHaveBeenCalled()
        expect(query.rounds).not.toHaveBeenCalled()
    })
    it('checks Project view permission before loading history', async () => {
        access.assertCanRead.mockRejectedValue(new ForbiddenException())
        expect((await get('rounds')).status).toBe(403)
        expect(query.rounds).not.toHaveBeenCalled()
    })
})
