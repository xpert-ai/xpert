import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import type { Request, Response, NextFunction } from 'express'
import { ArtifactGroupReferenceService } from '../../artifacts/group-references/artifact-group-reference.service'
import { ArtifactGroupViewService } from '../../artifacts/group-references/artifact-group-view.service'
import { ArtifactUseGrantsController } from '../../artifacts/group-references/artifact-use-grants.controller'
import { ArtifactUseGrantService } from '../../artifacts/use-grants/artifact-use-grant.service'
import { ArtifactUseGrant } from '../../artifacts/use-grants/artifact-use-grant.entity'
import { GroupAccessService } from '../../chat-group/group-access.service'
import { GroupArtifactsController } from './group-artifacts.controller'
import { GroupScopeGuard } from './group-scope.guard'

describe('Artifact grant and group reference HTTP boundaries', () => {
    let app: INestApplication, origin: string
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const groupId = randomUUID(),
        grantId = randomUUID(),
        referenceId = randomUUID()
    const record = Object.assign(new ArtifactUseGrant(), {
        id: grantId,
        artifactId: randomUUID(),
        versionId: randomUUID(),
        ownerProjectId: randomUUID(),
        targetProjectId: randomUUID(),
        targetGroupId: groupId,
        permission: 'read',
        status: 'offered',
        revision: 1,
        expiresAt: new Date(Date.now() + 60_000),
        issuedById: randomUUID()
    })
    const references = { attach: jest.fn(), list: jest.fn(), offers: jest.fn(), remove: jest.fn() }
    const views = { read: jest.fn(), query: jest.fn() }
    const grants = { offer: jest.fn(), revoke: jest.fn() }
    const access = { authorize: jest.fn() }
    let principal: ReturnType<typeof RequestContext.currentApiPrincipal>
    const route = `/groups/${groupId}/artifacts`
    const post = (url: string, input: object) =>
        fetch(origin + url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        })
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [GroupArtifactsController, ArtifactUseGrantsController],
            providers: [
                GroupScopeGuard,
                { provide: ArtifactGroupReferenceService, useValue: references },
                { provide: ArtifactGroupViewService, useValue: views },
                { provide: ArtifactUseGrantService, useValue: grants },
                { provide: GroupAccessService, useValue: access }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        app.use((req: Request, _res: Response, next: NextFunction) => {
            Object.assign(req, { user: principal })
            next()
        })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
        principal = null
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockImplementation(() => principal)
        references.list.mockResolvedValue({ items: [], nextOffset: null })
        references.offers.mockResolvedValue({ items: [], nextOffset: null })
        references.attach.mockResolvedValue({ id: referenceId })
        views.read.mockResolvedValue({ content: { kind: 'presentation' } })
        views.query.mockResolvedValue({ rows: [] })
        grants.offer.mockResolvedValue(record)
        grants.revoke.mockResolvedValue({ ...record, status: 'revoked', revision: 2 })
        access.authorize.mockResolvedValue({})
    })
    afterAll(async () => {
        jest.restoreAllMocks()
        await app?.close()
    })

    it('parses source grant input, captures the host actor and returns a credential-free DTO', async () => {
        const body = {
            artifactId: record.artifactId,
            versionId: record.versionId,
            targetGroupId: groupId,
            expiresAt: record.expiresAt.toISOString()
        }
        const response = await post('/artifacts/use-grants', body)
        expect(response.status).toBe(201)
        expect(response.headers.get('Cache-Control')).toBe('private, no-store')
        expect(grants.offer).toHaveBeenCalledWith(actor, { ...body, expiresAt: record.expiresAt })
        expect(await response.json()).not.toHaveProperty('issuedById')
        for (const override of [
            { actor },
            { ownerProjectId: randomUUID() },
            { targetProjectId: randomUUID() },
            { permission: 'write' },
            { expiresAt: 'tomorrow' }
        ])
            expect((await post('/artifacts/use-grants', { ...body, ...override })).status).toBe(400)
        expect(grants.offer).toHaveBeenCalledTimes(1)
    })

    it('coerces bounded pagination and validates attach/remove/query bodies through Nest pipes', async () => {
        expect((await fetch(origin + route + '/references?offset=2&limit=10')).status).toBe(200)
        expect(references.list).toHaveBeenCalledWith(actor, groupId, { offset: 2, limit: 10 })
        expect((await fetch(origin + route + '/offers')).status).toBe(200)
        expect(references.offers).toHaveBeenCalledWith(actor, groupId, { offset: 0, limit: 50 })
        for (const query of ['limit=101', 'offset=-1', 'projectId=override', 'groupId=override', 'offset=1.1'])
            expect((await fetch(origin + route + '/references?' + query)).status).toBe(400)
        const attach = { grantId, expectedRevision: 1 }
        expect((await post(route + '/references', attach)).status).toBe(201)
        expect(references.attach).toHaveBeenCalledWith(actor, groupId, { ...attach, acceptAnalysis: false })
        expect((await post(route + '/references', { ...attach, acceptAnalysis: true })).status).toBe(201)
        expect(references.attach).toHaveBeenCalledWith(actor, groupId, { ...attach, acceptAnalysis: true })
        for (const override of [
            { expectedRevision: 0 },
            { grantId: 'bad' },
            { projectId: randomUUID() },
            { actor },
            { acceptAnalysis: 'true' },
            { analysis: { mode: 'explore' } }
        ])
            expect((await post(route + '/references', { ...attach, ...override })).status).toBe(400)
        const query = {
            target: { artifactId: record.artifactId, versionId: record.versionId },
            operation: 'query',
            input: {}
        }
        expect((await post(`${route}/references/${referenceId}/query`, query)).status).toBe(201)
        expect(views.query).toHaveBeenCalledWith(actor, groupId, referenceId, query)
        for (const invalid of [
            { ...query, projectId: randomUUID() },
            { ...query, target: { artifactId: record.artifactId, draftRevision: 1 } }
        ])
            expect((await post(`${route}/references/${referenceId}/query`, invalid)).status).toBe(400)
        expect((await post(`${route}/references/${referenceId}/remove`, { expectedRevision: 1 })).status).toBe(201)
        expect(references.remove).toHaveBeenCalledWith(actor, groupId, referenceId, { expectedRevision: 1 })
        expect((await post(`/artifacts/use-grants/${grantId}/revoke`, { expectedRevision: 1 })).status).toBe(201)
        expect(grants.revoke).toHaveBeenCalledWith(actor, { grantId, expectedRevision: 1 })
    })

    it('requires the exact group credential guard and preserves a live membership denial', async () => {
        principal = {
            id: actor.userId,
            tenantId: actor.tenantId,
            principalType: 'client_secret',
            requestedOrganizationId: actor.organizationId,
            clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION,
            resourceScope: { kind: 'conversation', conversationId: groupId },
            clientSecretExpiresAt: new Date(Date.now() + 60_000)
        }
        expect((await fetch(origin + route + `/references/${referenceId}`)).status).toBe(200)
        expect(access.authorize).toHaveBeenCalledWith(groupId)
        access.authorize.mockRejectedValueOnce(new ForbiddenException())
        expect((await fetch(origin + route + `/references/${referenceId}`)).status).toBe(403)
        principal.clientSecretBindingType = SecretTokenBindingType.USER_XPERT
        expect((await fetch(origin + route + `/references/${referenceId}`)).status).toBe(403)
        expect(views.read).toHaveBeenCalledTimes(1)
    })

    it('never exposes draft, content download, preview or version-change routes for group credentials', async () => {
        for (const suffix of ['content', 'preview', 'draft', 'versions'])
            expect((await fetch(origin + route + `/references/${referenceId}/${suffix}`)).status).toBe(404)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(null)
        expect((await fetch(origin + route + '/references')).status).toBe(403)
    })
})
