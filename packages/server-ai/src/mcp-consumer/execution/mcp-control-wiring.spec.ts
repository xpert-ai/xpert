import { XpertModule } from '../../xpert/xpert.module'
import { AuthorizeAssistantMcpHandler } from '../../xpert/mcp-access/authorize-assistant-mcp.handler'
import { AuthorizePublicationMcpHandler } from '../../mcp-publication/control/authorize-publication-mcp.handler'
import { Test } from '@nestjs/testing'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { TaskControlModule, TaskControlStore, User } from '@xpert-ai/server-core'
import { XpertToolsetModule } from '../../xpert-toolset/xpert-toolset.module'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { McpPublicationModule } from '../../mcp-publication/mcp-publication.module'
import { McpTaskControlStore } from '../../mcp-publication/control/mcp-task-control.store'
import { McpClientConnectionService } from '../runtime/mcp-client-connection.service'
import { McpRemoteOperation } from './mcp-operation.entity'
import { McpOperationStore } from './mcp-operation.store'
import { McpOperationTransport } from './mcp-operation.transport'
import { McpOperationService } from './mcp-operation.service'
import { ExecuteMcpOperationCommand } from './mcp-operation.command'
import { McpConsumer } from '../mcp-consumer'

describe('MCP execution control dependency injection', () => {
    it('registers one host command handler with its required scope/store dependencies', async () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, XpertToolsetModule) as object[]
        for (const provider of [McpOperationService, McpOperationStore, McpOperationTransport])
            expect(providers.filter((value) => value === provider)).toHaveLength(1)
        expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, XpertToolsetModule)).toContain(TaskControlModule)
        expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, McpPublicationModule)).toContain(TaskControlModule)
        expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, McpPublicationModule)).toContain(McpTaskControlStore)
        expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, XpertModule)).toContain(AuthorizeAssistantMcpHandler)
        expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, McpPublicationModule)).toContain(
            AuthorizePublicationMcpHandler
        )
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            providers: [
                McpOperationService,
                McpOperationStore,
                McpOperationTransport,
                { provide: TaskControlStore, useValue: {} },
                { provide: McpClientConnectionService, useValue: {} },
                ...[McpRemoteOperation, XpertToolset, User].map((entity) => ({
                    provide: getRepositoryToken(entity),
                    useValue: {}
                }))
            ]
        }).compile()
        await module.init()
        const controller = new AbortController()
        controller.abort(new Error('wait ended'))
        const input = {
            consumer: Object.create(McpConsumer.prototype) as McpConsumer,
            connectionVersion: 'a'.repeat(64),
            toolsetId: 'fixture',
            toolName: 'fixture',
            serverName: 'fixture',
            arguments: {},
            mode: 'task' as const,
            signal: controller.signal
        }
        await expect(module.get(CommandBus).execute(new ExecuteMcpOperationCommand(input))).rejects.toThrow(
            'wait ended'
        )
        await module.close()
    })
})
