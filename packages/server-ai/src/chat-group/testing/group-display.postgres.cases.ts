import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { CommandBus } from '@nestjs/cqrs'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import type { AgentChatDispatchPayload } from '@xpert-ai/plugin-sdk'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { GroupMessageRecipient, GroupParticipant } from '../group.entity'
import { GroupMessagesService } from '../group-messages.service'
import { GroupRuntimeService } from '../group-runtime.service'
import { GroupToolsService } from '../group-tools.service'
import { GroupResourceToolsService } from '../group-resource-tools.service'
import { ProjectGroupDisplayHandler } from '../commands/handlers/project-group-display.handler'
import { ProjectGroupDisplayCommand } from '../commands/project-group-display.command'

type Fixture = {
    db: DataSource
    messages: GroupMessagesService
    runtime: GroupRuntimeService
    tools: GroupToolsService
    group: ChatConversation
    c: GroupParticipant
    resources: GroupResourceToolsService
    prepare: (receipt: GroupMessageRecipient) => Promise<AgentChatDispatchPayload | null>
}
const app = {
    id: 'app',
    type: 'component',
    data: {
        type: 'McpApp',
        appInstanceToken: 'private-token',
        toolResult: { content: [{ type: 'text', text: 'Inventory: 42' }] }
    }
}

export function groupDisplayCases(fixture: () => Fixture) {
    async function start(content: ChatMessage['content'] = [app]) {
        const f = fixture()
        const question = await f.messages.send(f.group.id, {
            intent: 'request',
            recipientIds: [f.c.id],
            text: 'Analyze',
            clientMessageId: randomUUID()
        })
        const repo = f.db.getRepository(GroupMessageRecipient)
        const delivery = await repo.findOneByOrFail({ messageId: question.id, participantId: f.c.id })
        await f.prepare(delivery)
        const receipt = await repo.findOneByOrFail({ id: delivery.id })
        const output = await f.db.getRepository(ChatMessage).save({
            tenantId: f.group.tenantId,
            organizationId: f.group.organizationId,
            conversationId: f.c.runtimeConversationId,
            executionId: receipt.executionId,
            role: 'ai',
            content
        })
        const commands = { execute: jest.fn().mockResolvedValue(false) }
        const projector = new ProjectGroupDisplayHandler(
            f.db.getRepository(GroupMessageRecipient),
            f.db.getRepository(GroupParticipant),
            f.db.getRepository(ChatMessage),
            f.db.getRepository(ChatConversationThread),
            f.db.getRepository(ChatConversation),
            f.messages,
            commands as unknown as CommandBus,
            f.resources
        )
        const project = () =>
            projector.execute(
                new ProjectGroupDisplayCommand(
                    f.group.tenantId,
                    f.group.organizationId,
                    receipt.id,
                    output.id,
                    output.content
                )
            )
        const finish = async () => {
            await f.db
                .getRepository(XpertAgentExecution)
                .update({ id: receipt.executionId }, { status: XpertAgentExecutionStatusEnum.SUCCESS })
            await f.db
                .getRepository(ChatConversationThread)
                .update({ threadId: f.c.runtimeThreadId }, { status: 'idle', runControl: null })
            await f.runtime.finish(receipt.id)
        }
        return { ...f, question, repo, receipt, output, commands, projector, project, finish }
    }
    it('persists a display with no browser or final text and reuses its row across live/recovery/history', async () => {
        const f = await start()
        await f.project()
        const live = await f.messages.snapshot(f.group.id)
        const row = live.messages.find((m) => m.display?.length)
        expect(row).toMatchObject({
            text: '',
            communication: { intent: 'message', recipientIds: [], causedByMessageId: f.question.id }
        })
        expect(row.deliveries).toEqual([])
        expect((await f.repo.findOneByOrFail({ id: f.receipt.id })).replyMessageId).toBeNull()
        await Promise.all([f.project(), f.project()])
        expect((await f.messages.snapshot(f.group.id)).revision).toBe(live.revision)
        await f.finish()
        await f.runtime.finish(f.receipt.id)
        const history = await f.messages.snapshot(f.group.id)
        expect(history.messages).toHaveLength(2)
        expect(history.messages.find((m) => m.display?.length)).toEqual(row)
        expect(JSON.stringify(history)).not.toContain('private-token')
    })
    it('keeps display results when a final tool reply suppresses only duplicate final text', async () => {
        const f = await start([{ type: 'text', text: 'Repeated final' }, app])
        const tool = f.tools.create(f.receipt, f.c)
        await tool.invoke({
            type: 'tool_call',
            id: 'final',
            name: tool.name,
            args: { intent: 'reply', replyStage: 'final', replyToMessageId: f.question.id, text: 'Formal answer' }
        })
        await f.finish()
        const snapshot = await f.messages.snapshot(f.group.id)
        expect(snapshot.messages.map((m) => m.text)).toEqual(['Analyze', 'Formal answer', ''])
        expect(snapshot.messages.at(-1).display).toHaveLength(1)
    })
    it('defers protected analysis, rejects unrelated outputs and rechecks revoked delivery', async () => {
        const f = await start()
        f.commands.execute.mockResolvedValue(true)
        await f.project()
        expect((await f.messages.snapshot(f.group.id)).messages).toHaveLength(1)
        f.commands.execute.mockResolvedValue(false)
        await f.projector.execute(
            new ProjectGroupDisplayCommand(f.group.tenantId, f.group.organizationId, f.receipt.id, randomUUID(), [app])
        )
        expect((await f.messages.snapshot(f.group.id)).messages).toHaveLength(1)
        const denial = jest
            .spyOn(f.resources, 'validateAnalysisDelivery')
            .mockRejectedValueOnce(Object.assign(new Error('denied'), { getStatus: () => 403 }))
        await f.finish()
        expect((await f.messages.snapshot(f.group.id)).messages).toHaveLength(1)
        denial.mockRestore()
    })
}
