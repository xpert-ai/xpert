import { McpAppHistoryService } from '../mcp-app-runtime/mcp-app-history.service'
import { McpAppHistoryStoreService } from '../mcp-app-runtime/mcp-app-history-store.service'
import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { TMcpToolAppMeta } from '@xpert-ai/contracts'
import { ApiKeyBindingType, type IApiKey } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { RequestContext as SdkRequestContext } from '@xpert-ai/plugin-sdk'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { McpAppAuditService, McpAppInstanceStoreService, McpAppToolApprovalService } from '../mcp-app-runtime'
import { McpAppsService } from './mcp-apps.service'
import type { McpAppInstance } from './provider/mcp/app-support'
import { XpertToolsetService } from './xpert-toolset.service'

jest.mock('./provider/mcp/types', () => ({ createMCPClient: jest.fn() }))
jest.mock('./provider/mcp/pro', () => ({ createProMCPClient: jest.fn() }))
jest.mock('./provider/mcp/app-support', () => ({
    appendMcpAppLog: jest.fn(),
    appendMcpAppMessage: jest.fn(),
    applyMcpAppInstanceSnapshot: jest.fn(),
    callMcpAppTool: jest.fn(),
    configureMcpAppInstancePersistence: jest.fn(),
    getInitialMcpAppToolInput: jest.fn(),
    getInitialMcpAppToolResult: jest.fn(),
    getMcpAppInstance: jest.fn(() => ({
        id: 'app-1',
        toolset: {
            id: 'toolset-1',
            tenantId: 'tenant-1',
            workspaceId: 'workspace-1'
        },
        toolMeta: {
            serverName: 'default',
            name: 'write_file',
            displayName: 'write_file',
            visibility: ['model', 'app']
        }
    })),
    getMcpAppToolMetadata: jest.fn(),
    isMcpAppsEnabled: jest.fn(() => true),
    isMcpAppTokenRequired: jest.fn(() => false),
    listMcpAppVisibleToolMetadata: jest.fn(),
    listMcpToolAppMetadata: jest.fn(),
    readMcpAppResource: jest.fn(),
    readMcpAppServerResource: jest.fn(),
    refreshMcpAppInstanceToken: jest.fn(),
    createMcpAppInstanceToken: jest.fn(() => 'refreshed-token'),
    removeMcpAppInstance: jest.fn(),
    restoreMcpAppInstance: jest.fn(),
    runMcpAppInstanceMutation: jest.fn((_appInstanceId: string, task: () => Promise<unknown>) => task()),
    snapshotMcpAppInstance: jest.fn(),
    updateMcpAppModelContext: jest.fn(),
    verifyMcpAppInstanceToken: jest.fn(),
    waitForMcpAppInstancePersistence: jest.fn()
}))

import {
    callMcpAppTool,
    getMcpAppInstance,
    getMcpAppToolMetadata,
    getInitialMcpAppToolInput,
    getInitialMcpAppToolResult,
    isMcpAppTokenRequired,
    listMcpToolAppMetadata,
    readMcpAppResource,
    refreshMcpAppInstanceToken,
    removeMcpAppInstance,
    restoreMcpAppInstance
} from './provider/mcp/app-support'
import { createMCPClient } from './provider/mcp/types'

const mockCallMcpAppTool = jest.mocked(callMcpAppTool)
const mockCreateMcpClient = jest.mocked(createMCPClient)
const mockGetMcpAppInstance = jest.mocked(getMcpAppInstance)
const mockGetMcpAppToolMetadata = jest.mocked(getMcpAppToolMetadata)
const mockGetInitialMcpAppToolInput = jest.mocked(getInitialMcpAppToolInput)
const mockGetInitialMcpAppToolResult = jest.mocked(getInitialMcpAppToolResult)
const mockIsMcpAppTokenRequired = jest.mocked(isMcpAppTokenRequired)
const mockListMcpToolAppMetadata = jest.mocked(listMcpToolAppMetadata)
const mockReadMcpAppResource = jest.mocked(readMcpAppResource)
const mockRefreshMcpAppInstanceToken = jest.mocked(refreshMcpAppInstanceToken)
const mockRestoreMcpAppInstance = jest.mocked(restoreMcpAppInstance)

describe('McpAppsService RPC approval orchestration', () => {
    let approvals: {
        risk: jest.Mock
        request: jest.Mock
        consume: jest.Mock
        approve: jest.Mock
        reject: jest.Mock
    }
    let instanceStore: { get: jest.Mock; delete: jest.Mock; resume: jest.Mock }
    let messageService: { findOneAuthorized: jest.Mock }
    let history: { load: jest.Mock }
    let historyStore: { preserve: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let toolsetService: { findOne: jest.Mock; isPro: jest.Mock }
    let service: McpAppsService

    beforeEach(() => {
        approvals = {
            risk: jest.fn().mockReturnValue('write'),
            request: jest.fn().mockResolvedValue({
                approvalId: 'approval-1',
                risk: 'write',
                expiresAt: Date.now() + 60_000
            }),
            consume: jest.fn(),
            approve: jest.fn(),
            reject: jest.fn()
        }
        const audit = {
            start: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            finish: jest.fn()
        }
        instanceStore = { get: jest.fn().mockResolvedValue(null), delete: jest.fn(), resume: jest.fn() }
        messageService = { findOneAuthorized: jest.fn() }
        history = { load: jest.fn() }
        historyStore = { preserve: jest.fn() }
        queryBus = { execute: jest.fn() }
        toolsetService = { findOne: jest.fn(), isPro: jest.fn().mockReturnValue(false) }
        service = new McpAppsService(
            toolsetService as unknown as XpertToolsetService,
            {} as CommandBus,
            queryBus as unknown as QueryBus,
            messageService as unknown as ChatMessageService,
            audit as unknown as McpAppAuditService,
            instanceStore as unknown as McpAppInstanceStoreService,
            approvals as unknown as McpAppToolApprovalService,
            history as unknown as McpAppHistoryService,
            historyStore as unknown as McpAppHistoryStoreService
        )
        mockGetMcpAppToolMetadata.mockResolvedValue({
            serverName: 'default',
            name: 'write_file',
            displayName: 'write_file',
            visibility: ['model', 'app'],
            annotations: { readOnlyHint: false }
        })
        mockCallMcpAppTool.mockResolvedValue({ content: [{ type: 'text', text: 'done' }] })
    })

    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('tears down a lease through one versioned persistence operation', async () => {
        await expect(service.teardown('app-1')).resolves.toEqual({ removed: true })
        expect(removeMcpAppInstance).toHaveBeenCalledTimes(1)
        expect(removeMcpAppInstance).toHaveBeenCalledWith('app-1')
        expect(instanceStore.delete).not.toHaveBeenCalled()
    })

    it('retains a paused native form on unmount and returns its scoped continuation', async () => {
        const instance = mockGetMcpAppInstance('app-1')!
        const assertAccess = jest.fn()
        mockGetMcpAppInstance.mockReturnValue({
            ...instance,
            toolCallId: 'call-1',
            executionContext: { xpertId: 'assistant', conversationId: 'conversation', executionId: 'run' },
            middleware: {
                source: {
                    kind: 'middleware',
                    provider: 'settings',
                    nodeKey: 'settings',
                    agentKey: 'Main',
                    pluginName: 'test',
                    interruptAfter: true
                },
                assertAccess,
                callTool: jest.fn(),
                listTools: jest.fn(),
                readResource: jest.fn(),
                requiresApproval: jest.fn()
            }
        })
        await expect(service.teardown('app-1')).resolves.toEqual({ removed: false })
        expect(instanceStore.delete).not.toHaveBeenCalled()
        expect(mockRefreshMcpAppInstanceToken).toHaveBeenCalled()
        const response = await service.handleRpc('app-1', {
            jsonrpc: '2.0',
            id: 1,
            method: 'ui/message',
            params: { role: 'user', content: [{ type: 'text', text: 'Continue' }] }
        })
        expect(response).toMatchObject({
            result: { continuation: { type: 'tool_after', toolCallId: 'call-1', executionId: 'run' } }
        })
        expect(assertAccess).toHaveBeenCalled()
        mockGetMcpAppInstance.mockReturnValue(instance)
    })

    it('rejects an app instance bound to another user before invoking a tool', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-2')
        const instance = mockGetMcpAppInstance('app-1')
        if (!instance) {
            throw new Error('Expected the default MCP App test instance')
        }
        mockGetMcpAppInstance.mockReturnValueOnce({
            ...instance,
            userId: 'user-1'
        })

        await expect(
            service.handleRpc('app-1', {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'write_file', arguments: { path: 'report.txt' } }
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
    })

    it('rejects a session bound to another Assistant before App RPC', async () => {
        const instance = mockGetMcpAppInstance('app-1')!
        mockGetMcpAppInstance.mockReturnValueOnce({
            ...instance,
            executionContext: { xpertId: 'assistant-a', conversationId: 'conversation', executionId: 'run' }
        })
        jest.spyOn(SdkRequestContext, 'currentApiPrincipal').mockReturnValue({
            resourceScope: { kind: 'assistant', xpertId: 'assistant-b' }
        } as ReturnType<typeof SdkRequestContext.currentApiPrincipal>)
        await expect(
            service.handleRpc('app-1', {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'write_file', arguments: {} }
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
    })

    it('accepts an expert App only through its persisted same-thread delegation', async () => {
        const instance = mockGetMcpAppInstance('app-1')!
        mockGetMcpAppInstance.mockReturnValueOnce({
            ...instance,
            executionContext: {
                xpertId: 'expert',
                conversationId: 'conversation',
                executionId: 'child',
                threadId: 'thread'
            }
        })
        jest.spyOn(SdkRequestContext, 'currentApiPrincipal').mockReturnValue({
            resourceScope: { kind: 'assistant', xpertId: 'main' }
        } as ReturnType<typeof SdkRequestContext.currentApiPrincipal>)
        queryBus.execute.mockImplementation(async (query) =>
            query.id === 'child'
                ? { id: 'child', xpertId: 'expert', threadId: 'thread', parentId: 'root' }
                : { id: 'root', xpertId: 'main', threadId: 'thread' }
        )
        approvals.risk.mockReturnValue('read')
        await expect(
            service.handleRpc('app-1', {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'write_file', arguments: {} }
            })
        ).resolves.toMatchObject({ result: { content: [{ text: 'done' }] } })
        expect(mockCallMcpAppTool).toHaveBeenCalledTimes(1)
    })

    it('rejects another Assistant audience before restoring an App backend', async () => {
        mockGetMcpAppInstance.mockReturnValueOnce(null)
        instanceStore.get.mockResolvedValue({ executionContext: { xpertId: 'assistant-a' } })
        jest.spyOn(SdkRequestContext, 'currentApiPrincipal').mockReturnValue({
            resourceScope: { kind: 'assistant', xpertId: 'assistant-b' }
        } as ReturnType<typeof SdkRequestContext.currentApiPrincipal>)
        await expect(
            service.handleRpc('app-1', {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'write_file', arguments: {} }
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(mockCreateMcpClient).not.toHaveBeenCalled()
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
    })

    it('does not execute a write tool before approval or after approval consumption is rejected', async () => {
        const pending = await service.handleRpc('app-1', {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'write_file', arguments: { path: 'report.txt' } }
        })

        expect(pending).toMatchObject({ error: { code: -32001 } })
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()

        approvals.consume.mockRejectedValueOnce(new Error('approval was rejected'))
        const rejected = await service.handleRpc('app-1', {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'write_file',
                arguments: { path: 'report.txt' },
                approvalId: 'approval-1'
            }
        })

        expect(rejected).toMatchObject({ error: { code: -32000, message: 'approval was rejected' } })
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
    })

    it('executes an app-visible read tool without creating an approval', async () => {
        approvals.risk.mockReturnValueOnce('read')

        const response = await service.handleRpc('app-1', {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'write_file', arguments: { path: 'report.txt' } }
        })

        expect(response).toMatchObject({ result: { content: [{ type: 'text', text: 'done' }] } })
        expect(approvals.request).not.toHaveBeenCalled()
        expect(approvals.consume).not.toHaveBeenCalled()
        expect(mockCallMcpAppTool).toHaveBeenCalledTimes(1)
    })

    it('uses the standard pip display mode and normalizes the legacy alias', async () => {
        await expect(
            service.handleRpc('app-1', {
                jsonrpc: '2.0',
                id: 4,
                method: 'ui/request-display-mode',
                params: { mode: 'pip' }
            })
        ).resolves.toMatchObject({ result: { mode: 'pip' } })
        await expect(
            service.handleRpc('app-1', {
                jsonrpc: '2.0',
                id: 5,
                method: 'ui/request-display-mode',
                params: { mode: 'picture-in-picture' }
            })
        ).resolves.toMatchObject({ result: { mode: 'pip' } })
    })

    it('validates ui/open-link through the audited host RPC boundary', async () => {
        await expect(
            service.handleRpc('app-1', {
                jsonrpc: '2.0',
                id: 6,
                method: 'ui/open-link',
                params: { url: 'https://docs.example.com/report' }
            })
        ).resolves.toMatchObject({ result: {} })
        await expect(
            service.handleRpc('app-1', {
                jsonrpc: '2.0',
                id: 7,
                method: 'ui/open-link',
                params: { url: 'javascript:alert(1)' }
            })
        ).resolves.toMatchObject({ error: { code: -32000, message: expect.stringContaining('http or https') } })
    })

    it.each([
        [null, 'MCP_APP_SESSION_UNAVAILABLE'],
        [{ executionContext: { xpertId: 'assistant' } }, 'MCP_APP_SESSION_EXPIRED']
    ])('returns a structured expired lease error without reviving (%s)', async (snapshot, code) => {
        mockGetMcpAppInstance.mockReturnValueOnce(null)
        history.load.mockResolvedValue({ snapshot, history: {} })
        await expect(service.getResource('app-old', { messageId: 'message-old' })).rejects.toMatchObject({
            response: { code },
            status: 410
        })
        expect(history.load).toHaveBeenCalledWith('app-old', 'message-old')
        expect(mockRestoreMcpAppInstance).not.toHaveBeenCalled()
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
    })

    it('does not expose missing sessions without an authorized message', async () => {
        mockGetMcpAppInstance.mockReturnValueOnce(null)
        await expect(service.getResource('app-old')).rejects.toBeInstanceOf(NotFoundException)
        expect(history.load).not.toHaveBeenCalled()
    })

    it('preserves history ACL denial rather than translating it to session expiry', async () => {
        mockGetMcpAppInstance.mockReturnValueOnce(null)
        history.load.mockRejectedValue(new ForbiddenException())
        await expect(service.getResource('app-old', { messageId: 'foreign-message' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
    })

    it('refuses to resume legacy cards without trusted provenance', async () => {
        history.load.mockResolvedValue({ snapshot: null, history: { canResume: false } })
        await expect(service.resume('app-old', 'message-old')).rejects.toBeInstanceOf(GoneException)
        expect(mockCreateMcpClient).not.toHaveBeenCalled()
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
    })

    it('explicitly resumes the same card with a fresh lease without replaying its opening tool', async () => {
        const original = {
            version: 1,
            stateVersion: 1,
            appInstanceId: 'app-resume',
            userId: 'user-1',
            source: {
                kind: 'middleware' as const,
                provider: 'maps',
                nodeKey: 'maps',
                agentKey: 'agent',
                pluginName: 'maps',
                interruptAfter: false
            },
            executionContext: { xpertId: 'assistant', executionId: 'run', conversationId: 'conversation' },
            expiresAt: 1
        }
        const active = mockGetMcpAppInstance('app-1')!
        const assertAccess = jest.fn()
        const restored: McpAppInstance = {
            ...active,
            id: 'app-resume',
            userId: 'user-1',
            executionContext: original.executionContext,
            middleware: {
                source: original.source,
                assertAccess,
                callTool: jest.fn(),
                readResource: jest.fn(),
                listTools: jest.fn(),
                requiresApproval: jest.fn()
            }
        }
        const restore = jest.fn(async (snapshot, options) => {
            await options.prepareSession(snapshot)
            return restored
        })
        Object.assign(service, { middlewareApps: { restore } })
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        history.load.mockResolvedValue({ snapshot: original, history: { canResume: true } })
        instanceStore.resume.mockResolvedValue({ ...original, stateVersion: 10, expiresAt: Date.now() + 1000 })
        messageService.findOneAuthorized.mockResolvedValue({
            content: [{ type: 'McpApp', appInstanceId: 'app-resume' }]
        })
        mockGetMcpAppInstance.mockReturnValueOnce(null).mockReturnValueOnce(restored)
        mockReadMcpAppResource.mockResolvedValue({ text: '<main>Maps</main>' } as Awaited<
            ReturnType<typeof readMcpAppResource>
        >)
        await expect(service.resume('app-resume', 'message')).resolves.toMatchObject({
            appInstanceToken: 'refreshed-token'
        })
        expect(history.load).toHaveBeenCalledWith('app-resume', 'message')
        expect(instanceStore.resume).toHaveBeenCalledWith(original, expect.any(Number))
        expect(assertAccess).toHaveBeenCalled()
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
    })

    it('reuses a valid in-memory lease for repeated resume without extending its expiry', async () => {
        const expiry = Date.now() + 10_000
        const active = { ...mockGetMcpAppInstance('app-1')!, userId: 'user-1', expiresAt: expiry }
        history.load.mockResolvedValue({
            snapshot: {
                userId: 'user-1',
                toolsetId: 'toolset-1',
                executionContext: { xpertId: 'assistant', executionId: 'run', conversationId: 'conversation' }
            }
        })
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        mockGetMcpAppInstance.mockReturnValue(active)
        mockReadMcpAppResource.mockResolvedValue({ text: '<main>Saved</main>' } as Awaited<
            ReturnType<typeof readMcpAppResource>
        >)
        await service.resume('app-1', 'message')
        await service.resume('app-1', 'message')
        expect(active.expiresAt).toBe(expiry)
        expect(instanceStore.resume).not.toHaveBeenCalled()
        expect(mockRefreshMcpAppInstanceToken).not.toHaveBeenCalled()
        expect(mockRestoreMcpAppInstance).not.toHaveBeenCalled()
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
        mockGetMcpAppInstance.mockReturnValue({ ...active, userId: undefined })
    })

    it('does not mint a lease when current middleware permissions were revoked', async () => {
        history.load.mockResolvedValue({
            snapshot: {
                appInstanceId: 'app',
                userId: 'user-1',
                source: { kind: 'middleware' },
                executionContext: { xpertId: 'assistant', executionId: 'run', conversationId: 'conversation' }
            }
        })
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        Object.assign(service, { middlewareApps: { restore: jest.fn().mockRejectedValue(new ForbiddenException()) } })
        mockGetMcpAppInstance.mockReturnValueOnce(null)
        await expect(service.resume('app', 'message')).rejects.toBeInstanceOf(ForbiddenException)
        expect(instanceStore.resume).not.toHaveBeenCalled()
        expect(mockCallMcpAppTool).not.toHaveBeenCalled()
    })

    it.each([true])('restores an unexpired Redis lease with persisted execution context: %s', async (withContext) => {
        const executionContext = {
            xpertId: 'assistant-1',
            conversationId: 'conversation-1',
            executionId: 'execution-1',
            projectId: 'project-1'
        }
        if (withContext) instanceStore.get.mockResolvedValue({ executionContext })
        const client = { close: jest.fn() } as unknown as MultiServerMCPClient
        const toolset = {
            id: 'toolset-history',
            name: 'Historical MCP',
            tenantId: 'tenant-1',
            workspaceId: 'workspace-1',
            tools: [],
            options: {},
            schema: JSON.stringify({ mcpServers: {} })
        }
        const toolMeta: TMcpToolAppMeta = {
            serverName: 'default',
            name: 'history_tool',
            displayName: 'history_tool',
            visibility: ['model', 'app'],
            ui: { resourceUri: 'ui://history/app.html' }
        }
        const restored: McpAppInstance = {
            id: 'app-history',
            client,
            toolset,
            toolMeta,
            messages: [],
            logs: [],
            stateVersion: 1,
            createdAt: Date.now(),
            expiresAt: Date.now() + 60_000
        }
        mockGetMcpAppInstance.mockReturnValueOnce(null)
        mockIsMcpAppTokenRequired.mockReturnValueOnce(true).mockReturnValueOnce(true)
        toolsetService.findOne.mockResolvedValue(toolset)
        queryBus.execute.mockResolvedValue({})
        messageService.findOneAuthorized.mockResolvedValue({
            content: [
                {
                    data: {
                        type: 'McpApp',
                        appInstanceId: 'app-history',
                        toolsetId: toolset.id,
                        serverName: toolMeta.serverName,
                        toolName: toolMeta.name,
                        toolCallId: 'call-history',
                        resourceUri: toolMeta.ui.resourceUri
                    }
                }
            ]
        })
        mockCreateMcpClient.mockResolvedValue({ client, destroy: jest.fn(async () => undefined), logs: [] })
        mockListMcpToolAppMetadata.mockResolvedValue([toolMeta])
        mockRestoreMcpAppInstance.mockReturnValue(restored)
        mockReadMcpAppResource.mockResolvedValue({
            uri: toolMeta.ui.resourceUri,
            mimeType: 'text/html;profile=mcp-app',
            text: '<main>Recovered</main>',
            blob: undefined,
            title: 'Recovered App',
            description: 'Historical App',
            icon: { type: 'emoji', value: '🧭' },
            csp: {},
            permissions: {},
            domain: 'https://apps.example.com',
            prefersBorder: false
        })
        mockRefreshMcpAppInstanceToken.mockReturnValue('refreshed-token')
        mockGetInitialMcpAppToolInput.mockReturnValue({})
        mockGetInitialMcpAppToolResult.mockReturnValue(undefined)

        await expect(
            service.getResource('app-history', {
                toolsetId: toolset.id,
                serverName: toolMeta.serverName,
                toolName: toolMeta.name,
                toolCallId: 'call-history',
                resourceUri: toolMeta.ui.resourceUri,
                messageId: 'message-history'
            })
        ).resolves.toMatchObject({
            appInstanceToken: 'refreshed-token',
            resourceUri: toolMeta.ui.resourceUri,
            text: '<main>Recovered</main>'
        })

        expect(messageService.findOneAuthorized).toHaveBeenCalledWith('message-history')
        expect(mockCreateMcpClient).toHaveBeenCalledWith(
            toolset,
            expect.any(Object),
            {},
            undefined,
            expect.objectContaining({ appInstanceId: 'app-history', ...(withContext ? executionContext : {}) })
        )
        expect(mockRestoreMcpAppInstance).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'app-history',
                executionContext: withContext ? executionContext : undefined,
                toolset,
                toolMeta,
                toolCallId: 'call-history'
            })
        )
    })
})
