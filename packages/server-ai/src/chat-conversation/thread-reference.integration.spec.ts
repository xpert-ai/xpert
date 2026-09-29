import type { RedisClientType } from 'redis'
import { ThreadCursorStore } from './thread-cursor.store'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { IAgentMiddlewareContext, ModelRequest } from '@xpert-ai/plugin-sdk'
import { DataSource, EntitySchema } from 'typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { ThreadReferenceMiddleware } from '../xpert-middleware/thread-reference.middleware'
import { ToolNode } from '../xpert-agent/commands/handlers/tool_node'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatConversationService } from './conversation.service'
import { ChatConversationThreadService } from './conversation-thread.service'
import { readThreadSchema } from './thread-reference.contract'
import { ThreadReferenceService } from './thread-reference.service'

jest.mock('../ai/public-xpert-principal', () => ({ assertPublicXpertSessionConversationAccess: jest.fn() }))

const integration = process.env.THREAD_REFERENCE_TEST_DATABASE_URL ? describe : describe.skip
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const reference = { type: 'thread' as const, conversationId: id(200), threadId: id(201), label: 'Source' }
const scope = {
    tenantId: id(900),
    organizationId: id(901),
    userId: id(902),
    conversationId: id(100),
    threadId: id(101)
}

// The service uses the actual TypeORM tree repository and SQL, in an isolated test schema.
const schema = new EntitySchema<ChatMessage>({
    name: 'ThreadReferenceTestMessage',
    target: ChatMessage,
    tableName: 'chat_message',
    columns: {
        id: { type: 'uuid', primary: true },
        parentId: { type: 'uuid', nullable: true },
        conversationId: { type: 'uuid' },
        role: { type: 'varchar' },
        content: { type: 'json', nullable: true },
        references: { type: 'json', nullable: true },
        events: { type: 'json', nullable: true },
        status: { type: 'varchar', nullable: true },
        followUpStatus: { type: 'varchar', nullable: true },
        createdAt: { type: 'timestamptz', createDate: true },
        deletedAt: { type: 'timestamptz', deleteDate: true, nullable: true }
    },
    trees: [{ type: 'closure-table' }],
    relations: {
        parent: { type: 'many-to-one', target: 'ChatMessage', treeParent: true, joinColumn: { name: 'parentId' } },
        children: { type: 'one-to-many', target: 'ChatMessage', treeChildren: true, inverseSide: 'parent' }
    }
})

integration('referenced history through Middleware, ToolNode, TypeORM and PostgreSQL', () => {
    const schemaName = `thread_reference_test_${process.pid}_${Date.now()}`
    let database: DataSource
    let reader: ThreadReferenceService
    let cursors: ThreadCursorStore
    let threads: Map<string, ChatConversationThread>
    let access: jest.Mock<Promise<ChatConversation>, [string]>

    beforeAll(async () => {
        const url = process.env.THREAD_REFERENCE_TEST_DATABASE_URL!
        if (!new URL(url).pathname.endsWith('_test'))
            throw new Error('Use a disposable database whose name ends in _test')
        database = new DataSource({
            type: 'postgres',
            url,
            entities: [schema],
            schema: schemaName,
            extra: { options: `-c search_path=${schemaName}` }
        })
        await database.initialize()
        await database.query(`CREATE SCHEMA "${schemaName}"`)
        await database.synchronize()
    })
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
            await database.destroy()
        }
    })
    beforeEach(async () => {
        await database.query('TRUNCATE chat_message_closure, chat_message CASCADE')
        const repo = database.getTreeRepository(ChatMessage)
        const save = async (
            value: number,
            conversationId: string,
            role: 'human' | 'ai',
            parent?: ChatMessage,
            refs?: ChatMessage['references']
        ) =>
            repo.save(
                repo.create({
                    id: id(value),
                    conversationId,
                    role,
                    parent,
                    references: refs,
                    content: `text-${value}`,
                    status: XpertAgentExecutionStatusEnum.SUCCESS,
                    createdAt: new Date('2026-09-23T00:00:00Z')
                })
            )
        const sourceQuestion = await save(1, id(200), 'human')
        const sourceAnswer = await save(2, id(200), 'ai', sourceQuestion)
        const mainQuestion = await save(3, id(200), 'human', sourceAnswer)
        await save(4, id(200), 'ai', mainQuestion)
        const siblingQuestion = await save(5, id(200), 'human', sourceAnswer)
        await save(6, id(200), 'ai', siblingQuestion)
        const destQuestion = await save(11, id(100), 'human', undefined, [reference])
        await save(12, id(100), 'ai', destQuestion)
        const source = Object.assign(new ChatConversation(), {
            id: id(200),
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            createdById: scope.userId,
            title: 'Source'
        })
        const destination = Object.assign(new ChatConversation(), source, { id: id(100) })
        access = jest.fn(async (conversationId) => {
            if (conversationId === source.id) return source
            if (conversationId === destination.id) return destination
            throw new ForbiddenException()
        })
        threads = new Map([
            [
                id(101),
                Object.assign(new ChatConversationThread(), {
                    threadId: id(101),
                    conversationId: id(100),
                    headMessageId: id(12)
                })
            ],
            [
                id(201),
                Object.assign(new ChatConversationThread(), {
                    threadId: id(201),
                    conversationId: id(200),
                    headMessageId: id(4)
                })
            ]
        ])
        const entries = new Map<string, string>()
        cursors = new ThreadCursorStore({
            get: async (key: string) => entries.get(key) ?? null,
            set: async (key: string, value: string) => {
                entries.set(key, value)
                return 'OK'
            }
        } as unknown as Pick<RedisClientType, 'get' | 'set'>)
        reader = new ThreadReferenceService(
            { assertAccess: access } as unknown as ChatConversationService,
            {
                findByThreadId: async (threadId: string) => threads.get(threadId) ?? null
            } as ChatConversationThreadService,
            repo,
            {} as QueryBus,
            cursors
        )
    })

    it('activates from persisted references and reads through the real tool executor after a reload', async () => {
        const middleware = new ThreadReferenceMiddleware(reader).createMiddleware({}, scope as IAgentMiddlewareContext)
        const request: ModelRequest = {
            model: RunnableLambda.from(async () => new AIMessage('')),
            tools: middleware.tools!,
            state: { messages: [], human: { input: 'Follow up' } },
            messages: [new HumanMessage('Follow up')],
            runtime: {}
        }
        const handler = jest.fn(async (_next: ModelRequest) => new AIMessage(''))
        await middleware.wrapModelCall!(request, handler)
        expect(handler.mock.calls[0][0].tools.map((tool) => tool.name)).toContain('read_thread')
        const node = new ToolNode<{ messages: ToolMessage[]; human: { input: string } }>(middleware.tools!, {
            toolName: 'Read history',
            handleToolErrors: false
        })
        const result = await node.invoke({
            human: { input: 'Follow up' },
            messages: [],
            toolCall: {
                id: 'call-1',
                name: 'read_thread',
                args: { threadId: id(201) }
            }
        } as Parameters<typeof node.invoke>[0])
        expect(result.messages[0].tool_call_id).toBe('call-1')
        const output = String(result.messages[0].content)
        expect(output).toContain('text-3')
        expect(output).toContain('text-4')
        expect(output).not.toContain('text-5')
        expect(output).not.toContain('text-6')
    })

    it('continues older pages without duplicates while the source receives new messages', async () => {
        const first = await reader.read(scope, undefined, readThreadSchema.parse({ threadId: id(201) }))
        const repo = database.getTreeRepository(ChatMessage)
        const parent = await repo.findOneByOrFail({ id: id(4) })
        await repo.save(
            repo.create({ id: id(7), conversationId: id(200), role: 'human', parent, content: 'New question' })
        )
        threads.get(id(201))!.headMessageId = id(7)
        const second = await reader.read(
            scope,
            undefined,
            readThreadSchema.parse({ threadId: id(201), cursor: first.page.nextCursor })
        )
        expect(first.turns.flatMap((turn) => turn.messages.map((m) => m.id))).toEqual([id(3), id(4)])
        expect(second.turns.flatMap((turn) => turn.messages.map((m) => m.id))).toEqual([id(1), id(2)])
        expect(second.page.hasMore).toBe(false)
    })

    it.each([
        { head: id(6), next: id(5) },
        { head: id(4), next: id(5) }
    ])('rejects a cursor pointing into an unreferenced sibling branch: %j', async (anchor) => {
        const cursor = await cursors.issue(scope, reference, anchor)
        await expect(
            reader.read(scope, undefined, readThreadSchema.parse({ threadId: id(201), cursor }))
        ).rejects.toThrow()
    })

    it('does not activate from a reference that exists only on another destination branch or pending input', async () => {
        const repo = database.getTreeRepository(ChatMessage)
        const root = await repo.save(
            repo.create({ id: id(13), conversationId: id(100), role: 'human', content: 'Unrelated' })
        )
        threads.get(id(101))!.headMessageId = root.id
        expect(await reader.references(scope, undefined)).toEqual([])
        root.references = [reference]
        root.followUpStatus = 'pending'
        await repo.save(root)
        expect(await reader.references(scope, undefined)).toEqual([])
        root.followUpStatus = 'consumed'
        await repo.save(root)
        expect(await reader.references(scope, undefined)).toEqual([reference])
    })

    it('traverses a deleted cursor parent without exposing its content and rechecks revoked access', async () => {
        const first = await reader.read(scope, undefined, readThreadSchema.parse({ threadId: id(201) }))
        await database.getRepository(ChatMessage).softDelete(id(2))
        const second = await reader.read(
            scope,
            undefined,
            readThreadSchema.parse({ threadId: id(201), cursor: first.page.nextCursor })
        )
        expect(second.turns.flatMap((turn) => turn.messages.map((m) => m.id))).toEqual([id(1)])
        access.mockRejectedValue(new ForbiddenException())
        await expect(reader.read(scope, undefined, readThreadSchema.parse({ threadId: id(201) }))).rejects.toThrow()
    })

    it('ignores malformed historical reference JSON instead of breaking unrelated agent runs', async () => {
        await database.query('UPDATE chat_message SET "references" = $1::json WHERE id = $2', [
            JSON.stringify({ type: 'thread' }),
            id(11)
        ])
        expect(await reader.references(scope, undefined)).toEqual([])
    })

    it('does not authorize a cursor after the selected branch has moved to a sibling or its head was deleted', async () => {
        const first = await reader.read(scope, undefined, readThreadSchema.parse({ threadId: id(201) }))
        threads.get(id(201))!.headMessageId = id(6)
        await expect(
            reader.read(scope, undefined, readThreadSchema.parse({ threadId: id(201), cursor: first.page.nextCursor }))
        ).rejects.toThrow()
        threads.get(id(201))!.headMessageId = id(4)
        await database.getRepository(ChatMessage).softDelete(id(4))
        await expect(
            reader.read(scope, undefined, readThreadSchema.parse({ threadId: id(201), cursor: first.page.nextCursor }))
        ).rejects.toThrow()
    })
})
