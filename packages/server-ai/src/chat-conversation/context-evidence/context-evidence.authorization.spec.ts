// Exercise the real conversation ACL and credential audience before the storage seam.
jest.mock('@xpert-ai/server-core', () => ({
    TenantOrganizationBaseEntity: class {},
    TenantOrganizationAwareCrudService: class {
        findOneInOrganizationOrTenant() {
            return Promise.resolve(null)
        }
    },
    AssertUserXpertGrantQuery: class {}
}))
jest.mock('../../chat-message/chat-message.service', () => ({ ChatMessageService: class {} }))
jest.mock('../../copilot-store', () => ({ CreateCopilotStoreCommand: class {} }))
jest.mock('../../xpert-agent-execution/queries', () => ({
    FindAgentExecutionsQuery: class {},
    XpertAgentExecutionStateQuery: class {}
}))
jest.mock('../../xpert-project/services/project-access.service', () => ({ XpertProjectAccessService: class {} }))
jest.mock('../conversation.entity', () => ({ ChatConversation: class {} }))
jest.mock('../dto', () => ({ ChatConversationPublicDTO: class {} }))
jest.mock('../conversation-thread.service', () => ({ ChatConversationThreadService: class {} }))

import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { ForbiddenException } from '@nestjs/common'
import { IAgentMiddlewareContext, RequestContext } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationService } from '../conversation.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { ContextEvidenceService } from './context-evidence.service'
import { EvidenceRecord, readContextEvidenceSchema } from './context-evidence.schema'
import { ContextCompressionMiddleware } from '../../xpert-middleware/context-compression.middleware'
import { messagesStateReducer } from '@langchain/langgraph'

afterEach(() => jest.restoreAllMocks())

function fixture() {
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
    const conversation = Object.assign(new ChatConversation(), {
        id: 'conversation-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        xpertId: 'assistant-1'
    })
    const projectAccess = { assertCanRead: jest.fn().mockResolvedValue({ role: 'member' }) }
    const conversations = new ChatConversationService(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        projectAccess as unknown as XpertProjectAccessService,
        null
    )
    jest.spyOn(conversations, 'findOneInOrganizationOrTenant').mockImplementation(async () => conversation)
    const rows = new Map<string, EvidenceRecord>()
    const storage = {
        put: jest.fn(async (_scope: unknown, records: EvidenceRecord[]) => {
            records.forEach((record) => rows.set(record.evidenceId, record))
        }),
        get: jest.fn(async (_scope: unknown, ids: string[]) =>
            ids.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : []))
        )
    }
    const queryBus = { execute: jest.fn() }
    const evidence = new ContextEvidenceService(
        storage,
        conversations,
        { findByThreadId: jest.fn().mockResolvedValue({ conversationId: conversation.id }) },
        queryBus
    )
    const scope = {
        tenantId: conversation.tenantId,
        organizationId: conversation.organizationId,
        userId: 'user-1',
        conversationId: conversation.id,
        threadId: 'thread-1',
        agentKey: 'agent',
        xpertId: conversation.xpertId
    }
    const access = evidence.bind(scope)
    return { conversation, projectAccess, storage, access, queryBus, evidence, scope }
}

it('allows the actual private owner ACL, then denies after ownership changes', async () => {
    const f = fixture()
    const saved = await f.access.archive([new HumanMessage('Original evidence')])
    f.storage.get.mockClear()
    f.conversation.createdById = 'other-owner'
    await expect(f.access.read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId }))).rejects.toBeInstanceOf(
        ForbiddenException
    )
    expect(f.storage.get).not.toHaveBeenCalled()
})

it('allows a host-bound collaborator while rechecking the conversation owner and current access', async () => {
    const f = fixture()
    const collaborator = f.evidence.bind({
        ...f.scope,
        xpertId: 'collaborator',
        conversationXpertId: f.conversation.xpertId
    })
    const archive = await collaborator.archive([new HumanMessage('delegated evidence')])
    expect(
        await collaborator.read(
            readContextEvidenceSchema.parse({ archiveId: archive.archiveId, record: 0, part: 'content' })
        )
    ).toMatchObject({ text: 'delegated evidence' })
    await expect(
        f.evidence
            .bind({ ...f.scope, xpertId: 'collaborator' })
            .read(readContextEvidenceSchema.parse({ archiveId: archive.archiveId }))
    ).rejects.toThrow()
    f.conversation.createdById = 'revoked-owner'
    await expect(collaborator.read(readContextEvidenceSchema.parse({ archiveId: archive.archiveId }))).rejects.toThrow()
})

it('revalidates Project membership for each recovery read', async () => {
    const f = fixture()
    f.conversation.projectId = 'project-1'
    const saved = await f.access.archive([new HumanMessage('Project evidence')])
    expect(f.projectAccess.assertCanRead).toHaveBeenCalledWith('project-1')
    f.storage.get.mockClear()
    f.projectAccess.assertCanRead.mockRejectedValue(new ForbiddenException())
    await expect(f.access.read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId }))).rejects.toBeInstanceOf(
        ForbiddenException
    )
    expect(f.storage.get).not.toHaveBeenCalled()
})

it('does not let conversation ownership bypass a delegated credential audience', async () => {
    const f = fixture()
    const saved = await f.access.archive([new HumanMessage('Private evidence')])
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
        principalType: 'client_secret',
        clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
        resourceScope: { kind: 'assistant', xpertId: 'different-assistant' }
    } as ReturnType<typeof RequestContext.currentApiPrincipal>)
    f.queryBus.execute.mockResolvedValue(false)
    f.storage.get.mockClear()
    await expect(f.access.read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId }))).rejects.toBeInstanceOf(
        ForbiddenException
    )
    expect(f.storage.get).not.toHaveBeenCalled()
})

it('replaces checkpoint history and recovers original arguments through the registered tool and real ACL', async () => {
    const f = fixture()
    const snapshot =
        '<state_snapshot><active_user_constraints>Do not publish.</active_user_constraints><file_system_state>Edited, unverified; record 1.</file_system_state><current_plan>Verify before continuing.</current_plan></state_snapshot>'
    const context = {
        ...f.scope,
        tools: new Map(),
        runtime: { createModelClient: async () => ({ invoke: async () => new AIMessage(snapshot) }) }
    } as unknown as IAgentMiddlewareContext
    const middleware = await new ContextCompressionMiddleware(f.evidence).createMiddleware(
        { maxPromptTokens: 10000, targetPromptTokens: 7000 },
        context
    )
    middleware.tools?.forEach((tool) => context.tools.set(tool.name, tool))
    const before = typeof middleware.beforeModel === 'function' ? middleware.beforeModel : middleware.beforeModel?.hook
    if (!before) throw new Error('Missing compression hook')
    const args = { script: 'original historical script\n'.repeat(8000) }
    const messages = [
        new HumanMessage('Do not publish.'),
        new AIMessage({ content: '', tool_calls: [{ id: 'old', name: 'shell', args }] }),
        new ToolMessage({ content: 'edited; verification pending', tool_call_id: 'old' }),
        new AIMessage({ content: '', tool_calls: [{ id: 'new', name: 'read', args: { path: 'current' } }] }),
        new ToolMessage({ content: 'latest state', tool_call_id: 'new' })
    ]
    const update = await before({ messages }, { configurable: { copilotModel: { options: { context_size: 200000 } } } })
    if (!update || !Array.isArray(update.messages)) throw new Error('No checkpoint update')
    const replacements = update.messages.filter((message): message is BaseMessage => message instanceof BaseMessage)
    const retained = messagesStateReducer(messages, replacements)
    expect(JSON.stringify(retained)).not.toContain('original historical script')
    const archiveId = JSON.stringify(retained).match(/Archive ID: ([a-f0-9]{64})/)?.[1]
    if (!archiveId) throw new Error('No recovery reference')
    const reader = middleware.tools?.find((tool) => tool.name === 'read_context_evidence')
    if (!reader || !('invoke' in reader)) throw new Error('No recovery tool')
    const result = await reader.invoke({ archiveId, part: 'arguments', record: 1, limit: 100 })
    expect(result).toBe(
        JSON.stringify(
            await f.access.read(
                readContextEvidenceSchema.parse({ archiveId, part: 'arguments', record: 1, limit: 100 })
            )
        )
    )
    expect(result).toContain('original historical script')
})
