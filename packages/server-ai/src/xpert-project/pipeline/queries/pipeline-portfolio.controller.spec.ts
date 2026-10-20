import { Test } from '@nestjs/testing'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { ProjectPipelinePortfolioController } from './pipeline-portfolio.controller'
import { ProjectPipelinePortfolioService } from './pipeline-portfolio.service'

describe('Pipeline portfolio HTTP boundary', () => {
    const actor = { userId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID() }
    const input = {
        projectIds: [randomUUID(), randomUUID()],
        window: { from: '2026-10-18T00:00:00Z', to: '2026-10-19T00:00:00Z' }
    }
    const portfolio = { read: jest.fn() }
    let app: INestApplication, url: string
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ProjectPipelinePortfolioController],
            providers: [{ provide: ProjectPipelinePortfolioService, useValue: portfolio }]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        url = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        portfolio.read.mockResolvedValue({ selectionScope: 'explicit_authorized_projects' })
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(undefined)
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())
    const post = (body: object) =>
        fetch(`${url}/pipelines/analytics/portfolio`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('uses the trusted actor and explicit selection', async () => {
        expect((await post(input)).status).toBe(200)
        expect(portfolio.read).toHaveBeenCalledWith(actor, input)
    })
    it.each([
        {},
        { ...input, projectIds: [] },
        { ...input, projectIds: ['bad'] },
        { ...input, projectIds: [input.projectIds[0], input.projectIds[0]] },
        { ...input, projectIds: Array.from({ length: 51 }, () => randomUUID()) },
        { ...input, tenantId: randomUUID() },
        { ...input, window: { from: '2025-01-01T00:00:00Z', to: input.window.to } }
    ])('rejects invalid or unbounded requests', async (body) => {
        expect((await post(body)).status).toBe(400)
        expect(portfolio.read).not.toHaveBeenCalled()
    })
    it('returns a denial instead of a partial portfolio', async () => {
        portfolio.read.mockRejectedValue(new ForbiddenException())
        expect((await post(input)).status).toBe(403)
    })
    it('rejects an Assistant delegated session even when it restores a user', async () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            id: actor.userId,
            tenantId: actor.tenantId
        })
        expect((await post(input)).status).toBe(403)
        expect(portfolio.read).not.toHaveBeenCalled()
    })
    it.each(['currentUserId', 'currentTenantId'] as const)('rejects missing %s', async (method) => {
        jest.spyOn(RequestContext, method).mockReturnValue(undefined)
        expect((await post(input)).status).toBe(403)
        expect(portfolio.read).not.toHaveBeenCalled()
    })
})
