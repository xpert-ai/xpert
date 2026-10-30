import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { emptyCheckpoint, MemorySaver } from '@langchain/langgraph-checkpoint'
import { EntityManager, FindOperator, Repository } from 'typeorm'
import { ContextEvidenceService } from './context-evidence.service'
import { ContextEvidence } from './context-evidence.entity'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationThread } from '../conversation-thread.entity'
import { DatabaseContextEvidenceStorage } from './context-evidence.storage'
import { evidenceArchiveSchema, readContextEvidenceSchema } from './context-evidence.schema'
import { CopilotCheckpoint } from '../../copilot-checkpoint/copilot-checkpoint.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { copyBranchCheckpoints } from '../conversation-branch/branch-checkpoints'
import { contextRecoveryReference } from '../../xpert-middleware/context-evidence.tool'

jest.mock('@xpert-ai/server-core', () => ({ TenantOrganizationBaseEntity: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: { currentUserId: () => 'user' } }))
jest.mock('../conversation.service', () => ({ ChatConversationService: class {} }))
jest.mock('../conversation.entity', () => ({ ChatConversation: class {} }))
jest.mock('../conversation-thread.service', () => ({ ChatConversationThreadService: class {} }))
jest.mock('../../ai/public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: async () => undefined
}))

it.each(['complete', 'missing', 'corrupt'] as const)(
    'copies only verified archive dependencies and survives source deletion (%s)',
    async (sourceState) => {
        const evidenceRows: ContextEvidence[] = []
        const checkpointRows: CopilotCheckpoint[] = []
        let values: ContextEvidence[] = []
        const query = {
            insert: () => query,
            values: (rows: ContextEvidence[]) => {
                values = rows
                return query
            },
            orIgnore: () => query,
            execute: async () => {
                for (const row of values)
                    if (!evidenceRows.some((saved) => saved.evidenceId === row.evidenceId)) evidenceRows.push(row)
            }
        }
        const evidenceRepository = {
            createQueryBuilder: () => query,
            find: async ({
                where
            }: {
                where: {
                    tenantId: string
                    organizationId: string
                    conversationId: string
                    threadId: string
                    agentKey: string
                    evidenceId: FindOperator<string[]>
                }
            }) =>
                evidenceRows.filter(
                    (row) =>
                        row.tenantId === where.tenantId &&
                        row.organizationId === where.organizationId &&
                        row.conversationId === where.conversationId &&
                        row.threadId === where.threadId &&
                        row.agentKey === where.agentKey &&
                        where.evidenceId.value.includes(row.evidenceId)
                )
        }
        const checkpointRepository = {
            findOne: async ({ where }: { where: Partial<CopilotCheckpoint> }) =>
                checkpointRows.find(
                    (row) => row.thread_id === where.thread_id && row.checkpoint_id === where.checkpoint_id
                ),
            create: (row: CopilotCheckpoint) => row,
            save: async (row: CopilotCheckpoint) => {
                checkpointRows.push(row)
                return row
            }
        }
        const threads = {
            findByThreadId: async (threadId: string) =>
                Object.assign(new ChatConversationThread(), {
                    threadId,
                    conversationId: threadId === 'target' ? 'target-conversation' : 'source-conversation',
                    parentThreadId: threadId === 'source' ? 'ancestor' : null
                })
        }
        const manager = {
            getRepository: (entity: unknown) =>
                entity === ContextEvidence
                    ? evidenceRepository
                    : entity === CopilotCheckpoint
                      ? checkpointRepository
                      : {
                            findOne: ({ where }: { where: { threadId: string } }) =>
                                threads.findByThreadId(where.threadId)
                        }
        } as unknown as EntityManager
        const storage = new DatabaseContextEvidenceStorage(evidenceRepository as unknown as Repository<ContextEvidence>)
        const conversations = {
            assertAccess: async (id: string) =>
                Object.assign(new ChatConversation(), { id, tenantId: 'tenant', organizationId: 'org' })
        }
        const service = new ContextEvidenceService(storage, conversations, threads, { execute: jest.fn() })
        const scope = {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            conversationId: 'source-conversation',
            threadId: 'ancestor',
            agentKey: 'agent'
        }
        const original = await service.bind(scope).archive([
            new AIMessage({
                content: '',
                tool_calls: [{ id: 'call', name: 'shell', args: { script: 'exact original script' } }]
            }),
            new ToolMessage({ content: 'failed', status: 'error', tool_call_id: 'call' })
        ])
        const innerSummary = new HumanMessage({
            content: 'Prior work' + contextRecoveryReference(original),
            additional_kwargs: { compressed: true, contextEvidenceArchives: [original] }
        })
        const outer = await service.bind({ ...scope, threadId: 'source' }).archive([innerSummary])
        await service.bind({ ...scope, threadId: 'source' }).archive([new HumanMessage('UNREFERENCED_LATER_WORK')])
        const summary = new HumanMessage({
            content: 'Current work' + contextRecoveryReference(outer),
            additional_kwargs: { compressed: true, contextEvidenceArchives: [outer] }
        })
        const serializer = new MemorySaver().serde
        const checkpoint = {
            ...emptyCheckpoint(),
            channel_values: { messages: [summary], agent_worker: { messages: [summary] } }
        }
        const [type, bytes] = await serializer.dumpsTyped(checkpoint)
        const [, metadata] = await serializer.dumpsTyped({ source: 'update', step: 1, parents: {} })
        checkpointRows.push(
            Object.assign(new CopilotCheckpoint(), {
                thread_id: 'source',
                checkpoint_ns: '',
                checkpoint_id: checkpoint.id,
                type,
                checkpoint: bytes,
                metadata
            })
        )
        const anchor = { threadId: 'source', checkpointNs: '', checkpointId: checkpoint.id }
        const copy = () =>
            copyBranchCheckpoints({
                manager,
                serializer,
                messages: [
                    { inputCheckpoint: { version: 1, graphRevision: 'rev', checkpoint: anchor } }
                ] as ChatMessage[],
                sourceConversationId: scope.conversationId,
                targetConversationId: 'target-conversation',
                targetThreadId: 'target',
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'user',
                allowedThreadIds: new Set(['source', 'ancestor']),
                messageIds: new Map()
            })
        if (sourceState !== 'complete') {
            const index = evidenceRows.findIndex((row) => row.evidenceId === original.archiveId)
            if (sourceState === 'missing') evidenceRows.splice(index, 1)
            else evidenceRows[index].payload = '{}'
            await expect(copy()).rejects.toThrow()
            expect(checkpointRows.some((row) => row.thread_id === 'target')).toBe(false)
            return
        }
        await copy()
        expect(
            JSON.stringify(evidenceRows.filter((row) => row.conversationId === 'target-conversation'))
        ).not.toContain('UNREFERENCED_LATER_WORK')
        const copied = checkpointRows.find((row) => row.thread_id === 'target')!
        const restored = await serializer.loadsTyped(type, copied.checkpoint)
        const parsed = zCheckpoint(restored)
        const rebound = evidenceArchiveSchema.array().parse(parsed.additional_kwargs.contextEvidenceArchives)[0]
        expect(rebound.archiveId).not.toBe(outer.archiveId)
        expect(String(parsed.content)).toContain(rebound.archiveId)
        expect(String(parsed.content)).not.toContain(outer.archiveId)
        evidenceRows.splice(
            0,
            evidenceRows.length,
            ...evidenceRows.filter((row) => row.conversationId !== 'source-conversation')
        )
        checkpointRows.splice(0, checkpointRows.length, ...checkpointRows.filter((row) => row.thread_id !== 'source'))
        const target = service.bind({ ...scope, conversationId: 'target-conversation', threadId: 'target' })
        const recovered = await target.read(
            readContextEvidenceSchema.parse({ archiveId: rebound.archiveId, record: 0, part: 'content' })
        )
        const inner = JSON.stringify(recovered).match(/Archive ID: ([a-f0-9]{64})/)?.[1]
        expect(inner).toBeDefined()
        expect(
            await target.read(readContextEvidenceSchema.parse({ archiveId: inner, record: 0, part: 'arguments' }))
        ).toMatchObject({ text: JSON.stringify({ script: 'exact original script' }) })
        await expect(target.read(readContextEvidenceSchema.parse({ archiveId: original.archiveId }))).rejects.toThrow()
    }
)

function zCheckpoint(value: unknown): HumanMessage {
    if (
        !value ||
        typeof value !== 'object' ||
        !('channel_values' in value) ||
        !value.channel_values ||
        typeof value.channel_values !== 'object' ||
        !('messages' in value.channel_values) ||
        !Array.isArray(value.channel_values.messages) ||
        !(value.channel_values.messages[0] instanceof HumanMessage)
    )
        throw new Error('Missing checkpoint summary')
    return value.channel_values.messages[0]
}
