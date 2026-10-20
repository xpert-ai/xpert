import { MODULE_METADATA } from '@nestjs/common/constants'
import { QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { ChatConversationModule } from './conversation.module'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatConversationThreadService } from './conversation-thread.service'
import { SideChatForkService } from './side-chat-fork.service'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { CopilotCheckpointSaver } from '../copilot-checkpoint/checkpoint-saver'
import { CopilotCheckpointModule } from '../copilot-checkpoint/copilot-checkpoint.module'

it('wires the side-chat service through the conversation module and exported checkpoint saver', async () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ChatConversationModule)).toContain(CopilotCheckpointModule)
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ChatConversationModule)).toEqual(
        expect.arrayContaining([ChatConversationThreadService, SideChatForkService])
    )
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, CopilotCheckpointModule)).toContain(CopilotCheckpointSaver)
    const module = await Test.createTestingModule({
        providers: [
            ChatConversationThreadService,
            SideChatForkService,
            CopilotCheckpointSaver,
            { provide: DataSource, useValue: {} },
            { provide: QueryBus, useValue: {} },
            ...[ChatConversation, ChatConversationThread, ChatMessage, CopilotCheckpoint, CopilotCheckpointWrites].map(
                (entity) => ({ provide: getRepositoryToken(entity), useValue: {} })
            )
        ]
    }).compile()
    try {
        const threads = module.get(ChatConversationThreadService)
        const source = Object.assign(new ChatConversationThread(), { threadId: 'source' })
        const child = Object.assign(new ChatConversationThread(), { threadId: 'child' })
        jest.spyOn(threads, 'requireByThreadId').mockResolvedValue(source)
        const copy = jest.spyOn(module.get(SideChatForkService), 'copy').mockResolvedValue(child)
        const input = { mode: 'latest-sealed-reply' as const, requestId: 'retry' }
        expect(await threads.copyThread('source', input)).toBe(child)
        expect(copy).toHaveBeenCalledWith(source, input)
    } finally {
        await module.close()
    }
})
