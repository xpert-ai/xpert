import type { RedisClientType } from 'redis'
import { ThreadCursorStore } from './thread-cursor.store'
import { QueryBus } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { ChatConversationService } from './conversation.service'
import { ChatConversationThreadService } from './conversation-thread.service'
import { ThreadReferenceService } from './thread-reference.service'
import { readThreadSchema } from './thread-reference.contract'
import { assertPublicXpertSessionConversationAccess } from '../ai/public-xpert-principal'

jest.mock('../ai/public-xpert-principal', () => ({ assertPublicXpertSessionConversationAccess: jest.fn() }))

const a = '00000000-0000-4000-8000-000000000001'
const b = '00000000-0000-4000-8000-000000000002'
const c = '00000000-0000-4000-8000-000000000003'
const scope = {
    conversationId: 'destination',
    threadId: 'current',
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'user'
}
const reference = { type: 'thread', conversationId: 'source', threadId: 'referenced', label: 'Title' }
const human = { references: [reference] }

function setup() {
    const source = {
        id: 'source',
        title: 'Canonical title',
        tenantId: 'tenant',
        organizationId: 'org',
        createdById: 'user'
    }
    const destination = { ...source, id: 'destination' }
    const access = jest.fn(async (id: string) => (id === 'source' ? source : destination))
    const findThread = jest.fn(async (id: string) => ({
        threadId: id,
        conversationId: id === 'current' ? 'destination' : 'source',
        headMessageId: a,
        status: 'idle'
    }))
    const query = {
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getExists: jest.fn().mockResolvedValue(true),
        withDeleted: jest.fn().mockReturnThis()
    }
    const repository = {
        create: jest.fn((value) => value),
        manager: { getTreeRepository: () => ({ createAncestorsQueryBuilder: jest.fn(() => query) }) },
        query: jest.fn().mockResolvedValue([
            { id: a, parentId: b },
            { id: b, parentId: c }
        ]),
        find: jest.fn().mockResolvedValue([
            { id: b, role: 'human', content: 'Question' },
            { id: a, role: 'ai', status: 'success', content: 'Answer' }
        ])
    }
    const entries = new Map<string, string>()
    const redis = {
        get: jest.fn(async (key: string) => entries.get(key) ?? null),
        set: jest.fn(async (key: string, value: string) => {
            entries.set(key, value)
            return 'OK'
        })
    }
    const cursors = new ThreadCursorStore(redis as unknown as Pick<RedisClientType, 'get' | 'set'>)
    const reader = new ThreadReferenceService(
        { assertAccess: access } as unknown as ChatConversationService,
        { findByThreadId: findThread } as unknown as ChatConversationThreadService,
        repository as unknown as Repository<ChatMessage>,
        {} as QueryBus,
        cursors
    )
    return { reader, source, destination, access, findThread, query, repository, cursors, redis }
}

describe('ThreadReferenceService', () => {
    beforeEach(() => jest.mocked(assertPublicXpertSessionConversationAccess).mockReset())

    it('combines current input with earlier visible references, excluding self and duplicate locators', async () => {
        const { reader, query } = setup()
        query.getMany.mockResolvedValue([{ references: [reference] }])
        expect(
            await reader.references(scope, { references: [reference, { ...reference, threadId: 'current' }] })
        ).toEqual([reference])
        expect(await reader.references(scope, undefined)).toEqual([reference])
        expect(query.andWhere).toHaveBeenCalledWith(
            "(message.followUpStatus IS NULL OR message.followUpStatus = 'consumed')"
        )
    })

    it('reads only an allowlisted pair and projects parent-chain order with an older-page cursor', async () => {
        const { reader, repository, access, cursors } = setup()
        const result = await reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced' }))
        expect(result.turns[0].messages.map((m) => m.text)).toEqual(['Question', 'Answer'])
        expect(result.page.nextCursor).toMatch(/^tr_[A-Za-z0-9_-]{16}$/)
        expect(await cursors.resolve(result.page.nextCursor!, scope, reference)).toEqual({ head: a, next: c })
        expect(repository.query).toHaveBeenCalledWith(expect.stringContaining('WITH RECURSIVE path'), [
            a,
            'source',
            500,
            1
        ])
        expect(repository.find.mock.calls[0][0].select).not.toHaveProperty('events')
        expect(access).toHaveBeenCalledWith('source')
        expect(assertPublicXpertSessionConversationAccess).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'source' }),
            expect.anything()
        )
    })

    it('continues from the captured head and rejects forged or detached cursors', async () => {
        const { reader, repository, query, cursors } = setup()
        const cursor = await cursors.issue(scope, reference, { head: a, next: c })
        await reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced', cursor }))
        expect(repository.query).toHaveBeenLastCalledWith(expect.any(String), [c, 'source', 500, 1])
        expect(query.withDeleted).toHaveBeenCalledTimes(1)
        query.getExists.mockResolvedValue(false)
        await expect(
            reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced', cursor }))
        ).rejects.toThrow()
        await expect(cursors.resolve(cursor, scope, { ...reference, threadId: 'other' })).rejects.toThrow()
    })

    it('blocks arbitrary IDs, mismatched branch ownership, and revoked access before fetching history', async () => {
        const { reader, repository, findThread, access } = setup()
        await expect(
            reader.read(scope, undefined, readThreadSchema.parse({ threadId: 'referenced' }))
        ).rejects.toThrow()
        findThread
            .mockResolvedValueOnce({
                threadId: 'current',
                conversationId: 'destination',
                headMessageId: a,
                status: 'idle'
            })
            .mockResolvedValueOnce({
                threadId: 'referenced',
                conversationId: 'unrelated',
                headMessageId: a,
                status: 'idle'
            })
        await expect(reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced' }))).rejects.toThrow()
        access.mockRejectedValue(new Error('Access revoked'))
        await expect(reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced' }))).rejects.toThrow(
            'Access revoked'
        )
        expect(repository.query).not.toHaveBeenCalled()
    })

    it('rechecks revoked source access before resolving an existing handle', async () => {
        const { reader, access, repository, cursors, redis } = setup()
        const cursor = await cursors.issue(scope, reference, { head: a, next: c })
        access.mockImplementation(async (id) => {
            if (id === 'source') throw new Error('Access revoked')
            return {
                id,
                title: '',
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                createdById: scope.userId
            }
        })
        await expect(
            reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced', cursor }))
        ).rejects.toThrow('Access revoked')
        expect(redis.get).not.toHaveBeenCalled()
        expect(repository.query).not.toHaveBeenCalled()
    })

    it('checks tenant, organization, Assistant family and destination audience independently', async () => {
        const { reader, source, destination, repository } = setup()
        source.organizationId = 'other'
        await expect(reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced' }))).rejects.toThrow()
        source.organizationId = 'org'
        Object.assign(destination, { projectId: 'shared-project' })
        await expect(reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced' }))).rejects.toThrow()
        Object.assign(source, { projectId: 'shared-project' })
        jest.mocked(assertPublicXpertSessionConversationAccess).mockRejectedValue(new Error('Assistant family denied'))
        await expect(reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced' }))).rejects.toThrow(
            'Assistant family denied'
        )
        expect(repository.query).not.toHaveBeenCalled()
    })

    it('bounds the protocol and rejects ambiguous locator pairs', async () => {
        const { reader } = setup()
        expect(() => readThreadSchema.parse({ threadId: 't', turnLimit: 11 })).toThrow()
        expect(() => readThreadSchema.parse({ threadId: 't', organizationId: 'forged' })).toThrow()
        await expect(
            reader.references(scope, { references: [reference, { ...reference, conversationId: 'other' }] })
        ).rejects.toThrow()
        expect(await reader.references({ ...scope, conversationId: undefined }, undefined)).toEqual([])
    })

    it.each([
        { destinationProject: 'p', sourceProject: 'p', destinationOwner: 'user', sourceOwner: 'other', allowed: true },
        { destinationProject: 'p', sourceProject: 'q', destinationOwner: 'user', sourceOwner: 'user', allowed: false },
        {
            destinationProject: 'p',
            sourceProject: undefined,
            destinationOwner: 'user',
            sourceOwner: 'user',
            allowed: false
        },
        {
            destinationProject: undefined,
            sourceProject: 'p',
            destinationOwner: 'user',
            sourceOwner: 'other',
            allowed: true
        },
        {
            destinationProject: undefined,
            sourceProject: undefined,
            destinationOwner: 'technical',
            sourceOwner: 'technical',
            allowed: true
        },
        {
            destinationProject: undefined,
            sourceProject: undefined,
            destinationOwner: 'technical',
            sourceOwner: 'user',
            allowed: false
        },
        {
            destinationProject: undefined,
            sourceProject: 'p',
            destinationOwner: 'technical',
            sourceOwner: 'technical',
            allowed: false
        }
    ])('preserves destination audience: %j', async (scenario) => {
        const { reader, source, destination } = setup()
        Object.assign(source, {
            projectId: scenario.sourceProject,
            createdById: scenario.sourceOwner,
            xpertId: 'assistant'
        })
        Object.assign(destination, {
            projectId: scenario.destinationProject,
            createdById: scenario.destinationOwner,
            xpertId: 'assistant'
        })
        const result = reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced' }))
        if (scenario.allowed) await expect(result).resolves.toHaveProperty('turns')
        else await expect(result).rejects.toThrow()
    })

    it('rejects cross-tenant sources and caps historical and distinct references', async () => {
        const { reader, source, query } = setup()
        source.tenantId = 'other-tenant'
        await expect(reader.read(scope, human, readThreadSchema.parse({ threadId: 'referenced' }))).rejects.toThrow()
        source.tenantId = 'tenant'
        await expect(
            reader.references(scope, {
                references: Array.from({ length: 51 }, (_, index) => ({ ...reference, threadId: `t-${index}` }))
            })
        ).rejects.toThrow()
        query.getMany.mockResolvedValue(Array.from({ length: 101 }, () => ({ references: [reference] })))
        await expect(reader.references(scope, undefined)).rejects.toThrow()
    })
})
