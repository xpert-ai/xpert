import { ViewExtensionController } from '../../../../server/src/view-extension/view-extension.controller'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { Test } from '@nestjs/testing'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { ViewExtensionRoutes, ViewExtensionService } from '@xpert-ai/server-core'
import { GroupViewsController, GroupWorkbenchContextController } from './group-workbench.controller'
import { GroupWorkbenchGuard } from './group-workbench.guard'
import { GroupScopeGuard } from './group-scope.guard'
import { GroupAccessService } from '../../chat-group/group-access.service'
import { GroupParticipant } from '../../chat-group/group.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { WorkspaceFileAccessService } from '../../workspace-file-access/workspace-file-access.service'
import { GroupViewFilesController } from './group-view-files.controller'

import type { Request, Response, NextFunction } from 'express'

const groupId = '11111111-1111-4111-8111-111111111111'
describe('group Views use the original protocol with main Assistant scope', () => {
    let app: INestApplication
    let base: string
    let lastRequest: Request
    const access = { authorize: jest.fn(), assistant: jest.fn() }
    const projects = { assertCanReadXpert: jest.fn() }
    const participants = { findOneBy: jest.fn() }
    const conversations = { findOneBy: jest.fn() }
    const views = {
        listSlotViews: jest.fn(),
        getViewData: jest.fn(),
        getViewManifest: jest.fn(),
        getRemoteComponentEntry: jest.fn(),
        executeAction: jest.fn()
    }
    const files = {
        createSession: jest.fn(),
        assertAuthenticatedSessionScope: jest.fn(),
        createGrant: jest.fn(),
        revokeSession: jest.fn(),
        buildCookiePath: jest.fn()
    }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [
                ViewExtensionController,
                GroupViewsController,
                GroupWorkbenchContextController,
                GroupViewFilesController
            ],
            providers: [
                GroupWorkbenchGuard,
                { provide: GroupAccessService, useValue: access },
                { provide: ViewExtensionService, useValue: views },
                { provide: WorkspaceFileAccessService, useValue: files },
                { provide: XpertProjectAccessService, useValue: projects },
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: (entity: unknown) => {
                            if (entity === GroupParticipant) return participants
                            if (entity === ChatConversation) return conversations
                            throw new Error('Unexpected entity')
                        }
                    }
                }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .overrideGuard(GroupScopeGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        app.use((req: Request, _res: Response, next: NextFunction) => {
            lastRequest = req
            next()
        })
        await app.listen(0, '127.0.0.1')
        base = `${await app.getUrl()}/groups/${groupId}/workbench`
    })
    beforeEach(() => {
        jest.clearAllMocks()
        access.authorize.mockReset()
        access.assistant.mockReset()
        projects.assertCanReadXpert.mockReset()
        access.authorize.mockResolvedValue({
            group: { xpertId: 'main' },
            scope: { tenantId: 'tenant', organizationId: 'org' }
        })
        access.assistant.mockResolvedValue({ id: 'main' })
        participants.findOneBy.mockResolvedValue({
            id: 'member',
            runtimeConversationId: 'runtime',
            runtimeThreadId: 'thread'
        })
        conversations.findOneBy.mockResolvedValue({ id: 'runtime', threadId: 'thread', projectId: 'project' })
        projects.assertCanReadXpert.mockResolvedValue({})
        views.listSlotViews.mockResolvedValue([{ key: 'tasks' }])
        views.getViewData.mockResolvedValue({ items: [] })
        views.getViewManifest.mockResolvedValue({ key: 'tasks' })
        views.getRemoteComponentEntry.mockResolvedValue({ html: '<main>Tasks</main>' })
        views.executeAction.mockResolvedValue({ success: true })
        files.createSession.mockResolvedValue({
            sessionId: groupId,
            expiresAt: 'expiry',
            cookie: { name: 'file-session', value: 'cookie', options: {} }
        })
        files.assertAuthenticatedSessionScope.mockResolvedValue(undefined)
        files.createGrant.mockResolvedValue({ url: '/content/file' })
        files.revokeSession.mockResolvedValue(undefined)
        files.buildCookiePath.mockReturnValue(`/api/workspace-files/content/${groupId}`)
    })
    afterAll(async () => {
        await app.close()
    })
    it('keeps the original View HTTP routes after extracting shared protocol handlers', async () => {
        const origin = await app.getUrl()
        expect((await fetch(`${origin}/agent/main/slots/agent.workbench.fixed/views?isDraft=true`)).status).toBe(200)
        expect(views.listSlotViews).toHaveBeenCalledWith('agent', 'main', 'agent.workbench.fixed', { isDraft: true })
        expect((await fetch(`${origin}/agent/main/views/tasks/data`)).status).toBe(200)
        expect(access.authorize).not.toHaveBeenCalled()
    })
    it('loads the main runtime scope and applies normal Project read authorization', async () => {
        const response = await fetch(`${base}/context`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            assistantId: 'main',
            participantId: 'member',
            conversationId: 'runtime',
            threadId: 'thread',
            projectId: 'project'
        })
        expect(access.authorize).toHaveBeenCalledWith(groupId)
        expect(projects.assertCanReadXpert).toHaveBeenCalledWith('project', 'main')
    })
    it('binds the existing View request headers to the server-resolved runtime', async () => {
        expect((await fetch(`${base}/agent/main/slots/agent.workbench.fixed/views?isDraft=false`)).status).toBe(200)
        expect(lastRequest.headers['x-xpert-view-conversation-id']).toBe('runtime')
        expect(lastRequest.headers['x-xpert-view-project-id']).toBe('project')
        expect(conversations.findOneBy).toHaveBeenCalledWith({
            tenantId: 'tenant',
            organizationId: 'org',
            id: 'runtime',
            purpose: 'group_assistant_runtime',
            xpertId: 'main',
            threadId: 'thread'
        })
        conversations.findOneBy.mockResolvedValueOnce({ id: 'runtime', threadId: 'thread', projectId: null })
        expect((await fetch(`${base}/agent/main/views/tasks/data`)).status).toBe(200)
        expect(lastRequest.headers['x-xpert-view-project-id']).toBeUndefined()
    })
    it.each(['runtimeConversationId', 'runtimeThreadId'])(
        'rejects an incomplete runtime binding (%s) before querying conversations',
        async (field) => {
            participants.findOneBy.mockResolvedValueOnce({
                id: 'member',
                runtimeConversationId: 'runtime',
                runtimeThreadId: 'thread',
                [field]: null
            })
            expect((await fetch(`${base}/context`)).status).toBe(403)
            expect(conversations.findOneBy).not.toHaveBeenCalled()
        }
    )
    it.each(['membership', 'assistant', 'runtime', 'project'])(
        'does not invoke a View after %s access is lost',
        async (boundary) => {
            if (boundary === 'membership') access.authorize.mockRejectedValueOnce(new ForbiddenException())
            if (boundary === 'assistant') access.assistant.mockRejectedValueOnce(new ForbiddenException())
            if (boundary === 'runtime') conversations.findOneBy.mockResolvedValueOnce(null)
            if (boundary === 'project') projects.assertCanReadXpert.mockRejectedValueOnce(new ForbiddenException())
            expect((await fetch(`${base}/agent/main/views/tasks/data`)).status).toBe(403)
            expect(views.getViewData).not.toHaveBeenCalled()
        }
    )
    it('reuses discovery, manifest, data, remote entry and action handlers without a separate view implementation', async () => {
        expect(GroupViewsController.prototype.getSlotViews).toBe(ViewExtensionRoutes.prototype.getSlotViews)
        for (const route of [
            'slots/agent.workbench.fixed/views',
            'views/tasks/manifest',
            'views/tasks/data',
            'views/tasks/remote-component/entry'
        ]) {
            expect((await fetch(`${base}/agent/main/${route}`)).status).toBe(200)
        }
        const action = await fetch(`${base}/agent/main/views/tasks/actions/refresh`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ input: { filter: 'open' } })
        })
        expect(action.status).toBe(201)
        expect(views.executeAction).toHaveBeenCalledWith('agent', 'main', 'tasks', 'refresh', {
            input: { filter: 'open' }
        })
    })
    it.each([
        ['agent/reviewer/slots/agent.workbench.fixed/views', {}],
        ['project/main/slots/agent.workbench.fixed/views', {}],
        ['agent/main/slots/agent.workbench.fixed/views?isDraft=true', {}],
        ['agent/main/slots/agent.workbench.fixed/views', { 'x-xpert-view-conversation-id': 'other-runtime' }],
        ['agent/main/slots/agent.workbench.fixed/views', { 'x-xpert-view-project-id': 'other-project' }]
    ])('rejects a changed host, draft or runtime scope: %s', async (path, headers) => {
        const response = await fetch(`${base}/${path}`, { headers })
        expect(response.status).toBe(403)
        expect(views.listSlotViews).not.toHaveBeenCalled()
    })
    it('stops before View services when membership or published Assistant access is revoked', async () => {
        participants.findOneBy.mockResolvedValue(null)
        expect((await fetch(`${base}/agent/main/views/tasks/data`)).status).toBe(403)
        expect(views.getViewData).not.toHaveBeenCalled()
    })
    it('creates file sessions in the main runtime scope and keeps the existing grant validation', async () => {
        const headers = { 'content-type': 'application/json' }
        const response = await fetch(`${base}/workspace-files/view-sessions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ hostType: 'agent', hostId: 'main', viewKey: 'tasks' })
        })
        expect(response.status).toBe(201)
        expect(files.createSession).toHaveBeenCalledWith(
            {
                hostType: 'agent',
                hostId: 'main',
                viewKey: 'tasks',
                runtimeScope: { conversationId: 'runtime', projectId: 'project' }
            },
            expect.anything()
        )
        const grant = await fetch(`${base}/workspace-files/view-sessions/${groupId}/grants`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ fileKey: 'result', purpose: 'preview' })
        })
        expect(grant.status).toBe(201)
        expect(files.assertAuthenticatedSessionScope).toHaveBeenCalledWith(
            groupId,
            'main',
            expect.objectContaining({ conversationId: 'runtime', projectId: 'project' })
        )
        const invalid = await fetch(`${base}/workspace-files/view-sessions/${groupId}/grants`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ fileKey: 'result', purpose: 'execute' })
        })
        expect(invalid.status).toBe(400)
        expect(files.createGrant).toHaveBeenCalledTimes(1)
    })
    it('checks the owning runtime before both file grants and revocation', async () => {
        const path = `${base}/workspace-files/view-sessions/${groupId}`
        const grant = () =>
            fetch(`${path}/grants`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ fileKey: 'result', purpose: 'preview' })
            })
        files.assertAuthenticatedSessionScope.mockRejectedValueOnce(new ForbiddenException())
        expect((await grant()).status).toBe(403)
        expect(files.createGrant).not.toHaveBeenCalled()
        files.assertAuthenticatedSessionScope.mockRejectedValueOnce(new ForbiddenException())
        expect((await fetch(path, { method: 'DELETE' })).status).toBe(403)
        expect(files.revokeSession).not.toHaveBeenCalled()
        const revoked = await fetch(path, { method: 'DELETE' })
        expect(revoked.status).toBe(200)
        expect(files.revokeSession).toHaveBeenCalledWith(groupId)
        expect(revoked.headers.get('set-cookie')).toContain(`Path=/api/workspace-files/content/${groupId}`)
    })
    it('rejects file sessions targeting another Assistant or conversation', async () => {
        for (const changes of [{ hostId: 'reviewer' }, { runtimeScope: { conversationId: 'unrelated' } }]) {
            const response = await fetch(`${base}/workspace-files/view-sessions`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ hostType: 'agent', hostId: 'main', viewKey: 'tasks', ...changes })
            })
            expect(response.status).toBe(403)
        }
        expect(files.createSession).not.toHaveBeenCalled()
    })
})
