jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IUser } from '@xpert-ai/contracts'
import type { NextFunction, Request, Response } from 'express'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectPipelineCommandsController } from './pipeline-commands.controller'
import { ProjectPipelineCommandsService } from './pipeline-commands.service'

describe('managed pipeline command HTTP boundary', () => {
    let app: INestApplication, url: string
    const access = { assertCanEdit: jest.fn(), assertCanManage: jest.fn() }
    const commands = {
        configure: jest.fn(),
        start: jest.fn(),
        decide: jest.fn(),
        nextRound: jest.fn(),
        cancel: jest.fn(),
        retry: jest.fn()
    }
    const actor = { userId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID() }
    const start = {
        bindingId: randomUUID(),
        objectKey: 'document',
        triggerKey: 'trigger',
        title: 'Document assessment'
    }
    const decision = {
        requestId: randomUUID(),
        attentionId: randomUUID(),
        expectedRevision: 1,
        inputDigest: 'a'.repeat(64),
        generation: 1,
        outcome: 'accept',
        evidence: []
    }
    const nextRound = { instanceId: randomUUID(), requestId: randomUUID(), expectedRevision: 2 }
    const retry = { ...nextRound, operationId: randomUUID(), inputDigest: 'a'.repeat(64), generation: 1 }
    const post = (path: string, body: unknown) =>
        fetch(`${url}/project/pipelines/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProjectPipelineCommandsController],
            providers: [
                { provide: ProjectPipelineCommandsService, useValue: commands },
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
        access.assertCanEdit.mockResolvedValue(undefined)
        access.assertCanManage.mockResolvedValue(undefined)
        commands.start.mockResolvedValue({ runId: randomUUID() })
        commands.decide.mockResolvedValue({ decisionId: randomUUID() })
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
    it('accepts start and decision commands using only the authenticated actor', async () => {
        expect((await post('start', start)).status).toBe(202)
        expect((await post('decisions', decision)).status).toBe(200)
        expect((await post('next-round', nextRound)).status).toBe(202)
        expect((await post('cancel', nextRound)).status).toBe(202)
        expect((await post('retry', retry)).status).toBe(202)
        expect(commands.start).toHaveBeenCalledWith({ projectId: 'project', actor }, start)
        expect(commands.decide).toHaveBeenCalledWith({ projectId: 'project', actor }, decision)
        expect(commands.nextRound).toHaveBeenCalledWith({ projectId: 'project', actor }, nextRound)
        expect(commands.cancel).toHaveBeenCalledWith({ projectId: 'project', actor }, nextRound)
        expect(commands.retry).toHaveBeenCalledWith({ projectId: 'project', actor }, retry)
        expect(access.assertCanEdit).toHaveBeenCalledTimes(5)
    })
    it.each([
        ['start', { ...start, actor }],
        ['start', { ...start, bindingId: 'secret-invalid-binding' }],
        ['decisions', { ...decision, expectedRevision: '1' }],
        ['decisions', { ...decision, generation: 0 }],
        ['decisions', { ...decision, policyRef: 'override@1' }],
        ['configure', { requestId: randomUUID(), configuration: {} }],
        ['next-round', { ...nextRound, expectedRevision: 0 }],
        ['next-round', { ...nextRound, actor }],
        ['cancel', { ...nextRound, expectedRevision: 0 }],
        ['cancel', { ...nextRound, actor }],
        ['retry', { ...retry, inputDigest: 'invalid' }],
        ['retry', { ...retry, generation: 0 }],
        ['retry', { ...retry, actor }]
    ])('rejects malformed %s commands through Nest pipes', async (path, value) => {
        const response = await post(path, value)
        expect(response.status).toBe(400)
        expect(await response.text()).not.toContain('secret-invalid-binding')
        expect(commands.configure).not.toHaveBeenCalled()
        expect(commands.start).not.toHaveBeenCalled()
        expect(commands.decide).not.toHaveBeenCalled()
        expect(commands.nextRound).not.toHaveBeenCalled()
        expect(commands.cancel).not.toHaveBeenCalled()
        expect(commands.retry).not.toHaveBeenCalled()
    })
    it('enforces edit and management guards before reaching command services', async () => {
        access.assertCanEdit.mockRejectedValueOnce(new ForbiddenException())
        expect((await post('start', start)).status).toBe(403)
        access.assertCanManage.mockRejectedValueOnce(new ForbiddenException())
        expect((await post('configure', {})).status).toBe(403)
        expect(commands.start).not.toHaveBeenCalled()
        expect(commands.configure).not.toHaveBeenCalled()
    })
})
