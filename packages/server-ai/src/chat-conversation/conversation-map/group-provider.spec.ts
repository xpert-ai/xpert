import { CommandBus } from '@nestjs/cqrs'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ConversationMapViewProvider } from './provider'
import { ConversationMapService } from './service'
import { ReadGroupMapCommand } from '../../chat-group/commands/read-group-map.command'
import { ReadGroupMapHandler } from '../../chat-group/commands/handlers/read-group-map.handler'
import { ChatGroupModule } from '../../chat-group/chat-group.module'
import { MODULE_METADATA } from '@nestjs/common/constants'

const context: XpertResolvedViewHostContext = {
    hostType: 'agent',
    hostId: 'assistant',
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'user',
    slots: [],
    runtimeScope: {
        conversationId: 'runtime',
        projectId: null,
        dataScopeKey: 'assistant',
        workspaceFiles: { catalog: 'xperts', scopeId: 'assistant' }
    }
}
function fixture() {
    const group = {
        groupId: 'public-group',
        threadId: 'public-thread',
        title: 'Meeting',
        revision: 1,
        members: [],
        messages: [],
        nextBefore: null
    }
    const map = Object.assign(Object.create(ConversationMapService.prototype), {
        read: jest.fn().mockResolvedValue({
            nodes: [],
            nextOffset: null,
            projectId: null,
            projectTitle: 'Project',
            assistantId: 'assistant',
            total: 0
        }),
        trail: jest.fn(),
        act: jest.fn(),
        options: jest.fn()
    })
    const commands = Object.assign(Object.create(CommandBus.prototype), { execute: jest.fn().mockResolvedValue(group) })
    return { group, map, commands, provider: new ConversationMapViewProvider(map, commands) }
}
it('reads public group messages through the owning CQRS handler without querying private conversations', async () => {
    const f = fixture()
    expect(await f.provider.getViewData(context, 'topics', {})).toMatchObject({
        item: {
            scope: { kind: 'group', id: f.group.groupId },
            currentConversationId: f.group.groupId,
            nodes: [{ kind: 'conversation' }],
            edges: [{ kind: 'contains' }],
            pageInfo: { next: null }
        }
    })
    expect(f.commands.execute.mock.calls[0][0]).toBeInstanceOf(ReadGroupMapCommand)
    expect(f.map.read).not.toHaveBeenCalled()
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ChatGroupModule)).toContain(ReadGroupMapHandler)
})
it.each(['trail', 'options', 'projects'])('rejects private-map operation %s in group context', async (operation) => {
    const f = fixture()
    await expect(f.provider.getViewData(context, 'topics', { parameters: { operation } })).rejects.toThrow()
    expect(f.map.trail).not.toHaveBeenCalled()
    expect(f.map.options).not.toHaveBeenCalled()
})
it('keeps group views read-only even when actions are invoked directly', async () => {
    const f = fixture()
    await expect(
        f.provider.executeViewAction(context, 'topics', 'act', {
            input: { type: 'rename', conversationId: 'private', title: 'changed' }
        })
    ).rejects.toThrow()
    expect(f.map.act).not.toHaveBeenCalled()
})
it('retains ordinary conversation behavior when no group audience is resolved', async () => {
    const f = fixture()
    f.commands.execute.mockResolvedValue(null)
    await f.provider.getViewData(context, 'topics', {})
    expect(f.map.read).toHaveBeenCalledTimes(1)
})
