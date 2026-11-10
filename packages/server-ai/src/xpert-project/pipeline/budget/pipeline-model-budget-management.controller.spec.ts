jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IUser } from '@xpert-ai/contracts'
import type { NextFunction, Request, Response } from 'express'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectPipelineModelBudgetManagementController } from './pipeline-model-budget-management.controller'
import { ProjectPipelineModelBudgetManagementService } from './pipeline-model-budget-management.service'

describe('human budget management HTTP boundary', () => {
    let app: INestApplication, url: string
    const access = { assertCanManage: jest.fn() }
    const budgets = { increase: jest.fn(), inspect: jest.fn() }
    const projectId = randomUUID()
    const actor = { userId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID() }
    const input = {
        instanceId: randomUUID(),
        requestId: randomUUID(),
        expectedRevision: 7,
        maxTokens: 4000000,
        reason: 'Authorized total ceiling'
    }
    const post = (body: unknown) =>
        fetch(`${url}/${projectId}/pipelines/native-model-budget/increases`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProjectPipelineModelBudgetManagementController],
            providers: [
                { provide: ProjectPipelineModelBudgetManagementService, useValue: budgets },
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
        access.assertCanManage.mockResolvedValue(undefined)
        budgets.increase.mockResolvedValue({ eventId: randomUUID() })
        budgets.inspect.mockResolvedValue({ policy: { maxTokens: 4000000 } })
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
    it('uses authenticated scope for increases and history reads', async () => {
        expect((await post({ ...input, reason: `  ${input.reason}  ` })).status).toBe(200)
        expect(budgets.increase).toHaveBeenCalledWith({ projectId, actor }, input)
        expect((await fetch(`${url}/${projectId}/pipelines/${input.instanceId}/native-model-budget`)).status).toBe(200)
        expect(budgets.inspect).toHaveBeenCalledWith({ projectId, actor }, input.instanceId)
        expect(access.assertCanManage).toHaveBeenCalledTimes(2)
    })
    it.each([
        { ...input, actor },
        { ...input, maxCalls: 999 },
        { ...input, maxTokens: '4000000' },
        { ...input, maxTokens: 0 },
        { ...input, maxTokens: 1.5 },
        { ...input, maxTokens: 1000000000001 },
        { ...input, reason: '  ' },
        { ...input, reason: 'x'.repeat(2001) },
        { ...input, expectedRevision: -1 },
        { ...input, requestId: 'private-invalid-id' }
    ])('rejects invalid or injected command fields', async (body) => {
        const response = await post(body)
        expect(response.status).toBe(400)
        expect(await response.text()).not.toContain('private-invalid-id')
        expect(budgets.increase).not.toHaveBeenCalled()
    })
    it('requires management permission on writes and audit reads', async () => {
        access.assertCanManage.mockRejectedValue(new ForbiddenException())
        expect((await post(input)).status).toBe(403)
        expect((await fetch(`${url}/${projectId}/pipelines/${input.instanceId}/native-model-budget`)).status).toBe(403)
        expect(budgets.increase).not.toHaveBeenCalled()
        expect(budgets.inspect).not.toHaveBeenCalled()
    })
})
