import { CommandBus } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { VoiceTaskService } from './voice-task.service'
import { VoiceSessionService } from './voice-session.service'
import { RealtimeVoiceTask } from './voice.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { HandoffQueueService } from '../handoff/message-queue.service'

const id = '11111111-1111-4111-8111-111111111111'
it('omits a nullable stored result when replaying an existing task on a call', async () => {
    const row = Object.assign(new RealtimeVoiceTask(), {
        id,
        action: 'send' as const,
        status: 'completed' as const,
        result: null,
        scope: { tenantId: id, organizationId: id, userId: id, assistantId: id, conversationId: id, threadId: id }
    })
    const builder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => [row])
    }
    const service = new VoiceTaskService(
        { createQueryBuilder: () => builder } as unknown as Repository<RealtimeVoiceTask>,
        {} as HandoffQueueService,
        {} as CommandBus,
        {} as VoiceSessionService,
        {} as Repository<XpertAgentExecution>,
        {} as Repository<ChatMessage>
    )
    expect(JSON.parse(JSON.stringify(await service.list(row.scope)))).toEqual([
        { type: 'task', action: 'send', taskId: id, status: 'completed' }
    ])
})

it('follows a waiting task through resumed execution to its canonical completion', async () => {
    const row = Object.assign(new RealtimeVoiceTask(), {
        id,
        tenantId: id,
        organizationId: id,
        executionId: id,
        scope: { tenantId: id, organizationId: id, userId: id, assistantId: id, conversationId: id, threadId: id },
        action: 'send' as const,
        status: 'waiting' as const
    })
    const builder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => [row])
    }
    const tasks = { createQueryBuilder: () => builder, update: jest.fn(async () => ({ affected: 1 })) }
    const executions = {
        findOneBy: jest
            .fn()
            .mockResolvedValueOnce({ status: XpertAgentExecutionStatusEnum.RUNNING })
            .mockResolvedValueOnce({ status: XpertAgentExecutionStatusEnum.SUCCESS })
    }
    const service = new VoiceTaskService(
        tasks as unknown as Repository<RealtimeVoiceTask>,
        {} as HandoffQueueService,
        {} as CommandBus,
        {} as VoiceSessionService,
        executions as unknown as Repository<XpertAgentExecution>,
        { findOne: jest.fn(async () => ({ content: 'Confirmed result' })) } as unknown as Repository<ChatMessage>
    )
    expect(await service.list(row.scope)).toEqual([expect.objectContaining({ status: 'running' })])
    expect(await service.list(row.scope)).toEqual([
        expect.objectContaining({ status: 'completed', text: 'Confirmed result' })
    ])
})
