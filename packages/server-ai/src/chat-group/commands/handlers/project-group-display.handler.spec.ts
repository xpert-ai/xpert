import type { DynamicModule, ModuleMetadata } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { ChatGroupModule } from '../../chat-group.module'
import { GROUP_ENTITIES } from '../../group.entities'
import { GroupMessageRecipient } from '../../group.entity'
import { GroupMessagesService } from '../../group-messages.service'
import { GroupResourceToolsService } from '../../group-resource-tools.service'
import { ProjectGroupDisplayCommand } from '../project-group-display.command'
import { ProjectGroupDisplayHandler } from './project-group-display.handler'

it('resolves repository dependencies through the owning module registrations without a DataSource dependency', async () => {
    const imports: NonNullable<ModuleMetadata['imports']> = Reflect.getMetadata('imports', ChatGroupModule)
    const repositories = imports.filter(
        (entry): entry is DynamicModule =>
            typeof entry === 'object' && 'module' in entry && entry.module === TypeOrmModule
    )
    const entities = [...GROUP_ENTITIES, ChatConversation, ChatConversationThread, ChatMessage]
    const stubs = new Map(entities.map((entity) => [entity, { findOneBy: jest.fn().mockResolvedValue(null) }]))
    const publish = jest.fn()
    const builder = Test.createTestingModule({
        imports: repositories,
        providers: [
            ProjectGroupDisplayHandler,
            { provide: GroupMessagesService, useValue: { publish } },
            { provide: CommandBus, useValue: { execute: jest.fn() } },
            { provide: GroupResourceToolsService, useValue: { validateAnalysisDelivery: jest.fn() } }
        ]
    })
    for (const entity of entities) builder.overrideProvider(getRepositoryToken(entity)).useValue(stubs.get(entity))
    const module = await builder.compile()
    try {
        const handler = module.get(ProjectGroupDisplayHandler)
        for (const entity of entities) expect(module.get(getRepositoryToken(entity))).toBe(stubs.get(entity))
        await handler.execute(
            new ProjectGroupDisplayCommand('tenant', 'organization', 'receipt', 'output', [
                {
                    id: 'result',
                    type: 'component',
                    data: { type: 'McpApp', toolResult: { content: [{ type: 'text', text: 'Result' }] } }
                }
            ])
        )
        expect(stubs.get(GroupMessageRecipient).findOneBy).toHaveBeenCalledWith({
            tenantId: 'tenant',
            organizationId: 'organization',
            id: 'receipt'
        })
        expect(publish).not.toHaveBeenCalled()
    } finally {
        await module.close()
    }
})
