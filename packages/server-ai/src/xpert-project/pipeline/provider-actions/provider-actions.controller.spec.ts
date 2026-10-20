import { Test } from '@nestjs/testing'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectPipelineProviderActionsController } from './provider-actions.controller'
import { ProjectPipelineProviderActionsService } from './provider-actions.service'

describe('Provider action HTTP boundary', () => {
    const actor = { userId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID() }
    const projectId = randomUUID(),
        instanceId = randomUUID(),
        nodeInstanceId = randomUUID()
    const input = {
        instanceId,
        nodeInstanceId,
        roundId: randomUUID(),
        requestId: randomUUID(),
        expectedRevision: 1,
        generation: 1,
        inputDigest: 'a'.repeat(64),
        actionRef: 'neutral.inspect@1',
        sourceRevision: '1',
        parameters: {}
    }
    const access = { assertCanRead: jest.fn(), assertCanEdit: jest.fn() },
        actions = { list: jest.fn(), submit: jest.fn() }
    let app: INestApplication, url: string
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProjectPipelineProviderActionsController],
            providers: [
                { provide: ProjectPipelineProviderActionsService, useValue: actions },
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
        access.assertCanEdit.mockResolvedValue(undefined)
        actions.list.mockResolvedValue({ items: [] })
        actions.submit.mockResolvedValue({ state: 'queued' })
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
    const post = (body: unknown) =>
        fetch(`${url}/${projectId}/pipelines/provider-actions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('uses the authenticated actor and returns an accepted queued intent', async () => {
        expect(
            (await fetch(`${url}/${projectId}/pipelines/${instanceId}/nodes/${nodeInstanceId}/actions`)).status
        ).toBe(200)
        expect(actions.list).toHaveBeenCalledWith({ projectId, actor }, { instanceId, nodeInstanceId })
        expect((await post(input)).status).toBe(202)
        expect(actions.submit).toHaveBeenCalledWith({ projectId, actor }, input)
    })
    it.each([
        { actor: { userId: randomUUID() } },
        { projectId: randomUUID() },
        { expectedRevision: -1 },
        { generation: 0 },
        { inputDigest: 'latest' },
        { sourceRevision: '' },
        { actionRef: 'unversioned' }
    ])('rejects invalid or overriding command fields: %j', async (change) => {
        expect((await post({ ...input, ...change })).status).toBe(400)
        expect(actions.submit).not.toHaveBeenCalled()
    })
    it('enforces Project edit permission before invoking a provider action', async () => {
        access.assertCanEdit.mockRejectedValue(new ForbiddenException())
        expect((await post(input)).status).toBe(403)
        expect(actions.submit).not.toHaveBeenCalled()
    })
})
