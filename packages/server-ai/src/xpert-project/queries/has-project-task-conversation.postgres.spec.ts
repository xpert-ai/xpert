jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, Table } from 'typeorm'
import { coreEntities } from '../../../../server/src/core/entities'
import { ALL_AI_ENTITIES } from '../../core/entities'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import {
    HasProjectTaskConversationHandler,
    HasProjectTaskConversationQuery
} from './has-project-task-conversation.query'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('Project task conversation navigation proof (PostgreSQL)', () => {
    let db: DataSource
    let handler: HasProjectTaskConversationHandler
    let query: HasProjectTaskConversationQuery
    let scope: { tenantId: string; organizationId: string }
    let taskId: string, attemptId: string, executionId: string, messageId: string
    const assertCanReadXpert = jest.fn()
    const access = Object.assign(Object.create(XpertProjectAccessService.prototype), { assertCanReadXpert })
    const schema = `navigation_${randomUUID().replace(/-/g, '')}`

    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_pipeline_test_'))
            throw new Error('Dedicated pipeline test database required')
        db = new DataSource({
            type: 'postgres',
            url,
            schema,
            entities: [...coreEntities, ...ALL_AI_ENTITIES],
            uuidExtension: 'pgcrypto',
            extra: { options: `-c search_path=${schema},public` }
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        const runner = db.createQueryRunner()
        for (const entity of [
            XpertProjectTask,
            XpertProjectTaskExecution,
            ChatConversation,
            XpertAgentExecution,
            ChatMessage
        ]) {
            await runner.createTable(Table.create(db.getMetadata(entity), db.driver))
        }
        await runner.release()
        handler = new HasProjectTaskConversationHandler(db.getRepository(XpertProjectTaskExecution), access)
    }, 30_000)

    beforeEach(async () => {
        jest.restoreAllMocks()
        assertCanReadXpert.mockReset().mockResolvedValue({})
        scope = { tenantId: randomUUID(), organizationId: randomUUID() }
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(randomUUID())
        query = new HasProjectTaskConversationQuery(randomUUID(), randomUUID(), randomUUID(), randomUUID())
        taskId = randomUUID()
        attemptId = randomUUID()
        executionId = randomUUID()
        messageId = randomUUID()
        await db
            .getRepository(XpertProjectTask)
            .insert({ id: taskId, ...scope, projectId: query.projectId, title: 'Neutral task' })
        await db.getRepository(ChatConversation).insert({
            id: query.conversationId,
            ...scope,
            projectId: query.projectId,
            xpertId: query.targetXpertId,
            threadId: randomUUID()
        })
        await db.getRepository(XpertAgentExecution).insert({ id: executionId, ...scope, xpertId: query.targetXpertId })
        await db
            .getRepository(ChatMessage)
            .insert({ id: messageId, ...scope, conversationId: query.conversationId, executionId, role: 'ai' })
        await db.getRepository(XpertProjectTaskExecution).insert({
            id: attemptId,
            taskId,
            ...scope,
            projectId: query.projectId,
            conversationId: query.conversationId,
            agentExecutionId: executionId,
            xpertId: query.targetXpertId
        })
    })

    afterAll(async () => {
        jest.restoreAllMocks()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })

    it('resolves through the injected CQRS handler and checks both current bindings', async () => {
        const module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                HasProjectTaskConversationHandler,
                {
                    provide: getRepositoryToken(XpertProjectTaskExecution),
                    useValue: db.getRepository(XpertProjectTaskExecution)
                },
                { provide: XpertProjectAccessService, useValue: access }
            ]
        }).compile()
        try {
            await module.init()
            await expect(module.get(QueryBus).execute(query)).resolves.toBe(true)
            expect(assertCanReadXpert).toHaveBeenCalledWith(query.projectId, query.requesterXpertId)
            expect(assertCanReadXpert).toHaveBeenCalledWith(query.projectId, query.targetXpertId)
        } finally {
            await module.close()
        }
    })

    it.each(['tenantId', 'organizationId'] as const)('rejects a different authenticated %s', async (field) => {
        jest.spyOn(RequestContext, field === 'tenantId' ? 'currentTenantId' : 'getOrganizationId').mockReturnValue(
            randomUUID()
        )
        await expect(handler.execute(query)).resolves.toBe(false)
    })

    it('requires an authenticated actor', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
        await expect(handler.execute(query)).resolves.toBe(false)
        expect(assertCanReadXpert).not.toHaveBeenCalled()
    })

    it('does not treat an existing receipt as permission after membership or binding revocation', async () => {
        assertCanReadXpert.mockRejectedValue(new ForbiddenException())
        await expect(handler.execute(query)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it.each([
        ['task tenant', XpertProjectTask, 'tenantId'],
        ['task organization', XpertProjectTask, 'organizationId'],
        ['task project', XpertProjectTask, 'projectId'],
        ['conversation project', ChatConversation, 'projectId'],
        ['conversation tenant', ChatConversation, 'tenantId'],
        ['conversation organization', ChatConversation, 'organizationId'],
        ['execution tenant', XpertAgentExecution, 'tenantId'],
        ['execution organization', XpertAgentExecution, 'organizationId'],
        ['execution Assistant', XpertAgentExecution, 'xpertId'],
        ['message tenant', ChatMessage, 'tenantId'],
        ['message organization', ChatMessage, 'organizationId'],
        ['message conversation', ChatMessage, 'conversationId'],
        ['message execution', ChatMessage, 'executionId'],
        ['attempt Assistant', XpertProjectTaskExecution, 'xpertId'],
        ['attempt project', XpertProjectTaskExecution, 'projectId']
    ] as const)('rejects mismatched %s', async (_name, entity, field) => {
        const id =
            entity === XpertProjectTask
                ? taskId
                : entity === ChatConversation
                  ? query.conversationId
                  : entity === XpertAgentExecution
                    ? executionId
                    : entity === ChatMessage
                      ? messageId
                      : attemptId
        const table = db.getMetadata(entity).tablePath
        await db.query(`UPDATE ${table} SET "${field}" = $1 WHERE id = $2`, [randomUUID(), id])
        await expect(handler.execute(query)).resolves.toBe(false)
    })

    it.each([XpertProjectTask, XpertProjectTaskExecution, ChatMessage])(
        'excludes soft-deleted %s evidence',
        async (entity) => {
            const id = entity === XpertProjectTask ? taskId : entity === ChatMessage ? messageId : attemptId
            await db.query(`UPDATE ${db.getMetadata(entity).tablePath} SET "deletedAt" = NOW() WHERE id = $1`, [id])
            await expect(handler.execute(query)).resolves.toBe(false)
        }
    )

    it('rejects a linked task without a native execution message', async () => {
        await db.getRepository(ChatMessage).delete(messageId)
        await expect(handler.execute(query)).resolves.toBe(false)
    })
})
