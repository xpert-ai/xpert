import { ForbiddenException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { TMcpToolAppMeta } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
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
    let instanceStore: { get: jest.Mock; delete: jest.Mock }
    let messageService: { findOne: jest.Mock }
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
        instanceStore = { get: jest.fn().mockResolvedValue(null), delete: jest.fn() }
        messageService = { findOne: jest.fn() }
        queryBus = { execute: jest.fn() }
        toolsetService = { findOne: jest.fn(), isPro: jest.fn().mockReturnValue(false) }
        service = new McpAppsService(
            toolsetService as unknown as XpertToolsetService,
            {} as CommandBus,
            queryBus as unknown as QueryBus,
            messageService as unknown as ChatMessageService,
            audit as unknown as McpAppAuditService,
            instanceStore as unknown as McpAppInstanceStoreService,
            approvals as unknown as McpAppToolApprovalService
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

    it('revives a historical App from persisted chat message metadata after API state is lost', async () => {
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
        messageService.findOne.mockResolvedValue({
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

        expect(messageService.findOne).toHaveBeenCalledWith('message-history')
        expect(mockCreateMcpClient).toHaveBeenCalledWith(
            toolset,
            expect.any(Object),
            {},
            undefined,
            expect.objectContaining({ appInstanceId: 'app-history' })
        )
        expect(mockRestoreMcpAppInstance).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'app-history',
                toolset,
                toolMeta,
                toolCallId: 'call-history'
            })
        )
    })
})
